import { createApp } from './app.ts';
import { RECOVERY_TOKEN_TTL } from './auth/owner.ts';
import { loadConfig } from './config.ts';
import { randomToken } from './crypto.ts';
import { createDb } from './db/index.ts';
import { type Services, createServices } from './services.ts';
import { type TestPasskey, createTestPasskey } from './test/authenticator.ts';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SETUP_TOKEN = 'test-setup-token';
// Tests never fetch from an app's real origin.
const noIcon = async () => null;
const APP = 'http://localhost:5173';

let services: Services;
let app: ReturnType<typeof createApp>;
// The owner's passkey, registered by setup().
let passkey: TestPasskey;

beforeEach(async () => {
	services = createServices(
		createDb(':memory:'),
		loadConfig({}),
		SETUP_TOKEN,
		noIcon
	);
	app = createApp(services);
	passkey = await createTestPasskey();
});
afterEach(() => services.events.closeAll());

function request(path: string, init: RequestInit = {}) {
	return app.handle(new Request(`http://localhost:3000${path}`, init));
}

function json(path: string, body: unknown, init: RequestInit = {}) {
	return request(path, {
		method: 'POST',
		...init,
		headers: { 'Content-Type': 'application/json', ...init.headers },
		body: JSON.stringify(body),
	});
}

function sessionCookie(response: Response) {
	return response.headers.get('set-cookie')!.split(';')[0]!;
}

/** Registers `key` through a route's two steps: options, then the response. */
async function register(
	key: TestPasskey,
	path: string,
	body: object = {},
	init: RequestInit = {}
) {
	const options = await json(`${path}/options`, body, init);
	expect(options.status).toBe(200);
	const response = await key.register(await options.json());
	return json(path, { ...body, response }, init);
}

async function setup() {
	const response = await register(passkey, '/api/setup', {
		setupToken: SETUP_TOKEN,
	});
	expect(response.status).toBe(201);
	return sessionCookie(response);
}

async function login(key = passkey, init: RequestInit = {}) {
	const options = await json('/api/admin/login/options', {}, init);
	const response = await key.authenticate(await options.json());
	return json('/api/admin/login', { response }, init);
}

const withCookie = (cookie: string) => ({ headers: { Cookie: cookie } });

function pkce() {
	const verifier = randomToken();
	const hash = new Bun.CryptoHasher('sha256').update(verifier).digest();
	return { verifier, challenge: Buffer.from(hash).toString('base64url') };
}

function authorizeParams(challenge: string, clientId = APP) {
	return {
		response_type: 'code',
		client_id: clientId,
		redirect_uri: `${clientId}/callback`,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state: 'xyz',
		app_name: 'Todos',
		device_name: 'Laptop',
	};
}

