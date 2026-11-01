import type { BaseItem } from '@signaldb/core';
import { SyncManager } from '@signaldb/sync';

/**
 * SignalDB's SyncManager, plus a way to forget what it knows about the server.
 * Its snapshots describe one server's data, so they must go when the app
 * connects to a server afresh.
 */
export class VaultSyncManager extends SyncManager<
	Record<string, unknown>,
	BaseItem<string>,
	string
> {
	async resetState() {
		await this.snapshots.removeMany({});
		await this.syncOperations.removeMany({});
	}
}

/**
 * The IndexedDB stores (and indexes) SignalDB's SyncManager keeps its records
 * in. Add them to the app's schema, so changes not yet pushed survive a reload.
 */
export const syncVaultStores: Record<string, string[]> = {
	'default-sync-manager-changes': ['collectionName'],
	'default-sync-manager-snapshots': ['collectionName'],
	'default-sync-manager-sync-operations': ['collectionName', 'status'],
};
