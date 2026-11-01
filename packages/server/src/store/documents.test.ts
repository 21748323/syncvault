import { createDb } from '../db/index.ts';
import { apps } from '../db/schema.ts';
import { type Changes, type PullResult, createDocuments } from './documents.ts';
import { findInvalidKey, mergePaths } from './merge.ts';
import { beforeEach, describe, expect, test } from 'bun:test';

const none: Changes = {
	added: [],
	modified: [],
	modifiedFields: {},
	removed: [],
};
const changes = (partial: Partial<Changes>): Changes => ({
	...none,
	...partial,
});

let store: ReturnType<typeof createDocuments>;
// Documents belong to an app, so each test gets two.
const appA = 1;
const appB = 2;
beforeEach(() => {
	const db = createDb(':memory:');
	db.insert(apps)
		.values([
			{ id: appA, clientId: 'https://a.example', name: 'A' },
			{ id: appB, clientId: 'https://b.example', name: 'B' },
		])
		.run();
	store = createDocuments(db);
});

const items = (collection: string, appId = appA) =>
	(store.pull(appId, collection) as Extract<PullResult, { items: unknown }>)
		.items;

function since(collection: string, cursor: number) {
	return store.pull(appA, collection, cursor) as Extract<
		PullResult,
		{ changes: unknown }
	>;
}

describe('applyChanges', () => {
	test('stores added docs per collection', () => {
		store.applyChanges(appA, 'a', changes({ added: [{ id: '1', x: 1 }] }));
		store.applyChanges(appA, 'b', changes({ added: [{ id: '1', x: 2 }] }));
		expect(items('a')).toEqual([{ id: '1', x: 1 }]);
		expect(items('b')).toEqual([{ id: '1', x: 2 }]);
	});

	test('keeps apps apart', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1', x: 1 }] }));
		store.applyChanges(appB, 'todos', changes({ added: [{ id: '1', x: 2 }] }));
		expect(items('todos', appA)).toEqual([{ id: '1', x: 1 }]);
		expect(items('todos', appB)).toEqual([{ id: '1', x: 2 }]);
	});

	test('repeating a push leaves the same state', () => {
		const push = changes({
			added: [{ id: '1', title: 'a' }],
			removed: ['2'],
		});
		store.applyChanges(appA, 'todos', push);
		store.applyChanges(appA, 'todos', push);
		expect(items('todos')).toEqual([{ id: '1', title: 'a' }]);
	});

	test('keeps edits to different fields from different clients', () => {
		store.applyChanges(
			appA,
			'todos',
			changes({ added: [{ id: '1', title: 'a', done: false }] })
		);
		// Each client sends its whole doc, but only its own field changed.
		store.applyChanges(
			appA,
			'todos',
			changes({
				modified: [{ id: '1', title: 'renamed', done: false }],
				modifiedFields: { '1': ['title'] },
			})
		);
		store.applyChanges(
			appA,
			'todos',
			changes({
				modified: [{ id: '1', title: 'a', done: true }],
				modifiedFields: { '1': ['done'] },
			})
		);
		expect(items('todos')).toEqual([{ id: '1', title: 'renamed', done: true }]);
	});

	test('skips modifications to docs removed by another client', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1' }] }));
		store.applyChanges(appA, 'todos', changes({ removed: ['1'] }));
		store.applyChanges(
			appA,
			'todos',
			changes({
				modified: [{ id: '1', title: 'a' }],
				modifiedFields: { '1': ['title'] },
			})
		);
		expect(items('todos')).toEqual([]);
	});

	test('removes docs, ignoring ones already gone', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1' }] }));
		store.applyChanges(appA, 'todos', changes({ removed: ['1', 'missing'] }));
		expect(items('todos')).toEqual([]);
	});
});

describe('pull since a cursor', () => {
	test('returns only what changed after the cursor', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1' }] }));
		const { cursor } = store.pull(appA, 'todos');
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '2' }] }));
		const result = since('todos', cursor);
		expect(result.changes).toEqual({
			added: [{ id: '2' }],
			modified: [],
			removed: [],
		});
		expect(result.cursor).toBeGreaterThan(cursor);
	});

	test('reports modified docs in full, as added', () => {
		store.applyChanges(
			appA,
			'todos',
			changes({ added: [{ id: '1', title: 'a', note: 'x' }] })
		);
		const { cursor } = store.pull(appA, 'todos');
		store.applyChanges(
			appA,
			'todos',
			changes({
				modified: [{ id: '1', title: 'b' }],
				modifiedFields: { '1': ['title', 'note'] },
			})
		);
		expect(since('todos', cursor).changes.added).toEqual([
			{ id: '1', title: 'b' },
		]);
	});

	test('reports removals by id', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1' }] }));
		const { cursor } = store.pull(appA, 'todos');
		store.applyChanges(appA, 'todos', changes({ removed: ['1'] }));
		expect(since('todos', cursor).changes).toEqual({
			added: [],
			modified: [],
			removed: [{ id: '1' }],
		});
	});

	test('revives a removed doc when it is added again', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1', v: 1 }] }));
		store.applyChanges(appA, 'todos', changes({ removed: ['1'] }));
		const { cursor } = store.pull(appA, 'todos');
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1', v: 2 }] }));
		expect(items('todos')).toEqual([{ id: '1', v: 2 }]);
		expect(since('todos', cursor).changes.added).toEqual([{ id: '1', v: 2 }]);
	});

	test('ignores changes to other collections and apps', () => {
		const { cursor } = store.pull(appA, 'todos');
		store.applyChanges(appA, 'other', changes({ added: [{ id: '1' }] }));
		store.applyChanges(appB, 'todos', changes({ added: [{ id: '1' }] }));
		expect(since('todos', cursor).changes).toEqual({
			added: [],
			modified: [],
			removed: [],
		});
	});
});