/** Runs the whole OAuth flow, returning the app's tokens. */
async function connectApp(cookie: string, clientId = APP) {
	const { verifier, challenge } = pkce();
	const params = authorizeParams(challenge, clientId);
	const approved = await json(
		'/api/oauth/authorize',
		{ ...params, approve: true },
		{ headers: { Cookie: cookie } }
	);
	expect(approved.status).toBe(200);
	const { redirectTo } = (await approved.json()) as { redirectTo: string };
	const redirect = new URL(redirectTo);
	expect(redirect.searchParams.get('state')).toBe('xyz');
	const response = await request('/oauth/token', {
		method: 'POST',
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code: redirect.searchParams.get('code')!,
			client_id: clientId,
			redirect_uri: params.redirect_uri,
			code_verifier: verifier,
		}),
	});
	expect(response.status).toBe(200);
	return (await response.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function push(token: string, collection: string, changes: object) {
	return json(
		`/api/collections/${collection}/changes`,
		{ added: [], modified: [], modifiedFields: {}, removed: [], ...changes },
		{ headers: bearer(token) }
	);
}

describe('setup', () => {
	test('reports whether setup is complete', async () => {
		const before = await request('/api/info');
		expect(await before.json()).toMatchObject({
			name: 'SyncVault',
			url: 'http://localhost:3000',
			setupComplete: false,
		});
		await setup();
		const after = await request('/api/info');
		expect(await after.json()).toMatchObject({ setupComplete: true });
	});

	test('needs the setup token', async () => {
		const options = await json('/api/setup/options', { setupToken: 'wrong' });
		expect(options.status).toBe(403);
	});

	test('checks the setup token again when registering', async () => {
		const options = await json('/api/setup/options', {
			setupToken: SETUP_TOKEN,
		});
		const response = await passkey.register(await options.json());
		const setup = await json('/api/setup', { setupToken: 'wrong', response });
		expect(setup.status).toBe(403);
		expect(services.owner.isSetupComplete()).toBe(false);
	});

	test('only happens once', async () => {
		await setup();
		const again = await json('/api/setup/options', {
			setupToken: SETUP_TOKEN,
		});
		expect(again.status).toBe(409);
	});

	test('rejects a passkey for another site', async () => {
		const other = await createTestPasskey('https://evil.example');
		const response = await register(other, '/api/setup', {
			setupToken: SETUP_TOKEN,
		});
		expect(response.status).toBe(400);
		expect(services.owner.isSetupComplete()).toBe(false);
	});

	test('rejects bodies that are not JSON', async () => {
		const response = await request('/api/setup/options', {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: JSON.stringify({ setupToken: SETUP_TOKEN }),
		});
		expect(response.status).not.toBeLessThan(400);
	});
});

describe('admin', () => {
	test('signs in with a passkey and out', async () => {
		await setup();
		const signedIn = await login();
		expect(signedIn.status).toBe(204);
		const cookie = sessionCookie(signedIn);
		const me = await request('/api/admin/me', withCookie(cookie));
		expect(me.status).toBe(200);
		await json('/api/admin/logout', {}, withCookie(cookie));
		const after = await request('/api/admin/me', withCookie(cookie));
		expect(after.status).toBe(401);
	});

	test('limits failed sign-ins', async () => {
		await setup();
		const unknown = await createTestPasskey();
		for (let i = 0; i < 5; i++) {
			expect((await login(unknown)).status).toBe(401);
		}
		expect((await login()).status).toBe(429);
	});

	test('uses each challenge once', async () => {
		await setup();
		const options = await json('/api/admin/login/options', {});
		const response = await passkey.authenticate(await options.json());
		const first = await json('/api/admin/login', { response });
		expect(first.status).toBe(204);
		const replayed = await json('/api/admin/login', { response });
		expect(replayed.status).toBe(401);
	});

	test("won't sign in with another ceremony's challenge", async () => {
		const cookie = await setup();
		const options = await json(
			'/api/admin/passkeys/options',
			{},
			withCookie(cookie)
		);
		const response = await passkey.authenticate(await options.json());
		const signedIn = await json('/api/admin/login', { response });
		expect(signedIn.status).toBe(401);
	});

	test('needs a session', async () => {
		await setup();
		expect((await request('/api/admin/apps')).status).toBe(401);
		expect((await json('/api/admin/passkeys/options', {})).status).toBe(401);
	});

	test('adds, renames and removes passkeys', async () => {
		const cookie = await setup();
		const phone = await createTestPasskey();
		const added = await register(
			phone,
			'/api/admin/passkeys',
			{ name: 'Phone' },
			withCookie(cookie)
		);
		expect(added.status).toBe(201);
		expect((await login(phone)).status).toBe(204);

		const list = async () => {
			const response = await request('/api/admin/passkeys', withCookie(cookie));
			return (await response.json()) as { id: string; name: string }[];
		};
		expect((await list()).map((p) => p.name)).toEqual(['Passkey', 'Phone']);

		const renamed = await json(
			`/api/admin/passkeys/${phone.id}`,
			{ name: 'Old phone' },
			{ method: 'PATCH', ...withCookie(cookie) }
		);
		expect(renamed.status).toBe(204);
		expect((await list())[1]!.name).toBe('Old phone');

		const remove = (id: string) =>
			request(`/api/admin/passkeys/${id}`, {
				method: 'DELETE',
				...withCookie(cookie),
			});
		expect((await remove(phone.id)).status).toBe(204);
		expect((await login(phone)).status).toBe(401);
		expect((await remove(phone.id)).status).toBe(404);
		expect((await remove(passkey.id)).status).toBe(409);
	});

	test('lists apps with their devices and storage', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		await push(access_token, 'todos', {
			added: [{ id: '1', title: 'Café' }],
		});
		const apps = await request('/api/admin/apps', {
			headers: { Cookie: cookie },
		});
		const [listed] = (await apps.json()) as { id: number }[];
		expect(listed).toMatchObject({
			clientId: APP,
			name: 'Todos',
			devices: 1,
			// Bytes of the stored JSON, {"id":"1","title":"Café"}: é takes two.
			storage: 26,
			hasIcon: false,
		});
		const detail = await request(`/api/admin/apps/${listed!.id}`, {
			headers: { Cookie: cookie },
		});
		expect(await detail.json()).toMatchObject({
			devices: [{ name: 'Laptop' }],
			collections: [{ name: 'todos', documents: 1, storage: 26 }],
		});
	});

	test("fetches an app's icon when it's first approved", async () => {
		const fetched: string[] = [];
		services = createServices(
			createDb(':memory:'),
			loadConfig({}),
			SETUP_TOKEN,
			async (origin) => {
				fetched.push(origin);
				return { bytes: Buffer.from('<svg/>'), type: 'image/svg+xml' };
			}
		);
		app = createApp(services);
		const cookie = await setup();
		await connectApp(cookie);
		await connectApp(cookie);
		await services.oauth.iconsFetched();
		expect(fetched).toEqual([APP]);

		const apps = await request('/api/admin/apps', withCookie(cookie));
		const [listed] = (await apps.json()) as { id: number; hasIcon: boolean }[];
		expect(listed!.hasIcon).toBe(true);
		const path = `/api/admin/apps/${listed!.id}/icon`;
		const icon = await request(path, withCookie(cookie));
		expect(icon.headers.get('content-type')).toBe('image/svg+xml');
		expect(icon.headers.get('content-security-policy')).toContain(
			"default-src 'none'"
		);
		expect(await icon.text()).toBe('<svg/>');
		expect((await request(path)).status).toBe(401);
	});

	test('has no icon for an app that had none', async () => {
		const cookie = await setup();
		await connectApp(cookie);
		await services.oauth.iconsFetched();
		const apps = await request('/api/admin/apps', withCookie(cookie));
		const [listed] = (await apps.json()) as { id: number }[];
		const icon = await request(
			`/api/admin/apps/${listed!.id}/icon`,
			withCookie(cookie)
		);
		expect(icon.status).toBe(404);
	});

	test('revoking a device ends its access', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		const [listed] = services.oauth.listApps();
		const [device] = services.oauth.listDevices(listed!.id);
		const response = await request(`/api/admin/devices/${device!.id}`, {
			method: 'DELETE',
			headers: { Cookie: cookie },
		});
		expect(response.status).toBe(204);
		const pull = await request('/api/collections/todos', {
			headers: bearer(access_token),
		});
		expect(pull.status).toBe(401);
	});

	test('deleting an app deletes its data', async () => {
		const cookie = await setup();
		const first = await connectApp(cookie);
		await push(first.access_token, 'todos', { added: [{ id: '1' }] });
		const [listed] = services.oauth.listApps();
		await request(`/api/admin/apps/${listed!.id}`, {
			method: 'DELETE',
			headers: { Cookie: cookie },
		});
		const again = await connectApp(cookie);
		const pull = await request('/api/collections/todos', {
			headers: bearer(again.access_token),
		});
		expect(await pull.json()).toMatchObject({ items: [] });
	});
});

