import { ConnectError, type Connection, createAuth } from './auth.ts';
import { createCursors } from './cursors.ts';
import { type Env, browserEnv, jsonItem } from './env.ts';
import { createEventStream } from './events.ts';
import { VaultSyncManager } from './sync-manager.ts';
import {
	type BaseItem,
	Collection,
	type CollectionOptions,
	type DataAdapter,
	type ReactivityAdapter,
} from '@signaldb/core';

export { ConnectError, NetworkError, UnauthorizedError } from './auth.ts';
export { syncVaultStores } from './sync-manager.ts';
export type { Env } from './env.ts';

export interface SyncVaultOptions {
	/** The data adapter the collections use, e.g. IndexedDB. */
	dataAdapter: DataAdapter;
	/** Passed to collections made with `vault.collection()`. */
	reactivity?: ReactivityAdapter;
	/** Shown to the server's owner when they approve the app. */
	appName?: string;
	/** Defaults to the browser and OS, like "Firefox on macOS". */
	deviceName?: string;
	/** Where the server sends the browser back to. Defaults to the current page. */
	redirectUri?: string;
	/**
	 * Removes the connection's parameters (`?code=`, `?state=`) from the
	 * address bar once the server has sent the browser back. Defaults to
	 * `history.replaceState`. Apps with a router that owns the URL should pass
	 * its own navigation, e.g. SvelteKit's
	 * `(url) => goto(url, { replace: true, shallow: true })`, and call
	 * `start()` once that router can navigate. A rejection rejects `start()`.
	 */
	replaceUrl?: (url: string) => void | Promise<void>;
	/** Prefix for the SDK's localStorage keys. */
	storageKey?: string;
	/**
	 * Called when syncing fails. Defaults to console.warn. The error is one of:
	 * - `NetworkError`: the server can't be reached. Changes wait to be
	 *   pushed, and `status` is `offline`.
	 * - `UnauthorizedError`: the device was revoked, and `status` is
	 *   `unauthorized`.
	 * - `PushRejectedError`: the server refused some changes. They won't be
	 *   sent again, so this device and the server now differ.
	 * - `ServerError`: the server failed. Changes are retried on the next sync.
	 * `collection` is `'*'` for the upload of local data on a first connection.
	 */
	onError?: (error: Error, collection: string) => void;
	/** Browser APIs, replaceable in tests. */
	env?: Env;
}

export type SyncState =
	'disconnected' | 'connecting' | 'online' | 'offline' | 'unauthorized';

export interface SyncStatus {
	/**
	 * - `disconnected`: not connected to a server. Changes are kept locally and
	 *   uploaded once connected.
	 * - `connecting`: finishing a connection after the server's consent screen.
	 * - `online`: connected, with live updates from the server.
	 * - `offline`: connected, but the server can't be reached right now.
	 * - `unauthorized`: the server revoked this device. Local data is kept;
	 *   connect again to resume.
	 */
	state: SyncState;
	serverUrl?: string;
}

const COLLECTION_NAME = /^[\w-]{1,64}$/;

/** The server refused pushed changes (a 4xx), so they won't be sent again. */
export class PushRejectedError extends Error {
	constructor(
		readonly collection: string,
		readonly status: number,
		reason: string
	) {
		super(reason || `The server rejected the changes (${status})`);
	}
}

/** The server failed (a 5xx, or a response it shouldn't have sent). */
export class ServerError extends Error {
	constructor(readonly status: number) {
		super(`The server had a problem (${status})`);
	}
}

interface PullResponse {
	cursor: number;
	items?: BaseItem<string>[];
	changes?: {
		added: BaseItem<string>[];
		modified: BaseItem<string>[];
		removed: BaseItem<string>[];
	};
}

interface PushBody {
	added: BaseItem<string>[];
	modified: BaseItem<string>[];
	modifiedFields: Record<string, string[]>;
	removed: string[];
}

