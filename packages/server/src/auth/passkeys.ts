import {
	type AuthenticationResponseJSON,
	type RegistrationResponseJSON,
	type WebAuthnCredential,
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

/** Who passkeys are for: the host users reach the server at, and its origin. */
export interface RelyingParty {
	id: string;
	origin: string;
}

/** What a registration is for, so a challenge can't be used for another. */
export type RegistrationPurpose = 'setup' | 'recover' | 'add';
type Purpose = RegistrationPurpose | 'login';

interface Challenge {
	purpose: Purpose;
	expiresAt: number;
	// The WebAuthn user handle the registration was offered for.
	userId?: string;
}

const CHALLENGE_TTL = 5 * 60 * 1000;
// Signing in needs no session, so anyone can ask for challenges. Past this
// many, the oldest are dropped rather than letting the map grow forever.
const MAX_CHALLENGES = 1000;

/**
 * WebAuthn ceremonies. Each one is two requests: options (with a challenge),
 * then the browser's response. Challenges are kept in memory and used once;
 * losing them on restart only cancels ceremonies in progress.
 */
export function createPasskeyCeremonies() {
	const challenges = new Map<string, Challenge>();

	function remember(challenge: string, entry: Omit<Challenge, 'expiresAt'>) {
		const now = Date.now();
		for (const [key, { expiresAt }] of challenges) {
			if (expiresAt <= now) challenges.delete(key);
		}
		while (challenges.size >= MAX_CHALLENGES) {
			challenges.delete(challenges.keys().next().value!);
		}
		challenges.set(challenge, { ...entry, expiresAt: now + CHALLENGE_TTL });
	}

	/**
	 * Checks a response's challenge was issued for this purpose and is still
	 * valid, consuming it. `found` receives the challenge's details.
	 */
	function consume(purpose: Purpose, found: (entry: Challenge) => void) {
		return (challenge: string) => {
			const entry = challenges.get(challenge);
			challenges.delete(challenge);
			if (!entry || entry.purpose !== purpose) return false;
			if (entry.expiresAt <= Date.now()) return false;
			found(entry);
			return true;
		};
	}

	return {
		async registrationOptions(
			rp: RelyingParty,
			purpose: RegistrationPurpose,
			userId: string,
			exclude: { id: string; transports?: string[] | null }[] = []
		) {
			const options = await generateRegistrationOptions({
				rpName: 'SyncVault',
				rpID: rp.id,
				userID: isoBase64URL.toBuffer(userId),
				// Only labels in the passkey picker: there's a single owner.
				userName: 'admin',
				userDisplayName: 'SyncVault owner',
				attestationType: 'none',
				excludeCredentials: exclude.map(({ id, transports }) => ({
					id,
					transports: transports ?? undefined,
				})),
				authenticatorSelection: {
					residentKey: 'required',
					// The passkey is the only factor.
					userVerification: 'required',
				},
			});
			remember(options.challenge, { purpose, userId });
			return options;
		},

		/** The new credential and its user handle, or undefined if invalid. */
		async verifyRegistration(
			rp: RelyingParty,
			purpose: RegistrationPurpose,
			response: RegistrationResponseJSON
		) {
			let userId: string | undefined;
			try {
				const result = await verifyRegistrationResponse({
					response,
					expectedChallenge: consume(purpose, (entry) => {
						userId = entry.userId;
					}),
					expectedOrigin: rp.origin,
					expectedRPID: rp.id,
					requireUserVerification: true,
				});
				if (!result.verified || !userId) return;
				return { credential: result.registrationInfo.credential, userId };
			} catch {
				return;
			}
		},

		async authenticationOptions(rp: RelyingParty) {
			// No allowCredentials: the browser offers any passkey it has for
			// this host, so signing in needs no username.
			const options = await generateAuthenticationOptions({
				rpID: rp.id,
				userVerification: 'required',
			});
			remember(options.challenge, { purpose: 'login' });
			return options;
		},

		/** The credential's new signature counter, or undefined if invalid. */
		async verifyAuthentication(
			rp: RelyingParty,
			response: AuthenticationResponseJSON,
			credential: WebAuthnCredential
		) {
			try {
				const result = await verifyAuthenticationResponse({
					response,
					expectedChallenge: consume('login', () => {}),
					expectedOrigin: rp.origin,
					expectedRPID: rp.id,
					credential,
					requireUserVerification: true,
				});
				if (!result.verified) return;
				return result.authenticationInfo.newCounter;
			} catch {
				return;
			}
		},
	};
}
