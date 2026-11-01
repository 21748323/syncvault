import { migrations } from './migrations.ts' with { type: 'macro' };
import { relations } from './relations.ts';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Opens the database and applies any migrations it hasn't had yet, so a
 * deployed instance upgrades itself on startup. Pass ':memory:' in tests.
 */
export function createDb(file: string) {
	if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
	const client = new Database(file, { strict: true });
	client.run('PRAGMA journal_mode = WAL');
	// Off by default in SQLite, and needed for the cascading deletes.
	client.run('PRAGMA foreign_keys = ON');
	const db = drizzle({ client, relations });
	migrate(db, migrations());
	return db;
}

export type Db = ReturnType<typeof createDb>;

export * as schema from './schema.ts';
