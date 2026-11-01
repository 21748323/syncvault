import { notify } from '#lib/notifications.svelte.ts';
import { goto } from '$app/navigation';
import { DefaultDataAdapter } from '@signaldb/core';
import prepareIndexedDB from '@signaldb/indexeddb';
import svelteReactivityAdapter from '@signaldb/svelte';
import {
	NetworkError,
	PushRejectedError,
	UnauthorizedError,
	createSyncVault,
	syncVaultStores,
} from '@syncvault/client';

export interface Todo {
	id: string;
	title: string;
	done: boolean;
	createdAt: number;
}

const indexedDB = prepareIndexedDB({
	databaseName: 'todos',
	version: 1,
	schema: {
		todos: [],
		// The sync records, kept alongside the todos so changes not yet pushed
		// survive a reload.
		...syncVaultStores,
	},
});

export const vault = createSyncVault({
	appName: 'Todos',
	dataAdapter: new DefaultDataAdapter({ storage: (name) => indexedDB(name) }),
	reactivity: svelteReactivityAdapter,
	// After connecting, tidy the address bar through SvelteKit's router, so
	// page.url stays in step with it.
	replaceUrl: (url) =>
		// The current page's own URL (minus ?code=), so already resolved.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(url, { replace: true, shallow: true }),
	onError(error) {
		// Shown by the sync status in the header instead.
		if (error instanceof NetworkError || error instanceof UnauthorizedError) {
			return;
		}
		if (error instanceof PushRejectedError) {
			notify(
				`The server refused some changes, so they won't sync: ${error.message}`
			);
		} else {
			notify(`Syncing failed: ${error.message}`);
		}
	},
});

export const todos = vault.collection<Todo>('todos');

// Writes go to this device's storage first. If that fails (e.g. it's full),
// say so rather than losing the change silently.
async function saving(write: Promise<unknown>) {
	try {
		await write;
	} catch {
		notify("Couldn't save your change on this device.");
	}
}

export function addTodo(title: string) {
	return saving(todos.insert({ title, done: false, createdAt: Date.now() }));
}

export function updateTodo(
	id: string,
	changes: Partial<Pick<Todo, 'title' | 'done'>>
) {
	return saving(todos.updateOne({ id }, { $set: changes }));
}

export function removeTodo(id: string) {
	return saving(todos.removeOne({ id }));
}

export function clearDone() {
	return saving(todos.removeMany({ done: true }));
}
