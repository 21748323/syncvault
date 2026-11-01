import { hashToken, randomToken, verifyPkce } from '../crypto.ts';
import type { Db } from '../db/index.ts';
import {
	accessTokens,
	apps,
	authCodes,
	devices,
	documents,
} from '../db/schema.ts';
import { storage } from '../store/documents.ts';
import type { AppIcon } from './app-icon.ts';
import { and, count, desc, eq, gt, isNotNull, lt, or, sql } from 'drizzle-orm';

// OAuth 2 authorization code flow with PKCE (RFC 6749, RFC 7636), for public
// clients only: apps run in the browser and can't keep a secret. An app's
// client_id is its origin, so apps don't need registering in advance. The
// owner approving one registers it, and each approval is a device.

const CODE_TTL = 60_000;
const NAME_MAX = 100;
// A device's last use is recorded at most this often.
const TOUCH_INTERVAL = 60_000;

export interface AuthorizeRequest {
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	state?: string;
	appName?: string;
	deviceName?: string;
}

export class OAuthError extends Error {
	constructor(
		readonly error: string,
		readonly description: string
	) {
		super(description);
	}
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** https origins, plus http on this machine for development. */
function isValidClientId(clientId: string) {
	const url = URL.parse(clientId);
	if (!url || url.origin !== clientId) return false;
	return (
		url.protocol === 'https:' ||
		(url.protocol === 'http:' && LOOPBACK.has(url.hostname))
	);
}

function optionalName(value: unknown) {
	if (typeof value !== 'string') return;
	return value.trim().slice(0, NAME_MAX) || undefined;
}

/**
 * Checks an authorization request, given as query parameters or JSON. Throws
 * an OAuthError if it's invalid; in that case the client must not be
 * redirected to, since its redirect_uri can't be trusted.
 */
export function parseAuthorizeRequest(
	params: Record<string, unknown>
): AuthorizeRequest {
	const invalid = (description: string) =>
		new OAuthError('invalid_request', description);
	const {
		response_type,
		client_id,
		redirect_uri,
		code_challenge,
		code_challenge_method,
		state,
	} = params;

	if (typeof client_id !== 'string' || !isValidClientId(client_id)) {
		throw invalid(
			'client_id must be the app origin: https, or http on localhost'
		);
	}
	const redirect =
		typeof redirect_uri === 'string' ? URL.parse(redirect_uri) : null;
	if (!redirect || redirect.origin !== client_id || redirect.hash) {
		throw invalid(
			'redirect_uri must be on the client_id origin, without a fragment'
		);
	}
	if (response_type !== 'code') {
		throw invalid('response_type must be code');
	}
	if (code_challenge_method !== 'S256') {
		throw invalid('code_challenge_method must be S256');
	}
	if (
		typeof code_challenge !== 'string' ||
		!/^[\w.~-]{43,128}$/.test(code_challenge)
	) {
		throw invalid('code_challenge is missing or malformed');
	}
	if (state !== undefined && typeof state !== 'string') {
		throw invalid('state must be a string');
	}
	return {
		clientId: client_id,
		redirectUri: redirect_uri as string,
		codeChallenge: code_challenge,
		state,
		appName: optionalName(params.app_name),
		deviceName: optionalName(params.device_name),
	};
}

// What the dashboard sees of an app: never the icon's bytes, which have their
// own route.
const appColumns = {
	id: apps.id,
	clientId: apps.clientId,
	name: apps.name,
	createdAt: apps.createdAt,
	lastSeenAt: apps.lastSeenAt,
	hasIcon: sql<boolean>`${apps.icon} is not null`.mapWith(Boolean),
};

function redirectTo(request: AuthorizeRequest, params: Record<string, string>) {
	const url = new URL(request.redirectUri);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	if (request.state !== undefined) url.searchParams.set('state', request.state);
	return url.href;
}

export function createOAuth(
	db: Db,
	accessTokenTtl: number,
	fetchIcon: (origin: string) => Promise<AppIcon | null>
) {
	type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

	// Icons are fetched in the background, so approving never waits on the
	// app's server. Tracked so tests can wait for them.
	const iconFetches = new Set<Promise<void>>();

	function loadIcon(appId: number, origin: string) {
		const fetching = fetchIcon(origin)
			.then((icon) => {
				if (!icon) return;
				db.update(apps)
					.set({ icon: Buffer.from(icon.bytes), iconType: icon.type })
					.where(eq(apps.id, appId))
					.run();
			})
			.catch(() => {})
			.finally(() => iconFetches.delete(fetching));
		iconFetches.add(fetching);
	}

	function issueAccessToken(tx: Tx | Db, deviceId: number) {
		const token = randomToken();
		tx.insert(accessTokens)
			.values({
				tokenHash: hashToken(token),
				deviceId,
				expiresAt: new Date(Date.now() + accessTokenTtl * 1000),
			})
			.run();
		return {
			access_token: token,
			token_type: 'Bearer',
			expires_in: accessTokenTtl,
		};
	}

	const invalidGrant = (description: string) =>
		new OAuthError('invalid_grant', description);

	return {
		findApp(clientId: string) {
			return db.select().from(apps).where(eq(apps.clientId, clientId)).get();
		},

		/**
		 * The owner approved the request: registers the app if it's new, and
		 * returns where to send the browser, with a code for the app.
		 */
		approve(request: AuthorizeRequest) {
			const name = request.appName ?? new URL(request.clientId).host;
			const isNew = !db
				.select({ id: apps.id })
				.from(apps)
				.where(eq(apps.clientId, request.clientId))
				.get();
			const app = db
				.insert(apps)
				.values({ clientId: request.clientId, name })
				.onConflictDoUpdate({
					target: apps.clientId,
					// Keep the stored name unless the app gave a new one.
					set: request.appName ? { name } : { clientId: request.clientId },
				})
				.returning({ id: apps.id })
				.get()!;
			if (isNew) loadIcon(app.id, request.clientId);
			const code = randomToken();
			db.insert(authCodes)
				.values({
					codeHash: hashToken(code),
					appId: app.id,
					redirectUri: request.redirectUri,
					codeChallenge: request.codeChallenge,
					deviceName: request.deviceName,
					expiresAt: new Date(Date.now() + CODE_TTL),
				})
				.run();
			return redirectTo(request, { code });
		},

		deny(request: AuthorizeRequest) {
			return redirectTo(request, { error: 'access_denied' });
		},

		exchangeCode(params: {
			code: string;
			clientId: string;
			redirectUri: string;
			codeVerifier: string;
		}) {
			// Deleted on first use, whether or not the exchange succeeds. Outside
			// the transaction below, so a failed exchange doesn't roll it back.
			const code = db
				.delete(authCodes)
				.where(eq(authCodes.codeHash, hashToken(params.code)))
				.returning()
				.get();
			if (!code || code.expiresAt < new Date()) {
				throw invalidGrant('The code is invalid, used or expired');
			}
			const app = db.select().from(apps).where(eq(apps.id, code.appId)).get();
			if (app?.clientId !== params.clientId) {
				throw invalidGrant('The code was issued to another client');
			}
			if (code.redirectUri !== params.redirectUri) {
				throw invalidGrant('redirect_uri does not match');
			}
			if (!verifyPkce(params.codeVerifier, code.codeChallenge)) {
				throw invalidGrant('code_verifier does not match');
			}

			return db.transaction((tx) => {
				const refreshToken = randomToken();
				const device = tx
					.insert(devices)
					.values({
						appId: app.id,
						name: code.deviceName ?? 'Unnamed device',
						refreshTokenHash: hashToken(refreshToken),
					})
					.returning({ id: devices.id })
					.get()!;
				return {
					...issueAccessToken(tx, device.id),
					refresh_token: refreshToken,
				};
			});
		},

		/**
		 * A new access token for a device. Refresh tokens aren't rotated: each
		 * browser tab syncs separately, and tabs refreshing at once would
		 * invalidate each other's tokens.
		 */
		refresh(params: { refreshToken: string; clientId: string }) {
			const row = db
				.select({ deviceId: devices.id, clientId: apps.clientId })
				.from(devices)
				.innerJoin(apps, eq(apps.id, devices.appId))
				.where(eq(devices.refreshTokenHash, hashToken(params.refreshToken)))
				.get();
			if (row?.clientId !== params.clientId) {
				throw invalidGrant('The refresh token is invalid or revoked');
			}
			return issueAccessToken(db, row.deviceId);
		},

		/**
		 * Signs a device out, given either of its tokens (RFC 7009). Returns the
		 * device's id, if the token was valid.
		 */
		revoke(token: string) {
			const tokenHash = hashToken(token);
			return db
				.delete(devices)
				.where(
					or(
						eq(devices.refreshTokenHash, tokenHash),
						eq(
							devices.id,
							db
								.select({ deviceId: accessTokens.deviceId })
								.from(accessTokens)
								.where(eq(accessTokens.tokenHash, tokenHash))
						)
					)
				)
				.returning({ id: devices.id })
				.get()?.id;
		},

		/** The device and app an access token belongs to, if it's valid. */
		authenticate(token: string) {
			const row = db
				.select({
					deviceId: devices.id,
					appId: devices.appId,
					lastUsedAt: devices.lastUsedAt,
				})
				.from(accessTokens)
				.innerJoin(devices, eq(devices.id, accessTokens.deviceId))
				.where(
					and(
						eq(accessTokens.tokenHash, hashToken(token)),
						gt(accessTokens.expiresAt, new Date())
					)
				)
				.get();
			if (!row) return;
			const now = new Date();
			if (!row.lastUsedAt || +now - +row.lastUsedAt > TOUCH_INTERVAL) {
				db.transaction((tx) => {
					tx.update(devices)
						.set({ lastUsedAt: now })
						.where(eq(devices.id, row.deviceId))
						.run();
					tx.update(apps)
						.set({ lastSeenAt: now })
						.where(eq(apps.id, row.appId))
						.run();
				});
			}
			return { deviceId: row.deviceId, appId: row.appId };
		},

		listApps() {
			return db
				.select({
					...appColumns,
					devices: sql<number>`(select count(*) from ${devices} where ${devices.appId} = ${apps.id})`,
					storage: sql<number>`(select ${storage} from ${documents} where ${documents.appId} = ${apps.id})`,
				})
				.from(apps)
				.orderBy(desc(apps.lastSeenAt), apps.name)
				.all();
		},

		getApp(id: number) {
			return db.select(appColumns).from(apps).where(eq(apps.id, id)).get();
		},

		getAppIcon(id: number) {
			return db
				.select({ bytes: apps.icon, type: apps.iconType })
				.from(apps)
				.where(and(eq(apps.id, id), isNotNull(apps.icon)))
				.get() as { bytes: Buffer; type: string } | undefined;
		},

		/** Resolves once icon fetches in progress have finished. For tests. */
		async iconsFetched() {
			await Promise.all(iconFetches);
		},

		deviceCount(appId: number) {
			return db
				.select({ count: count() })
				.from(devices)
				.where(eq(devices.appId, appId))
				.get()!.count;
		},

		/** Removes an app with all its devices and data. */
		deleteApp(id: number) {
			return db.delete(apps).where(eq(apps.id, id)).run().changes > 0;
		},

		listDevices(appId: number) {
			return db
				.select({
					id: devices.id,
					name: devices.name,
					createdAt: devices.createdAt,
					lastUsedAt: devices.lastUsedAt,
				})
				.from(devices)
				.where(eq(devices.appId, appId))
				.orderBy(desc(devices.lastUsedAt))
				.all();
		},

		revokeDevice(id: number) {
			return db.delete(devices).where(eq(devices.id, id)).run().changes > 0;
		},

		deleteExpired() {
			const now = new Date();
			db.delete(accessTokens).where(lt(accessTokens.expiresAt, now)).run();
			db.delete(authCodes).where(lt(authCodes.expiresAt, now)).run();
		},
	};
}

export type OAuth = ReturnType<typeof createOAuth>;
