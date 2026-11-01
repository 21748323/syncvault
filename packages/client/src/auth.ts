import { deviceName } from './device-name.ts';
import { type Env, jsonItem } from './env.ts';
import { createPkce, randomString } from './pkce.ts';

// Connecting this app to a server: the OAuth 2 authorization code flow with
// PKCE, then authorized requests that refresh the access token as needed.

export interface Connection {
	serverUrl: string;
	// Missing once the server rejected the refresh token (the device was
	// revoked). The server URL is kept so the app can offer to reconnect.
	refreshToken?: string;
	accessToken?: string;
	accessTokenExpiresAt?: number;
}

interface PendingConnect {
	serverUrl: string;
	state: string;
	verifier: string;
	redirectUri: string;
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
}

/** Thrown when the server no longer accepts this device's tokens. */
export class UnauthorizedError extends Error {
	constructor() {
		super('This device is no longer authorized');
	}
}

/** Thrown when a server can't be connected to, with a reason to show. */
export class ConnectError extends Error {}

/**
 * Thrown when the server can't be reached at all (offline, or the server is
 * down). The vault's status shows this as `offline`.
 */
export class NetworkError extends Error {
	constructor(cause: unknown) {
		super("Can't reach the server", { cause });
	}
}

/** Reads an OAuth error response's description, for showing to the user. */
async function describeOAuthError(response: Response) {
	try {
		const body = (await response.json()) as { error_description?: string };
		if (body.error_description) return body.error_description;
	} catch {
		// Not JSON.
	}
	return `the server responded with ${response.status}`;
}

// Refresh a little before expiry, so requests in flight don't fail.
const EXPIRY_MARGIN = 30_000;

/**
 * The server's base URL from what the user typed. A bare address like
 * `sync.example.com` means https; `http://` has to be typed out (e.g. for
 * localhost).
 */
export function normalizeServerUrl(input: string) {
	const trimmed = input.trim();
	// Checked for `://` rather than parsed, as `localhost:3000` would parse
	// with `localhost:` as its scheme.
	const url = URL.parse(
		/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
	);
	if (
		!url ||
		!url.hostname ||
		(url.protocol !== 'https:' && url.protocol !== 'http:')
	) {
		throw new ConnectError('Enter the server address, like sync.example.com');
	}
	return url.origin + url.pathname.replace(/\/+$/, '');
}

interface AuthOptions {
	env: Env;
	storageKey: string;
	appName?: string;
	deviceName?: string;
	redirectUri?: string;
	onConnectionChange(connection: Connection | undefined): void;
}

