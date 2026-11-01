import type { Db } from '../db/index.ts';
import { documents, meta } from '../db/schema.ts';
import { type Doc, mergePaths } from './merge.ts';
import { and, count, eq, gt, isNotNull, sql } from 'drizzle-orm';

export interface Changes {
	added: Doc[];
	modified: Doc[];
	// Dot-separated leaf paths that changed in each modified doc, as computed
	// by SignalDB's sync manager.
	modifiedFields: Record<string, string[]>;
	removed: string[];
}

export type PullResult =
	| { items: Doc[]; cursor: number }
	| {
			changes: { added: Doc[]; modified: Doc[]; removed: { id: string }[] };
			cursor: number;
	  };

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * The bytes of stored JSON in the rows it aggregates. Not their size on disk:
 * keys, indexes and tombstones aren't counted.
 */
export const storage = sql<number>`coalesce(sum(length(cast(${documents.data} as blob))), 0)`;

function readSeq(tx: Tx) {
	return (
		tx.select({ value: meta.value }).from(meta).where(eq(meta.key, 'seq')).get()
			?.value ?? 0
	);
}

function nextSeq(tx: Tx) {
	return tx
		.insert(meta)
		.values({ key: 'seq', value: 1 })
		.onConflictDoUpdate({
			target: meta.key,
			set: { value: sql`${meta.value} + 1` },
		})
		.returning({ value: meta.value })
		.get()!.value;
}

export function createDocuments(db: Db) {
	const inCollection = (appId: number, collection: string) =>
		and(eq(documents.appId, appId), eq(documents.collection, collection));

	const live = (appId: number, collection: string) =>
		and(inCollection(appId, collection), isNotNull(documents.data));

	function list(tx: Tx, appId: number, collection: string): Doc[] {
		return tx
			.select({ data: documents.data })
			.from(documents)
			.where(live(appId, collection))
			.orderBy(sql`rowid`)
			.all()
			.map((row) => JSON.parse(row.data!));
	}

	return {
		/**
		 * The whole collection, or with `since` (a cursor from an earlier pull)
		 * only what changed after it. Changed documents are all reported as
		 * added: SignalDB applies added items with a full replace, but modified
		 * ones with $set, which would keep keys the server has since deleted.
		 */
		pull(appId: number, collection: string, since?: number): PullResult {
			return db.transaction((tx) => {
				const cursor = readSeq(tx);
				// A cursor ahead of the server comes from before the database was
				// reset or restored. Changes after it would miss everything written
				// since, so send the whole collection instead.
				if (since === undefined || since > cursor) {
					return { items: list(tx, appId, collection), cursor };
				}
				const rows = tx
					.select({ id: documents.id, data: documents.data })
					.from(documents)
					.where(and(inCollection(appId, collection), gt(documents.seq, since)))
					.orderBy(documents.seq)
					.all();
				const added: Doc[] = [];
				const removed: { id: string }[] = [];
				for (const row of rows) {
					if (row.data === null) removed.push({ id: row.id });
					else added.push(JSON.parse(row.data));
				}
				return { changes: { added, modified: [], removed }, cursor };
			});
		},

		/**
		 * Every operation is safe to repeat, since a client retries a push whose
		 * response it never received. Returns whether anything was written.
		 */
		applyChanges(appId: number, collection: string, changes: Changes) {
			return db.transaction((tx) => {
				// Taken on the first write, so a push that changes nothing doesn't
				// move the cursor.
				let seq: number | undefined;
				const takeSeq = () => (seq ??= nextSeq(tx));
				const write = (id: string, data: string) =>
					tx
						.insert(documents)
						.values({ appId, collection, id, data, seq: takeSeq() })
						.onConflictDoUpdate({
							target: [documents.appId, documents.collection, documents.id],
							set: { data, seq: takeSeq() },
						})
						.run();

				for (const doc of changes.added) write(doc.id, JSON.stringify(doc));
				for (const doc of changes.modified) {
					const row = tx
						.select({ data: documents.data })
						.from(documents)
						.where(and(live(appId, collection), eq(documents.id, doc.id)))
						.get();
					// Deleted by another client since; the delete wins.
					if (!row) continue;
					// Without changed paths, the client sent its whole doc.
					if (!Object.hasOwn(changes.modifiedFields, doc.id)) {
						write(doc.id, JSON.stringify(doc));
						continue;
					}
					const stored = JSON.parse(row.data!) as Doc;
					mergePaths(stored, doc, changes.modifiedFields[doc.id]!);
					write(doc.id, JSON.stringify(stored));
				}
				// Removed documents become tombstones, so incremental pulls can
				// report them. Removing one that doesn't exist does nothing.
				for (const id of changes.removed) {
					const exists = tx
						.select({ id: documents.id })
						.from(documents)
						.where(and(live(appId, collection), eq(documents.id, id)))
						.get();
					if (!exists) continue;
					tx.update(documents)
						.set({ data: null, seq: takeSeq() })
						.where(and(inCollection(appId, collection), eq(documents.id, id)))
						.run();
				}
				return seq !== undefined;
			});
		},

		/** Collections with at least one document, for the admin API. */
		collections(appId: number) {
			return db
				.select({
					name: documents.collection,
					documents: count(documents.data),
					storage,
				})
				.from(documents)
				.where(eq(documents.appId, appId))
				.groupBy(documents.collection)
				.having(({ documents }) => gt(documents, 0))
				.orderBy(documents.collection)
				.all();
		},

		list(appId: number, collection: string) {
			return db.transaction((tx) => list(tx, appId, collection));
		},

		/**
		 * Removes every document in a collection, as tombstones, so synced
		 * devices remove them too. Returns how many were removed.
		 */
		clear(appId: number, collection: string) {
			return db.transaction((tx) => {
				const inClear = live(appId, collection);
				const exists = tx
					.select({ id: documents.id })
					.from(documents)
					.where(inClear)
					.get();
				if (!exists) return 0;
				return tx
					.update(documents)
					.set({ data: null, seq: nextSeq(tx) })
					.where(inClear)
					.run().changes;
			});
		},
	};
}

export type Documents = ReturnType<typeof createDocuments>;
