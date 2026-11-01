# @syncvault/client

Connects a web app's [SignalDB](https://signaldb.js.org) collections to a
SyncVault server. The app keeps working offline, and syncs with the server
whenever the user has connected one.

## Setup

```ts
import { DefaultDataAdapter } from '@signaldb/core';
import prepareIndexedDB from '@signaldb/indexeddb';
import svelteReactivityAdapter from '@signaldb/svelte';
import { createSyncVault, syncVaultStores } from '@syncvault/client';

const indexedDB = prepareIndexedDB({
	databaseName: 'my-app',
	version: 1,
	// Your collections, plus the stores sync needs.
	schema: { todos: [], ...syncVaultStores },
});

export const vault = createSyncVault({
	appName: 'My App', // shown to the server's owner when they approve it
	dataAdapter: new DefaultDataAdapter({ storage: (name) => indexedDB(name) }),
	reactivity: svelteReactivityAdapter, // optional
});

// Synced under the same name on the server.
export const todos = vault.collection<Todo>('todos');

// Once, at startup, after creating the collections.
vault.start().catch((error) => showError(error.message));
```

Peer dependencies: `@signaldb/core` and `@signaldb/sync` 2.x.

## Connecting

```ts
await vault.connect('sync.example.com');
```

A bare address means `https://`. Type `http://` out to use it, e.g.
`http://localhost:3000` in development.

This checks that the URL is a SyncVault server, then sends the browser there.
The server's owner signs in and approves the app, and the browser comes back to
the same page. `start()` then finishes the connection and starts syncing.

- If the server can't be used, `connect()` throws a `ConnectError` whose message
  can be shown to the user.
- If the owner denies access, `start()` throws a `ConnectError` after the
  redirect back.
- Data already on the device is uploaded on the first connection.
- `vault.disconnect()` signs this device out. Local data is kept.

## Status

```ts
vault.status; // { state, serverUrl }
const unsubscribe = vault.subscribe((status) => render(status));
```

| `state`        | Meaning                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `disconnected` | No server. Changes are kept locally, and uploaded once connected.      |
| `connecting`   | Finishing a connection after the server's consent screen.              |
| `online`       | Connected, with live updates.                                          |
| `offline`      | Connected, but the server can't be reached. Changes wait to be pushed. |
| `unauthorized` | The server revoked this device. Local data is kept; connect again.     |

## Options

| Option        | Default                 | Purpose                                                     |
| ------------- | ----------------------- | ----------------------------------------------------------- |
| `dataAdapter` | (required)              | The SignalDB data adapter your collections are stored in.   |
| `reactivity`  |                         | Passed to collections made with `vault.collection()`.       |
| `appName`     |                         | Shown on the consent screen (as the app's own claim).       |
| `deviceName`  | e.g. "Firefox on macOS" | Shown to the owner, to tell devices apart.                  |
| `redirectUri` | the current page        | Where the server sends the browser back to.                 |
| `replaceUrl`  | `history.replaceState`  | Removes `?code=` and `?state=` after connecting. See below. |
| `storageKey`  | `syncvault`             | Prefix for the SDK's localStorage keys.                     |
| `onError`     | `console.warn`          | Called when a sync fails, e.g. while offline.               |

A collection the app builds itself can be synced with
`vault.addCollection(collection, name)`.

### Apps with a router

After the server sends the browser back, `start()` removes the connection's
parameters from the address bar. By default it calls `history.replaceState`
directly, which a router that owns the URL won't know about. Pass the router's
own navigation instead, and call `start()` once the router can navigate. With
SvelteKit:

```ts
import { goto } from '$app/navigation';

const vault = createSyncVault({
	// ...
	replaceUrl: (url) => goto(url, { replace: true, shallow: true }),
});
```

```svelte
<!-- +layout.svelte: the first afterNavigate is after the router starts. -->
<script>
	import { afterNavigate } from '$app/navigation';

	afterNavigate(() => {
		vault.start().catch((error) => showError(error.message));
	});
</script>
```

`start()` only runs once, so calling it on every navigation is fine.

## Errors

`onError(error, collection)` is called when syncing fails. Check the error's
type to decide what to show:

```ts
import {
	NetworkError,
	PushRejectedError,
	UnauthorizedError,
} from '@syncvault/client';

createSyncVault({
	// ...
	onError(error) {
		// Already reflected in vault.status (offline / unauthorized).
		if (error instanceof NetworkError || error instanceof UnauthorizedError) {
			return;
		}
		// PushRejectedError: the server refused some changes, which won't be
		// retried. ServerError: the server failed; changes are retried.
		showToast(error.message);
	},
});
```

`collection` is `'*'` when the failure was uploading local data on a first
connection. That upload is retried automatically.

Local writes (`insert`, `updateOne`, ...) are SignalDB's own: they reject if the
device's storage fails, so handle their promises too.

## Notes

- The app's origin is its identity on the server. An app served from another
  origin (another port, in development) is a separate app with separate data.
- An `https://` app can't connect to an `http://` server, apart from
  `localhost`.
- The server URL and tokens are kept in localStorage, shared by the app's tabs.