describe('recovery', () => {
	test('replaces every passkey and session', async () => {
		const cookie = await setup();
		const { token } = services.owner.issueRecoveryToken()!;
		const fresh = await createTestPasskey();
		const recovered = await register(fresh, '/api/recover', {
			recoveryToken: token,
		});
		expect(recovered.status).toBe(204);
		const me = (cookie: string) => request('/api/admin/me', withCookie(cookie));
		expect((await me(sessionCookie(recovered))).status).toBe(200);
		expect((await me(cookie)).status).toBe(401);
		expect((await login(passkey)).status).toBe(401);
		expect((await login(fresh)).status).toBe(204);
	});

	test('needs setup first', () => {
		expect(services.owner.issueRecoveryToken()).toBeUndefined();
	});

	test('tokens work once', async () => {
		await setup();
		const options = (recoveryToken: string) =>
			json('/api/recover/options', { recoveryToken });
		expect((await options('wrong')).status).toBe(403);
		const { token } = services.owner.issueRecoveryToken()!;
		const recovered = await register(
			await createTestPasskey(),
			'/api/recover',
			{
				recoveryToken: token,
			}
		);
		expect(recovered.status).toBe(204);
		expect((await options(token)).status).toBe(403);
	});

	test('only the latest token works', async () => {
		await setup();
		const first = services.owner.issueRecoveryToken()!;
		services.owner.issueRecoveryToken();
		const response = await json('/api/recover/options', {
			recoveryToken: first.token,
		});
		expect(response.status).toBe(403);
	});

	test('tokens expire', async () => {
		await setup();
		const { token } = services.owner.issueRecoveryToken()!;
		setSystemTime(new Date(Date.now() + RECOVERY_TOKEN_TTL + 1000));
		try {
			const response = await json('/api/recover/options', {
				recoveryToken: token,
			});
			expect(response.status).toBe(403);
		} finally {
			setSystemTime();
		}
	});
});

