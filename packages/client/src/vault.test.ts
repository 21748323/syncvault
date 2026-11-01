import {
	ConnectError,
	NetworkError,
	PushRejectedError,
	type SyncState,
	createSyncVault,
} from './index.ts';
import { testEnv } from './testing.ts';
import { DefaultDataAdapter } from '@signaldb/core';
import { createApp } from '@syncvault/server/src/app.ts';
import { loadConfig } from '@syncvault/server/src/config.ts';
import { createDb } from '@syncvault/server/src/db/index.ts';
import {
	type Services,
	createServices,
} from '@syncvault/server/src/services.ts';
import { createTestPasskey } from '@syncvault/server/src/test/authenticator.ts';
import { afterEach, beforeEach, expect, test } from 'bun:test';

// End to end: SDK instances acting as devices, against the real server
// running in this process.

const APP_URL = 'http://localhost:5173/';
const SETUP_TOKEN = 'test-setup-token';

interface Todo {
	id: string;
	title: string;
	done?: boolean;
}

let services: Services;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let serverUrl: string;
let ownerCookie: string;
const vaults: ReturnType<typeof createSyncVault>[] = [];

// Not awaited: with clients retrying, Bun's stop can take a long time to
// settle, but the port is free straight away.
function stopServer() {
	services.events.closeAll();
	void server.stop(true);
}

function listen(port = 0) {
	server = createApp(services).listen(port);
	serverUrl = `http://localhost:${server.server!.port}`;
}

