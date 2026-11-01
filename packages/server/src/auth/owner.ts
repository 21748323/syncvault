import { hashToken, randomToken, safeEqual } from '../crypto.ts';
import type { Db } from '../db/index.ts';
import { owner, passkeys, recoveryTokens, sessions } from '../db/schema.ts';
import { type RelyingParty, createPasskeyCeremonies } from './passkeys.ts';
import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
	WebAuthnCredential,
} from '@simplewebauthn/server';
import { and, asc, count, eq, gt, lt } from 'drizzle-orm';

export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
export const RECOVERY_TOKEN_TTL = 60 * 60 * 1000;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * The instance's single owner: created once by setup, then signs in with a
 * passkey to manage the server and to approve apps. Whoever can run commands
 * on the server can recover access with a token from `bun run recover`.
 */
export function createOwnerAuth(db: Db, setupToken: string) {
	const ceremonies = createPasskeyCeremonies();

	function getRow() {
		return db.select().from(owner).get();
	}

	function isSetupComplete() {
		return getRow() !== undefined;
	}

	function isRecoveryToken(token: string) {
		const row = db
			.select({ tokenHash: recoveryTokens.tokenHash })
			.from(recoveryTokens)
			.where(
				and(
					eq(recoveryTokens.tokenHash, hashToken(token)),
					gt(recoveryTokens.expiresAt, new Date())
				)
			)
			.get();
		return row !== undefined;
	}

	function createSession(tx: Db | Tx = db) {
		const token = randomToken();
		const expiresAt = new Date(Date.now() + SESSION_TTL);
		tx.insert(sessions)
			.values({ tokenHash: hashToken(token), expiresAt })
			.run();
		return { token, expiresAt };
	}

	function insertPasskey(
		tx: Db | Tx,
		credential: WebAuthnCredential,
		name = 'Passkey'
	) {
		const { changes } = tx
			.insert(passkeys)
			.values({
				id: credential.id,
				publicKey: Buffer.from(credential.publicKey),
				counter: credential.counter,
				transports: credential.transports ?? null,
				name,
			})
			.onConflictDoNothing()
			.run();
		return changes > 0;
	}

	return {
		isSetupComplete,

		/**
		 * Setup creates the owner with their first passkey. It requires the
		 * setup token printed at startup, so whoever reaches a fresh instance
		 * first can't claim it.
		 */
		async setupOptions(rp: RelyingParty, token: string) {
			if (isSetupComplete()) return 'already_complete';
			if (!safeEqual(token, setupToken)) return 'invalid_token';
			return ceremonies.registrationOptions(rp, 'setup', randomToken());
		},

		async setup(
			rp: RelyingParty,
			token: string,
			response: RegistrationResponseJSON,
			name?: string
		) {
			if (isSetupComplete()) return 'already_complete';
			if (!safeEqual(token, setupToken)) return 'invalid_token';
			const result = await ceremonies.verifyRegistration(rp, 'setup', response);
			if (!result) return 'invalid_response';
			return db.transaction((tx) => {
				const { changes } = tx
					.insert(owner)
					.values({ id: 1, webauthnUserId: result.userId })
					.onConflictDoNothing()
					.run();
				// Lost a race with another setup request.
				if (changes === 0) return 'already_complete';
				insertPasskey(tx, result.credential, name);
				return { session: createSession(tx) };
			});
		},

		/**
		 * Issues the token that `recover` needs, replacing any earlier one.
		 * Undefined until setup is complete.
		 */
		issueRecoveryToken() {
			if (!isSetupComplete()) return;
			const token = randomToken();
			const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL);
			db.transaction((tx) => {
				tx.delete(recoveryTokens).run();
				tx.insert(recoveryTokens)
					.values({ tokenHash: hashToken(token), expiresAt })
					.run();
			});
			return { token, expiresAt };
		},

		async recoverOptions(rp: RelyingParty, token: string) {
			const row = getRow();
			if (!row || !isRecoveryToken(token)) return 'invalid_token';
			return ceremonies.registrationOptions(rp, 'recover', row.webauthnUserId);
		},

		/**
		 * Registers a new passkey with a recovery token, removing every other
		 * passkey and session: a lost device may be a stolen one.
		 */
		async recover(
			rp: RelyingParty,
			token: string,
			response: RegistrationResponseJSON,
			name?: string
		) {
			if (!isRecoveryToken(token)) return 'invalid_token';
			const result = await ceremonies.verifyRegistration(
				rp,
				'recover',
				response
			);
			if (!result) return 'invalid_response';
			return db.transaction((tx) => {
				const { changes } = tx
					.delete(recoveryTokens)
					.where(eq(recoveryTokens.tokenHash, hashToken(token)))
					.run();
				// Already used by a concurrent request.
				if (changes === 0) return 'invalid_token';
				tx.delete(passkeys).run();
				tx.delete(sessions).run();
				insertPasskey(tx, result.credential, name);
				return { session: createSession(tx) };
			});
		},

		loginOptions(rp: RelyingParty) {
			return ceremonies.authenticationOptions(rp);
		},

		async login(rp: RelyingParty, response: AuthenticationResponseJSON) {
			const passkey = db
				.select()
				.from(passkeys)
				.where(eq(passkeys.id, response.id))
				.get();
			if (!passkey) return;
			const newCounter = await ceremonies.verifyAuthentication(rp, response, {
				id: passkey.id,
				publicKey: new Uint8Array(passkey.publicKey),
				counter: passkey.counter,
				transports: passkey.transports ?? undefined,
			});
			if (newCounter === undefined) return;
			db.update(passkeys)
				.set({ counter: newCounter, lastUsedAt: new Date() })
				.where(eq(passkeys.id, passkey.id))
				.run();
			return createSession();
		},

		getOwner(sessionToken: string | undefined) {
			if (!sessionToken) return;
			const session = db
				.select({ tokenHash: sessions.tokenHash })
				.from(sessions)
				.where(
					and(
						eq(sessions.tokenHash, hashToken(sessionToken)),
						gt(sessions.expiresAt, new Date())
					)
				)
				.get();
			if (!session) return;
			return db.select({ createdAt: owner.createdAt }).from(owner).get();
		},

		logout(sessionToken: string) {
			db.delete(sessions)
				.where(eq(sessions.tokenHash, hashToken(sessionToken)))
				.run();
		},

		listPasskeys() {
			return db
				.select({
					id: passkeys.id,
					name: passkeys.name,
					createdAt: passkeys.createdAt,
					lastUsedAt: passkeys.lastUsedAt,
				})
				.from(passkeys)
				.orderBy(asc(passkeys.createdAt))
				.all();
		},

		/** For a signed-in owner adding another device. */
		async addPasskeyOptions(rp: RelyingParty) {
			const row = getRow();
			if (!row) return;
			const existing = db
				.select({ id: passkeys.id, transports: passkeys.transports })
				.from(passkeys)
				.all();
			return ceremonies.registrationOptions(
				rp,
				'add',
				row.webauthnUserId,
				existing
			);
		},

		async addPasskey(
			rp: RelyingParty,
			response: RegistrationResponseJSON,
			name?: string
		) {
			const result = await ceremonies.verifyRegistration(rp, 'add', response);
			if (!result) return false;
			return insertPasskey(db, result.credential, name);
		},

		renamePasskey(id: string, name: string) {
			const { changes } = db
				.update(passkeys)
				.set({ name })
				.where(eq(passkeys.id, id))
				.run();
			return changes > 0;
		},

		/** Refuses to remove the last passkey, which would lock the owner out. */
		deletePasskey(id: string) {
			return db.transaction((tx) => {
				const [{ total }] = tx
					.select({ total: count() })
					.from(passkeys)
					.all() as [{ total: number }];
				const exists = tx
					.select({ id: passkeys.id })
					.from(passkeys)
					.where(eq(passkeys.id, id))
					.get();
				if (!exists) return 'not_found';
				if (total <= 1) return 'last_passkey';
				tx.delete(passkeys).where(eq(passkeys.id, id)).run();
				return 'deleted';
			});
		},

		deleteExpired() {
			const now = new Date();
			db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
			db.delete(recoveryTokens).where(lt(recoveryTokens.expiresAt, now)).run();
		},
	};
}

export type OwnerAuth = ReturnType<typeof createOwnerAuth>;