export function createSyncVault(options: SyncVaultOptions) {
	const baseEnv = options.env ?? browserEnv();
	const env: Env = options.replaceUrl
		? { ...baseEnv, replaceUrl: options.replaceUrl }
		: baseEnv;
	const storageKey = options.storageKey ?? 'syncvault';
	const collections = new Map<string, Collection<any, string, any>>();
	const cursors = createCursors(env.localStorage, storageKey);
	// Set when a new connection still needs this device's data uploaded. Kept
	// in storage, so an upload that fails is retried on the next start.
	const uploadPending = jsonItem<true>(
		env.localStorage,
		`${storageKey}:upload-pending`
	);

	const listeners = new Set<(status: SyncStatus) => void>();
	let status: SyncStatus = { state: 'disconnected' };
	let connecting = false;
	let streamOpen = false;
	let syncing = false;
	let started = false;

	function updateStatus() {
		const connection = auth.connection();
		const next: SyncStatus = connecting
			? { state: 'connecting', serverUrl: connection?.serverUrl }
			: !connection
				? { state: 'disconnected' }
				: !connection.refreshToken
					? { state: 'unauthorized', serverUrl: connection.serverUrl }
					: {
							state: streamOpen ? 'online' : 'offline',
							serverUrl: connection.serverUrl,
						};
		if (next.state === status.state && next.serverUrl === status.serverUrl) {
			return;
		}
		status = next;
		for (const listener of listeners) listener(status);
	}

	const auth = createAuth({
		env,
		storageKey,
		appName: options.appName,
		deviceName: options.deviceName,
		redirectUri: options.redirectUri,
		onConnectionChange(connection: Connection | undefined) {
			updateStatus();
			// Revoked, or disconnected: stop until connected again.
			if (!connection?.refreshToken) void stopSyncing();
		},
	});

	const reportError =
		options.onError ??
		((error: Error, collection: string) =>
			console.warn(`Sync failed (${collection}):`, error));

	// The server's change events, shared by every collection.
	const remoteChanges = new Map<string, () => Promise<void>>();
	const stream = createEventStream({
		open: (signal) => auth.request('/api/events', { signal }),
		onChange(collection) {
			remoteChanges
				.get(collection)?.()
				.catch(() => {});
		},
		// Every open syncs: it's the first sync after starting, and after a
		// drop, events sent meanwhile were lost and local changes are waiting.
		// Syncing only on reconnects would leave a device that started while
		// the server was down without its first sync.
		onOpen() {
			streamOpen = true;
			updateStatus();
			void uploadIfPending().then(syncAll);
		},
		onDrop() {
			streamOpen = false;
			updateStatus();
		},
	});

	async function pushChanges(collection: string, body: PushBody) {
		const response = await auth.request(
			`/api/collections/${encodeURIComponent(collection)}/changes`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			}
		);
		// The server rejected these changes, so sending them again won't help.
		// Throwing would keep them queued and retry them on every sync, so
		// report them and move on.
		if (response.status >= 400 && response.status < 500) {
			reportError(
				new PushRejectedError(
					collection,
					response.status,
					await response.text()
				),
				collection
			);
			return;
		}
		// Anything else (offline, 5xx) throws, so the changes stay queued.
		if (!response.ok) throw new ServerError(response.status);
	}

	const syncManager = new VaultSyncManager({
		dataAdapter: options.dataAdapter,
		// Collections only sync while connected. SignalDB still logs changes
		// made before that, and pushes them once started.
		autostart: false,
		onError: ({ name }, error) => reportError(error, name),

		async pull({ name }, lastFinishedSync) {
			const since = cursors.since(name, lastFinishedSync);
			const query = since === undefined ? '' : `?since=${since}`;
			const response = await auth.request(
				`/api/collections/${encodeURIComponent(name)}${query}`
			);
			if (!response.ok) throw new ServerError(response.status);
			const body = (await response.json()) as PullResponse;
			cursors.record(name, body.cursor);
			return body.items ? { items: body.items } : { changes: body.changes! };
		},

		push({ name }, { changes }) {
			return pushChanges(name, {
				added: changes.added,
				modified: changes.modified,
				modifiedFields: Object.fromEntries(changes.modifiedFields),
				removed: changes.removed.map((item) => item.id),
			});
		},

		registerRemoteChange({ name }, onChange) {
			remoteChanges.set(name, () => onChange());
			stream.start();
			return () => {
				remoteChanges.delete(name);
				if (remoteChanges.size === 0) {
					stream.stop();
					streamOpen = false;
					updateStatus();
				}
			};
		},
	});

	// Failures are already reported through onError, and failed changes stay
	// queued for the next sync.
	function syncAll() {
		if (!syncing) return Promise.resolve();
		return syncManager.syncAll().catch(() => {});
	}

	/**
	 * A new connection starts from this device's data: the server gets every
	 * local document, then the usual sync adds the server's documents too.
	 * Without this, data from before connecting would never be uploaded.
	 */
	async function uploadLocalData() {
		for (const [name, collection] of collections) {
			const items = (await collection
				.find({}, { async: true })
				.fetch()) as BaseItem<string>[];
			if (items.length === 0) continue;
			await pushChanges(name, {
				added: items,
				modified: [],
				modifiedFields: {},
				removed: [],
			});
		}
		uploadPending.remove();
	}

	/**
	 * Runs a pending upload. One that fails is reported, and retried the next
	 * time the event stream opens.
	 */
	async function uploadIfPending() {
		if (!uploadPending.get()) return;
		try {
			await uploadLocalData();
		} catch (error) {
			reportError(error as Error, '*');
		}
	}

	async function startSyncing() {
		if (syncing) return;
		syncing = true;
		// Opens the event stream, which uploads and syncs once connected.
		await syncManager.startAll();
	}

	/** A new connection forgets anything known about a previous server. */
	async function prepareNewConnection() {
		await syncManager.resetState();
		for (const name of collections.keys()) cursors.clear(name);
		uploadPending.set(true);
	}

	async function stopSyncing() {
		if (!syncing) return;
		syncing = false;
		await syncManager.pauseAll();
	}

	return {
		/** The current connection state. */
		get status() {
			return status;
		},

		/** Calls `listener` whenever the status changes. Returns an unsubscribe. */
		subscribe(listener: (status: SyncStatus) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		/**
		 * Creates a collection stored with the vault's data adapter and synced
		 * with the server under the same name. Create collections before
		 * `start()`.
		 */
		collection<T extends BaseItem<string>>(
			name: string,
			collectionOptions: CollectionOptions<T, string> = {}
		) {
			const collection = new Collection<T, string>(name, options.dataAdapter, {
				reactivity: options.reactivity,
				...collectionOptions,
			});
			this.addCollection(collection, name);
			return collection;
		},

		/** Syncs a collection the app created itself. */
		addCollection<T extends BaseItem<string>>(
			collection: Collection<T, string, any>,
			name: string
		) {
			if (!COLLECTION_NAME.test(name)) {
				throw new Error(
					`Collection names must be 1-64 letters, digits, _ or -: ${name}`
				);
			}
			if (collections.has(name)) {
				throw new Error(`Collection ${name} is already synced`);
			}
			collections.set(name, collection);
			syncManager.addCollection(collection, { name });
		},

		/**
		 * Starts syncing, if connected. Call it once at startup, after creating
		 * the collections. If this page load is the server sending the browser
		 * back after connecting, it finishes the connection first, and throws
		 * ConnectError if that failed (e.g. the owner denied access).
		 */
		async start() {
			if (started) return;
			started = true;
			env.addEventListener('online', () => void syncAll());
			// Another tab connected or disconnected.
			env.addEventListener('storage', (event) => {
				if ((event as StorageEvent).key !== storageKey) return;
				updateStatus();
				if (auth.connection()?.refreshToken) void startSyncing();
				else void stopSyncing();
			});

			let failure: unknown;
			connecting = true;
			updateStatus();
			try {
				if (await auth.completeConnect()) await prepareNewConnection();
			} catch (error) {
				failure = error;
			} finally {
				connecting = false;
				updateStatus();
			}
			if (auth.connection()?.refreshToken) await startSyncing();
			if (failure) throw failure;
		},

		/**
		 * Checks that the URL is a SyncVault server, then sends the browser to
		 * it to approve this app. The browser comes back to this page (or
		 * `redirectUri`), where `start()` finishes connecting. Throws
		 * ConnectError with a message to show if the server can't be used.
		 */
		async connect(serverUrl: string) {
			if (auth.connection()?.refreshToken) {
				throw new ConnectError('Disconnect from the current server first');
			}
			await auth.beginConnect(serverUrl);
		},

		/**
		 * Stops syncing and signs this device out of the server. Local data is
		 * kept.
		 */
		async disconnect() {
			await stopSyncing();
			await auth.disconnect();
			await syncManager.resetState();
			for (const name of collections.keys()) cursors.clear(name);
			uploadPending.remove();
		},

		/** Syncs every collection now. Never rejects; failures go to onError. */
		syncAll,
	};
}

export type SyncVault = ReturnType<typeof createSyncVault>;