describe('clear', () => {
	test('removes every doc as a tombstone', () => {
		store.applyChanges(
			appA,
			'todos',
			changes({ added: [{ id: '1' }, { id: '2' }] })
		);
		const { cursor } = store.pull(appA, 'todos');
		expect(store.clear(appA, 'todos')).toBe(2);
		expect(items('todos')).toEqual([]);
		expect(since('todos', cursor).changes.removed).toEqual([
			{ id: '1' },
			{ id: '2' },
		]);
		expect(store.collections(appA)).toEqual([]);
	});
});

describe('mergePaths', () => {
	test('sets nested leaves without touching siblings', () => {
		const stored = { id: '1', meta: { a: 1, b: 1 } };
		mergePaths(stored, { id: '1', meta: { a: 2, b: 9 } }, ['meta.a']);
		expect(stored).toEqual({ id: '1', meta: { a: 2, b: 1 } });
	});

	test('deletes keys that are gone from the incoming doc', () => {
		const stored = { id: '1', note: 'x', meta: { a: 1, b: 1 } };
		mergePaths(stored, { id: '1', meta: { b: 1 } }, ['note', 'meta.a']);
		expect(stored as unknown).toEqual({ id: '1', meta: { b: 1 } });
	});

	test('replaces arrays whole', () => {
		const stored = { id: '1', tags: ['a', 'b', 'c'] };
		mergePaths(stored, { id: '1', tags: ['a'] }, ['tags.1', 'tags.2']);
		expect(stored).toEqual({ id: '1', tags: ['a'] });
	});

	test('creates objects missing from the stored doc', () => {
		const stored: Record<string, unknown> = { id: '1' };
		mergePaths(stored, { id: '1', meta: { a: { b: 1 } } }, ['meta.a.b']);
		expect(stored).toEqual({ id: '1', meta: { a: { b: 1 } } });
	});
});

describe('findInvalidKey', () => {
	test('finds dotted keys at any depth, including inside arrays', () => {
		expect(findInvalidKey({ id: '1', 'a.b': 1 })).toBe('a.b');
		expect(findInvalidKey({ id: '1', meta: { 'v1.2': true } })).toBe(
			'meta.v1.2'
		);
		expect(findInvalidKey({ id: '1', list: [{ 'x.y': 1 }] })).toBe(
			'list.0.x.y'
		);
	});

	test('allows dots in values', () => {
		expect(
			findInvalidKey({ id: '1', url: 'example.com', tags: ['a.b'] })
		).toBeUndefined();
	});
});

describe('unsafe keys', () => {
	test('finds __proto__ keys, as JSON.parse creates them', () => {
		const doc = JSON.parse('{"id":"1","a":{"__proto__":{"x":1}}}');
		expect(findInvalidKey(doc)).toBe('a.__proto__');
	});

	test('mergePaths never writes through __proto__', () => {
		const incoming = JSON.parse('{"id":"1","__proto__":{"polluted":true}}');
		mergePaths({ id: '1' }, incoming, ['__proto__.polluted']);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	test('treats inherited names like constructor as ordinary keys', () => {
		const stored: Record<string, unknown> = { id: '1' };
		mergePaths(stored, { id: '1', constructor: 'x' }, ['constructor']);
		expect(stored).toEqual({ id: '1', constructor: 'x' });
		mergePaths(stored, { id: '1' }, ['toString']);
		expect(Object.hasOwn(stored, 'toString')).toBe(false);
	});

	test('handles a modified doc whose id is an inherited name', () => {
		store.applyChanges(
			appA,
			'todos',
			changes({ added: [{ id: 'constructor', v: 1 }] })
		);
		store.applyChanges(
			appA,
			'todos',
			changes({
				modified: [{ id: 'constructor', v: 2 }],
				modifiedFields: { constructor: ['v'] },
			})
		);
		expect(items('todos')).toEqual([{ id: 'constructor', v: 2 }]);
	});
});

describe('edge cases', () => {
	test('a cursor ahead of the server gets the whole collection', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1' }] }));
		const result = store.pull(appA, 'todos', 900);
		expect(result).toEqual({ items: [{ id: '1' }], cursor: 1 });
	});

	test('a push that changes nothing leaves the cursor alone', () => {
		store.applyChanges(appA, 'todos', changes({ added: [{ id: '1' }] }));
		const { cursor } = store.pull(appA, 'todos');
		const changed = store.applyChanges(
			appA,
			'todos',
			changes({
				modified: [{ id: 'gone', x: 1 }],
				modifiedFields: { gone: ['x'] },
				removed: ['missing'],
			})
		);
		expect(changed).toBe(false);
		expect(store.pull(appA, 'todos').cursor).toBe(cursor);
		expect(store.clear(appA, 'empty')).toBe(0);
		expect(store.pull(appA, 'todos').cursor).toBe(cursor);
	});

	test('without changed paths, a modified doc replaces the stored one', () => {
		store.applyChanges(
			appA,
			'todos',
			changes({ added: [{ id: '1', title: 'a', done: true }] })
		);
		store.applyChanges(
			appA,
			'todos',
			changes({ modified: [{ id: '1', title: 'b' }] })
		);
		expect(items('todos')).toEqual([{ id: '1', title: 'b' }]);
	});
});