export function createAuth(options: AuthOptions) {
	const { env } = options;
	const stored = jsonItem<Connection>(env.localStorage, options.storageKey);
	const pending = jsonItem<PendingConnect>(
		env.sessionStorage,
		`${options.storageKey}:pending`
	);
	const clientId = new URL(env.currentUrl()).origin;

	// fetch rejects when the server can't be reached; aborts (e.g. closing the
	// event stream) are passed through as they are.
	async function reach(url: string, init?: RequestInit) {
		try {
			return await env.fetch(url, init);
		} catch (error) {
			if ((error as Error)?.name === 'AbortError') throw error;
			throw new NetworkError(error);
		}
	}

	function save(connection: Connection | undefined) {
		if (connection) stored.set(connection);
		else stored.remove();
		options.onConnectionChange(connection);
	}

	async function tokenRequest(
		serverUrl: string,
		params: Record<string, string>
	) {
		return reach(`${serverUrl}/oauth/token`, {
			method: 'POST',
			body: new URLSearchParams({ client_id: clientId, ...params }),
		});
	}

	function withTokens(
		serverUrl: string,
		tokens: TokenResponse,
		refreshToken: string
	): Connection {
		return {
			serverUrl,
			refreshToken,
			accessToken: tokens.access_token,
			accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
		};
	}

	// One refresh at a time; concurrent requests share it.
	let refreshing: Promise<Connection> | undefined;

	function refresh(): Promise<Connection> {
		refreshing ??= (async () => {
			const connection = stored.get();
			if (!connection?.refreshToken) throw new UnauthorizedError();
			const response = await tokenRequest(connection.serverUrl, {
				grant_type: 'refresh_token',
				refresh_token: connection.refreshToken,
			});
			if (response.status === 400) {
				// Revoked or unknown. Keep the URL, drop the tokens.
				save({ serverUrl: connection.serverUrl });
				throw new UnauthorizedError();
			}
			if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);
			const updated = withTokens(
				connection.serverUrl,
				(await response.json()) as TokenResponse,
				connection.refreshToken
			);
			// Not reported as a connection change: nothing visible changed.
			stored.set(updated);
			return updated;
		})().finally(() => {
			refreshing = undefined;
		});
		return refreshing;
	}

	async function accessToken() {
		// Read fresh each time: another tab may have refreshed already.
		let connection = stored.get();
		if (!connection?.refreshToken) throw new UnauthorizedError();
		if (
			!connection.accessToken ||
			(connection.accessTokenExpiresAt ?? 0) - EXPIRY_MARGIN < Date.now()
		) {
			connection = await refresh();
		}
		return { serverUrl: connection.serverUrl, token: connection.accessToken! };
	}

	return {
		connection: () => stored.get(),

		/**
		 * Checks that the URL is a SyncVault server, then sends the browser to
		 * its consent screen. The browser comes back to `redirectUri`, where
		 * `completeConnect` finishes the job.
		 */
		async beginConnect(input: string) {
			const serverUrl = normalizeServerUrl(input);
			let info: { name?: string; setupComplete?: boolean };
			try {
				const response = await env.fetch(`${serverUrl}/api/info`);
				info = await response.json();
			} catch {
				throw new ConnectError(
					`Couldn't reach a SyncVault server at ${serverUrl}`
				);
			}
			if (info.name !== 'SyncVault') {
				throw new ConnectError(`${serverUrl} isn't a SyncVault server`);
			}
			if (!info.setupComplete) {
				throw new ConnectError(`${serverUrl} hasn't been set up yet`);
			}

			const { verifier, challenge } = await createPkce();
			const current = new URL(env.currentUrl());
			const redirectUri =
				options.redirectUri ?? current.origin + current.pathname;
			const state = randomString();
			pending.set({ serverUrl, state, verifier, redirectUri });

			const query = new URLSearchParams({
				response_type: 'code',
				client_id: clientId,
				redirect_uri: redirectUri,
				code_challenge: challenge,
				code_challenge_method: 'S256',
				state,
				device_name: options.deviceName ?? deviceName(env.userAgent),
			});
			if (options.appName) query.set('app_name', options.appName);
			env.navigate(`${serverUrl}/oauth/authorize?${query}`);
		},

		/**
		 * Finishes a connection if this page load is the redirect back from the
		 * server. Returns true if it connected, false if this wasn't a redirect
		 * for us, and throws ConnectError if the owner denied access.
		 */
		async completeConnect() {
			const url = new URL(env.currentUrl());
			const params = url.searchParams;
			const started = pending.get();
			if (!started || params.get('state') !== started.state) return false;

			pending.remove();
			const code = params.get('code');
			const error = params.get('error');
			const errorDescription = params.get('error_description');
			for (const key of [
				'code',
				'state',
				'error',
				'error_description',
				'iss',
			]) {
				params.delete(key);
			}
			await env.replaceUrl(url.href);

			if (error === 'access_denied') {
				throw new ConnectError('Access was denied on the server');
			}
			if (!code) {
				throw new ConnectError(
					`Couldn't connect: ${errorDescription ?? error}`
				);
			}
			let response: Response;
			try {
				response = await tokenRequest(started.serverUrl, {
					grant_type: 'authorization_code',
					code,
					redirect_uri: started.redirectUri,
					code_verifier: started.verifier,
				});
			} catch {
				throw new ConnectError(
					"Couldn't reach the server to finish connecting. Try connecting again."
				);
			}
			if (!response.ok) {
				throw new ConnectError(
					`Couldn't connect: ${await describeOAuthError(response)}`
				);
			}
			const tokens = (await response.json()) as TokenResponse;
			save(withTokens(started.serverUrl, tokens, tokens.refresh_token!));
			return true;
		},

		/**
		 * A request to the connected server. Refreshes the access token when
		 * it's expired or rejected, and throws UnauthorizedError if the device
		 * has been revoked.
		 */
		async request(path: string, init: RequestInit = {}) {
			const send = ({
				serverUrl,
				token,
			}: {
				serverUrl: string;
				token: string;
			}) =>
				reach(`${serverUrl}${path}`, {
					...init,
					headers: { ...init.headers, Authorization: `Bearer ${token}` },
				});
			const response = await send(await accessToken());
			if (response.status !== 401) return response;
			// Rejected before it expired (e.g. tokens were cleaned up), so get
			// a new one and try once more.
			const refreshed = await refresh();
			const retried = await send({
				serverUrl: refreshed.serverUrl,
				token: refreshed.accessToken!,
			});
			if (retried.status === 401) {
				const connection = stored.get();
				save(connection && { serverUrl: connection.serverUrl });
				throw new UnauthorizedError();
			}
			return retried;
		},

		/** Signs this device out on the server (if reachable) and forgets it. */
		async disconnect() {
			const connection = stored.get();
			save(undefined);
			if (!connection?.refreshToken) return;
			try {
				await env.fetch(`${connection.serverUrl}/oauth/revoke`, {
					method: 'POST',
					body: new URLSearchParams({ token: connection.refreshToken }),
				});
			} catch {
				// Offline: the owner can still revoke it from the dashboard.
			}
		},
	};
}

export type Auth = ReturnType<typeof createAuth>;