describe('oauth', () => {
	test('publishes its metadata', async () => {
		const response = await request('/.well-known/oauth-authorization-server');
		expect(await response.json()).toMatchObject({
			issuer: 'http://localhost:3000',
			token_endpoint: 'http://localhost:3000/oauth/token',
			code_challenge_methods_supported: ['S256'],
		});
	});

	test('sends valid requests on to the consent screen', async () => {
		const query = new URLSearchParams(authorizeParams(pkce().challenge));
		const response = await request(`/oauth/authorize?${query}`);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(`/authorize?${query}`);
	});

	test('never redirects to an untrusted redirect_uri', async () => {
		const params = {
			...authorizeParams(pkce().challenge),
			redirect_uri: 'https://evil.example/callback',
		};
		const query = new URLSearchParams(params);
		const response = await request(`/oauth/authorize?${query}`);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'invalid_request' });
	});

	test('rejects client ids that are not origins', async () => {
		for (const clientId of [
			'http://example.com',
			'https://example.com/app',
			'not a url',
		]) {
			const query = new URLSearchParams({
				...authorizeParams(pkce().challenge),
				client_id: clientId,
			});
			const response = await request(`/oauth/authorize?${query}`);
			expect(response.status).toBe(400);
		}
	});

	test('describes the request for the consent screen', async () => {
		const query = new URLSearchParams(authorizeParams(pkce().challenge));
		const response = await request(`/api/oauth/request?${query}`);
		expect(await response.json()).toEqual({
			setupComplete: false,
			signedIn: false,
			app: { clientId: APP, name: 'Todos', registeredName: null, devices: 0 },
			deviceName: 'Laptop',
		});
	});

	test('tells the consent screen about an app already registered', async () => {
		await connectApp(await setup());
		const query = new URLSearchParams(authorizeParams(pkce().challenge));
		const response = await request(`/api/oauth/request?${query}`);
		expect(await response.json()).toMatchObject({
			app: { registeredName: 'Todos', devices: 1 },
		});
	});

	test('approving needs the owner', async () => {
		const response = await json('/api/oauth/authorize', {
			...authorizeParams(pkce().challenge),
			approve: true,
		});
		expect(response.status).toBe(401);
	});

	test('denying sends the error back to the app', async () => {
		const cookie = await setup();
		const response = await json(
			'/api/oauth/authorize',
			{ ...authorizeParams(pkce().challenge), approve: false },
			{ headers: { Cookie: cookie } }
		);
		const { redirectTo } = (await response.json()) as { redirectTo: string };
		expect(redirectTo).toBe(`${APP}/callback?error=access_denied&state=xyz`);
	});

	test('codes work once, with the right verifier', async () => {
		const cookie = await setup();
		const { verifier, challenge } = pkce();
		const params = authorizeParams(challenge);
		const approved = await json(
			'/api/oauth/authorize',
			{ ...params, approve: true },
			{ headers: { Cookie: cookie } }
		);
		const { redirectTo } = (await approved.json()) as { redirectTo: string };
		const code = new URL(redirectTo).searchParams.get('code')!;
		const exchange = (codeVerifier: string) =>
			json('/oauth/token', {
				grant_type: 'authorization_code',
				code,
				client_id: APP,
				redirect_uri: params.redirect_uri,
				code_verifier: codeVerifier,
			});
		const wrong = await exchange(pkce().verifier);
		expect(wrong.status).toBe(400);
		expect(await wrong.json()).toMatchObject({ error: 'invalid_grant' });
		// The failed attempt used the code up.
		expect((await exchange(verifier)).status).toBe(400);
	});

	test('refreshes access tokens', async () => {
		const cookie = await setup();
		const { refresh_token } = await connectApp(cookie);
		const response = await json('/oauth/token', {
			grant_type: 'refresh_token',
			refresh_token,
			client_id: APP,
		});
		const { access_token } = (await response.json()) as {
			access_token: string;
		};
		const pull = await request('/api/collections/todos', {
			headers: bearer(access_token),
		});
		expect(pull.status).toBe(200);
	});

	test('refresh tokens only work for their own app', async () => {
		const cookie = await setup();
		const { refresh_token } = await connectApp(cookie);
		const response = await json('/oauth/token', {
			grant_type: 'refresh_token',
			refresh_token,
			client_id: 'https://other.example',
		});
		expect(response.status).toBe(400);
	});

	test('revoking signs the device out', async () => {
		const cookie = await setup();
		const { access_token, refresh_token } = await connectApp(cookie);
		const response = await request('/oauth/revoke', {
			method: 'POST',
			body: new URLSearchParams({ token: access_token }),
		});
		expect(response.status).toBe(200);
		const pull = await request('/api/collections/todos', {
			headers: bearer(access_token),
		});
		expect(pull.status).toBe(401);
		const refresh = await json('/oauth/token', {
			grant_type: 'refresh_token',
			refresh_token,
			client_id: APP,
		});
		expect(refresh.status).toBe(400);
	});

	test('expired access tokens are rejected', async () => {
		services = createServices(
			createDb(':memory:'),
			loadConfig({ ACCESS_TOKEN_TTL: '0' }),
			SETUP_TOKEN,
			noIcon
		);
		app = createApp(services);
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		const pull = await request('/api/collections/todos', {
			headers: bearer(access_token),
		});
		expect(pull.status).toBe(401);
		expect(pull.headers.get('www-authenticate')).toBe('Bearer');
	});
});

