import { vault } from './todos.ts';
import { ConnectError, type SyncStatus } from '@syncvault/client';

// The connection status for the UI, plus the last connection error to show.
let status = $state.raw<SyncStatus>(vault.status);
let error = $state<string | null>(null);

vault.subscribe((next) => {
	status = next;
});

function describe(cause: unknown) {
	return cause instanceof ConnectError
		? cause.message
		: 'Something went wrong. Try again.';
}

/**
 * Starts syncing, after finishing a connection if the server just sent the
 * browser back here. That uses the router (see replaceUrl in todos.ts), so call
 * it once the router has started: from the root layout's afterNavigate. Only
 * the first call does anything.
 */
export function startSync() {
	// Finishing a connection can fail, e.g. if access was denied on the server.
	vault.start().catch((cause) => {
		error = describe(cause);
	});
}

export const sync = {
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	clearError() {
		error = null;
	},
	/** Sends the browser to the server to approve this app. */
	async connect(serverUrl: string) {
		error = null;
		try {
			await vault.connect(serverUrl);
		} catch (cause) {
			error = describe(cause);
			throw cause;
		}
	},
	async disconnect() {
		error = null;
		try {
			await vault.disconnect();
		} catch (cause) {
			error = describe(cause);
		}
	},
};
