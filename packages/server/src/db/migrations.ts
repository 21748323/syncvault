import {
	type MigrationsJournal,
	readMigrationFiles,
} from 'drizzle-orm/migrator';
import { join } from 'node:path';

/**
 * The migrations, read when the code is transpiled or bundled: import it as a
 * macro (`with { type: 'macro' }`), so a compiled binary carries them rather
 * than looking for the folder on disk.
 */
export function migrations(): MigrationsJournal {
	return readMigrationFiles({
		migrationsFolder: join(import.meta.dir, 'migrations'),
	}).map((migration) => ({
		sql: migration.sql.join('--> statement-breakpoint'),
		timestamp: migration.folderMillis,
		name: migration.name,
	}));
}