describe('sync', () => {
	test('needs an access token', async () => {
		expect((await request('/api/collections/todos')).status).toBe(401);
		const response = await push('not-a-token', 'todos', {});
		expect(response.status).toBe(401);
	});

	test('pushes and pulls, in full and since a cursor', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		await push(access_token, 'todos', { added: [{ id: '1', title: 'a' }] });
		const full = await request('/api/collections/todos', {
			headers: bearer(access_token),
		});
		const { items, cursor } = (await full.json()) as {
			items: unknown[];
			cursor: number;
		};
		expect(items).toEqual([{ id: '1', title: 'a' }]);
		await push(access_token, 'todos', { removed: ['1'] });
		const delta = await request(`/api/collections/todos?since=${cursor}`, {
			headers: bearer(access_token),
		});
		expect(await delta.json()).toMatchObject({
			changes: { added: [], modified: [], removed: [{ id: '1' }] },
		});
	});

	test('keeps each app to its own data', async () => {
		const cookie = await setup();
		const a = await connectApp(cookie);
		const b = await connectApp(cookie, 'https://notes.example');
		await push(a.access_token, 'todos', { added: [{ id: '1' }] });
		const pull = await request('/api/collections/todos', {
			headers: bearer(b.access_token),
		});
		expect(await pull.json()).toMatchObject({ items: [] });
	});

	test('rejects dotted keys and invalid collection names', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		const dotted = await push(access_token, 'todos', {
			added: [{ id: '1', 'a.b': 1 }],
		});
		expect(dotted.status).toBe(422);
		expect(await dotted.text()).toContain('a.b');
		const badName = await push(access_token, 'no.dots', {});
		expect(badName.status).toBe(422);
	});
});

