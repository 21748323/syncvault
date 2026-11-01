import { type KeyValueStorage, jsonItem } from './env.ts';

// Incremental pulls send the cursor from an earlier pull, and get only what
// changed since. A cursor is only safe to use once SignalDB has applied that
// pull and saved its snapshot. Otherwise a sync that fails halfway (or a tab
// closed mid-sync) would skip changes for good.
//
// SignalDB passes each pull the start and end of the last sync that finished,
// and a finished sync has saved its snapshot. So every pull is recorded as
// pending, and committed once a finished sync turns out to contain it. A
// pending cursor that's lost only means fetching some changes again, which is
// harmless: applying them is an upsert or a remove.

interface CursorState {
	committed?: number;
	pending: { time: number; cursor: number }[];
}

export interface LastFinishedSync {
	lastFinishedSyncStart?: number;
	lastFinishedSyncEnd?: number;
}

export function createCursors(storage: KeyValueStorage, prefix: string) {
	// Kept in storage, shared by tabs: they share SignalDB's snapshots too.
	const item = (collection: string) =>
		jsonItem<CursorState>(storage, `${prefix}:cursor:${collection}`);

	return {
		/**
		 * The cursor to pull since, or undefined for a full pull. Commits the
		 * cursors of pulls made during the last finished sync.
		 */
		since(
			collection: string,
			{
				lastFinishedSyncStart: start,
				lastFinishedSyncEnd: end,
			}: LastFinishedSync
		) {
			// No finished sync means no snapshot to apply changes to.
			if (start === undefined || end === undefined) return;
			const state = item(collection).get() ?? { pending: [] };
			let committed = state.committed;
			for (const { time, cursor } of state.pending) {
				if (time >= start && time <= end) {
					committed = Math.max(committed ?? cursor, cursor);
				}
			}
			// Older pending cursors belong to syncs that failed.
			const pending = state.pending.filter(({ time }) => time > end);
			item(collection).set({ committed, pending });
			return committed;
		},

		record(collection: string, cursor: number, time = Date.now()) {
			const state = item(collection).get() ?? { pending: [] };
			state.pending.push({ time, cursor });
			item(collection).set(state);
		},

		clear(collection: string) {
			item(collection).remove();
		},
	};
}

export type Cursors = ReturnType<typeof createCursors>;