beforeEach(async () => {
	services = createServices(
		createDb(':memory:'),
		loadConfig({ PING_INTERVAL: '1000' }),
		SETUP_TOKEN
	);
	listen();
	const post = (path: string, body: object) =>
		fetch(`${serverUrl}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	const passkey = await createTestPasskey(serverUrl);
	const options = await post('/api/setup/options', { setupToken: SETUP_TOKEN });
	const response = await post('/api/setup', {
		setupToken: SETUP_TOKEN,
		response: await passkey.register(await options.json()),
	});
	ownerCookie = response.headers.get('set-cookie')!.split(';')[0]!;
});

afterEach(async () => {
	for (const vault of vaults.splice(0)) await vault.disconnect();
	stopServer();
});

/**
 * A browser tab running an app with one synced collection. Pass an earlier
 * device's tab to simulate reloading it (its storage is kept).
 */
function device(
	tab = testEnv(APP_URL),
	options: Partial<Parameters<typeof createSyncVault>[0]> = {}
) {
	const errors: Error[] = [];
	const vault = createSyncVault({
		appName: 'Todos',
		dataAdapter: new DefaultDataAdapter(),
		env: tab.env,
		onError: (error) => errors.push(error),
		...options,
	});
	vaults.push(vault);
	const todos = vault.collection<Todo>('todos');
	return { tab, vault, todos, errors };
}

/** Connects a device, with the owner approving (or denying) on the server. */
async function connect(
	{ tab, vault }: ReturnType<typeof device>,
	approve = true
) {
	await vault.connect(serverUrl);
	const authorize = new URL(tab.navigations.at(-1)!);
	expect(authorize.pathname).toBe('/oauth/authorize');
	const response = await fetch(`${serverUrl}/api/oauth/authorize`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
		body: JSON.stringify({
			...Object.fromEntries(authorize.searchParams),
			approve,
		}),
	});
	const { redirectTo } = (await response.json()) as { redirectTo: string };
	tab.load(redirectTo);
	await vault.start();
}

async function waitFor(check: () => boolean | Promise<boolean>, ms = 5000) {
	const deadline = Date.now() + ms;
	while (!(await check())) {
		if (Date.now() > deadline) throw new Error('Timed out');
		await Bun.sleep(25);
	}
}

const titles = async (todos: ReturnType<typeof device>['todos']) =>
	(await todos.find({}, { async: true }).fetch())
		.map((todo) => todo.title)
		.sort();

const stateOf = (vault: ReturnType<typeof createSyncVault>) =>
	vault.status.state as SyncState;

test('connects and goes online, removing the code from the URL', async () => {
	const a = device();
	expect(a.vault.status).toEqual({ state: 'disconnected' });
	await connect(a);
	expect(a.tab.env.currentUrl()).toBe(APP_URL);
	await waitFor(() => stateOf(a.vault) === 'online');
	expect(a.vault.status.serverUrl).toBe(serverUrl);
});

test("removes the code through the app's router if it has one", async () => {
	const routed: string[] = [];
	const a = device(undefined, {
		replaceUrl: async (url) => {
			await Bun.sleep(1);
			routed.push(url);
		},
	});
	await connect(a);
	expect(routed).toEqual([APP_URL]);
	await waitFor(() => stateOf(a.vault) === 'online');
});

test('syncs changes between devices as they happen', async () => {
	const a = device();
	const b = device();
	await connect(a);
	await connect(b);
	await waitFor(() => stateOf(b.vault) === 'online');

	const id = await a.todos.insert({ title: 'milk' });
	await waitFor(async () => (await titles(b.todos)).includes('milk'));

	b.todos.updateOne({ id }, { $set: { done: true } });
	await waitFor(
		async () => (await a.todos.findOne({ id }, { async: true }))?.done === true
	);

	a.todos.removeOne({ id });
	await waitFor(async () => (await titles(b.todos)).length === 0);
});

test('uploads data that was created before connecting', async () => {
	const a = device();
	a.todos.insert({ title: 'from before' });
	await connect(a);

	const b = device();
	await connect(b);
	await waitFor(async () => (await titles(b.todos)).includes('from before'));
});

test('pushes changes made while the server was down', async () => {
	const a = device();
	const b = device();
	await connect(a);
	await connect(b);
	await waitFor(() => stateOf(a.vault) === 'online');

	const port = server.server!.port;
	stopServer();
	await waitFor(() => stateOf(a.vault) === 'offline');
	a.todos.insert({ title: 'offline edit' });

	listen(port);
	await waitFor(
		async () => (await titles(b.todos)).includes('offline edit'),
		15_000
	);
}, 20_000);

test('catches up after starting while the server was down', async () => {
	const a = device();
	await connect(a);
	await a.todos.insert({ title: 'on the server' });
	await waitFor(() => services.documents.collections(1).length > 0);

	const port = server.server!.port;
	stopServer();
	const reloaded = device(a.tab);
	await reloaded.vault.start();
	expect(stateOf(reloaded.vault)).toBe('offline');

	listen(port);
	await waitFor(
		async () => (await titles(reloaded.todos)).includes('on the server'),
		10_000
	);
}, 15_000);

test('pulls only changes after the first sync', async () => {
	const a = device();
	const urls: string[] = [];
	const { fetch: original } = a.tab.env;
	a.tab.env.fetch = (input, init) => {
		urls.push(input);
		return original(input, init);
	};
	await connect(a);
	await waitFor(() => stateOf(a.vault) === 'online');
	a.todos.insert({ title: 'one' });
	await waitFor(() => urls.some((url) => url.includes('/changes')));
	await a.vault.syncAll();
	const pulls = urls.filter((url) => url.includes('/api/collections/todos?'));
	expect(pulls.some((url) => url.includes('since='))).toBe(true);
});

test('a revoked device becomes unauthorized and keeps its data', async () => {
	const a = device();
	await connect(a);
	a.todos.insert({ title: 'mine' });
	await waitFor(() => stateOf(a.vault) === 'online');

	const [app] = services.oauth.listApps();
	const [revoked] = services.oauth.listDevices(app!.id);
	await fetch(`${serverUrl}/api/admin/devices/${revoked!.id}`, {
		method: 'DELETE',
		headers: { Cookie: ownerCookie },
	});
	await waitFor(() => stateOf(a.vault) === 'unauthorized', 10_000);
	expect(a.vault.status.serverUrl).toBe(serverUrl);
	expect(await titles(a.todos)).toEqual(['mine']);
}, 15_000);

test('reports a denied connection', async () => {
	const a = device();
	expect(connect(a, false)).rejects.toThrow(ConnectError);
	await waitFor(() => stateOf(a.vault) === 'disconnected');
});

test('refuses URLs that are not SyncVault servers', async () => {
	const a = device();
	expect(a.vault.connect('ftp://example.com')).rejects.toThrow(ConnectError);
	expect(a.vault.connect('http://localhost:1')).rejects.toThrow(ConnectError);
});

test('disconnecting signs the device out on the server', async () => {
	const a = device();
	await connect(a);
	await waitFor(() => stateOf(a.vault) === 'online');
	await a.vault.disconnect();
	expect(a.vault.status).toEqual({ state: 'disconnected' });
	const [app] = services.oauth.listApps();
	expect(services.oauth.listDevices(app!.id)).toEqual([]);
});

test('reports changes the server rejects', async () => {
	const a = device();
	await connect(a);
	await waitFor(() => stateOf(a.vault) === 'online');
	// Dotted keys are refused by the server.
	await a.todos.insert({ title: 'bad', 'a.b': 1 } as unknown as Todo);
	await waitFor(() => a.errors.some((e) => e instanceof PushRejectedError));
	const rejected = a.errors.find((e) => e instanceof PushRejectedError)!;
	expect(rejected.message).toContain('a.b');
});

test('reports an unreachable server as a NetworkError', async () => {
	const a = device();
	await connect(a);
	await waitFor(() => stateOf(a.vault) === 'online');
	stopServer();
	await waitFor(() => stateOf(a.vault) === 'offline');
	await a.vault.syncAll();
	expect(a.errors.some((e) => e instanceof NetworkError)).toBe(true);
	listen(0);
});