describe('cors', () => {
	test('answers preflights for the routes apps call', async () => {
		for (const path of [
			'/api/collections/todos/changes',
			'/api/events',
			'/oauth/token',
		]) {
			const response = await request(path, {
				method: 'OPTIONS',
				headers: {
					Origin: APP,
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'authorization, content-type',
				},
			});
			expect(response.status).toBe(204);
			expect(response.headers.get('access-control-allow-origin')).toBe('*');
			expect(response.headers.get('access-control-allow-headers')).toContain(
				'Authorization'
			);
		}
	});

	test('allows any origin on responses apps read, errors included', async () => {
		const ok = await request('/api/info', { headers: { Origin: APP } });
		expect(ok.headers.get('access-control-allow-origin')).toBe('*');
		const unauthorized = await request('/api/collections/todos', {
			headers: { Origin: APP },
		});
		expect(unauthorized.status).toBe(401);
		expect(unauthorized.headers.get('access-control-allow-origin')).toBe('*');
		const oauthError = await json('/oauth/token', { grant_type: 'nope' });
		expect(oauthError.status).toBe(400);
		expect(oauthError.headers.get('access-control-allow-origin')).toBe('*');
	});

	test('never allows other origins on the owner routes', async () => {
		for (const path of ['/api/admin/me', '/api/setup', '/api/oauth/request']) {
			const response = await request(path, {
				method: 'OPTIONS',
				headers: { Origin: APP, 'Access-Control-Request-Method': 'POST' },
			});
			expect(response.headers.get('access-control-allow-origin')).toBeNull();
		}
	});
});

describe('events', () => {
	async function readEvent(
		reader: { read(): Promise<{ done: boolean; value?: unknown }> },
		type: string
	) {
		const decoder = new TextDecoder();
		let buffer = '';
		while (true) {
			const { value, done } = await reader.read();
			if (done) return;
			// Without a real server, the stream's string chunks aren't encoded.
			buffer +=
				typeof value === 'string' ? value : decoder.decode(value as Uint8Array);
			for (const message of buffer.split('\n\n')) {
				if (message.startsWith(`event: ${type}\n`)) {
					return JSON.parse(message.split('data: ')[1]!);
				}
			}
		}
	}

	async function subscribe(token: string) {
		const response = await request('/api/events', { headers: bearer(token) });
		expect(response.status).toBe(200);
		const reader = response.body!.getReader();
		expect(await readEvent(reader, 'ping')).toEqual({ interval: 15_000 });
		return reader;
	}

	test('tells only the same app about changes', async () => {
		const cookie = await setup();
		const a = await connectApp(cookie);
		const b = await connectApp(cookie, 'https://notes.example');
		const streamA = await subscribe(a.access_token);
		const streamB = await subscribe(b.access_token);
		await push(b.access_token, 'notes', { added: [{ id: '1' }] });
		await push(a.access_token, 'todos', { added: [{ id: '1' }] });
		// A's first change event is its own collection, not B's.
		expect(await readEvent(streamA, 'change')).toEqual({
			collection: 'todos',
		});
		expect(await readEvent(streamB, 'change')).toEqual({
			collection: 'notes',
		});
	});

	test('closes the stream when the device is revoked', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		const stream = await subscribe(access_token);
		await request('/oauth/revoke', {
			method: 'POST',
			body: new URLSearchParams({ token: access_token }),
		});
		expect(await stream.read()).toMatchObject({ done: true });
	});
});

describe('hardening', () => {
	test('rejects __proto__ keys in pushed docs', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		// Raw JSON, since JSON.stringify can't produce a __proto__ key.
		const response = await request('/api/collections/todos/changes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...bearer(access_token) },
			body: '{"added":[],"modified":[{"id":"1","__proto__":{"polluted":true}}],"modifiedFields":{"1":["__proto__.polluted"]},"removed":[]}',
		});
		expect(response.status).toBe(422);
		expect(await response.text()).toContain('__proto__ in 1');
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	test('accepts any case of the Bearer scheme', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		const response = await request('/api/collections/todos', {
			headers: { Authorization: `bearer ${access_token}` },
		});
		expect(response.status).toBe(200);
	});

	test('logging out clears the cookie it set', async () => {
		const cookie = await setup();
		const response = await json(
			'/api/admin/logout',
			{},
			{
				headers: { Cookie: cookie },
			}
		);
		const setCookie = response.headers.get('set-cookie')!;
		expect(setCookie).toContain('syncvault_session=;');
		expect(setCookie).toContain('Path=/');
	});

	test('behind a trusted proxy, limits sign-ins per client', async () => {
		services = createServices(
			createDb(':memory:'),
			loadConfig({ TRUST_PROXY: '1' }),
			SETUP_TOKEN,
			noIcon
		);
		app = createApp(services);
		await setup();
		const from = (ip: string, key: TestPasskey) =>
			login(key, { headers: { 'X-Forwarded-For': `1.1.1.1, ${ip}` } });
		const unknown = await createTestPasskey();
		for (let i = 0; i < 5; i++) await from('10.0.0.1', unknown);
		expect((await from('10.0.0.1', passkey)).status).toBe(429);
		expect((await from('10.0.0.2', passkey)).status).toBe(204);
	});

	test('a closed stream does not break pushes', async () => {
		const cookie = await setup();
		const { access_token } = await connectApp(cookie);
		const response = await request('/api/events', {
			headers: bearer(access_token),
		});
		await response.body!.cancel();
		const pushed = await push(access_token, 'todos', { added: [{ id: '1' }] });
		expect(pushed.status).toBe(204);
	});

	test('rejects invalid numeric config', () => {
		expect(() => loadConfig({ PING_INTERVAL: 'abc' })).toThrow('PING_INTERVAL');
		expect(() => loadConfig({ PING_INTERVAL: '0' })).toThrow();
		expect(loadConfig({ ACCESS_TOKEN_TTL: '0' }).accessTokenTtl).toBe(0);
	});
});

describe('dashboard', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'syncvault-dashboard-'));
		mkdirSync(join(dir, '_app/immutable'), { recursive: true });
		writeFileSync(join(dir, '200.html'), '<p>spa</p>');
		writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
		writeFileSync(join(dir, '_app/immutable/app.js'), 'app()');
		app = createApp(
			createServices(
				createDb(':memory:'),
				loadConfig({ DASHBOARD_DIR: dir }),
				SETUP_TOKEN,
				noIcon
			)
		);
	});
	afterEach(() => rmSync(dir, { recursive: true }));

	test('serves files from the build, never framed', async () => {
		const icon = await request('/favicon.svg');
		expect(icon.headers.get('content-type')).toContain('image/svg+xml');
		expect(icon.headers.get('x-frame-options')).toBe('DENY');
		expect(await icon.text()).toBe('<svg/>');

		const script = await request('/_app/immutable/app.js');
		expect(script.headers.get('cache-control')).toContain('immutable');
	});

	test('falls back to the SPA for other paths', async () => {
		for (const path of ['/', '/apps/1', '/passkeys']) {
			const response = await request(path);
			expect(response.status).toBe(200);
			expect(response.headers.get('x-frame-options')).toBe('DENY');
			expect(await response.text()).toBe('<p>spa</p>');
		}
	});

	test('leaves API paths and files outside the build alone', async () => {
		for (const path of ['/api/nope', '/oauth/nope', '/.well-known/nope']) {
			expect((await request(path)).status).toBe(404);
		}
		writeFileSync(join(dir, '../syncvault-secret'), 'secret');
		try {
			const response = await request('/%2e%2e/syncvault-secret');
			expect(await response.text()).not.toContain('secret');
		} finally {
			rmSync(join(dir, '../syncvault-secret'));
		}
	});

	test('404s without a build', async () => {
		app = createApp(
			createServices(
				createDb(':memory:'),
				loadConfig({ DASHBOARD_DIR: join(dir, 'missing') }),
				SETUP_TOKEN,
				noIcon
			)
		);
		expect((await request('/apps/1')).status).toBe(404);
	});
});
