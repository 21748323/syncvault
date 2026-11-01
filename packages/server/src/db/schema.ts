import { sql } from 'drizzle-orm';
import {
	blob,
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';

// Tokens of every kind (sessions, codes, access and refresh tokens) are stored
// only as SHA-256 hashes, so a leaked database can't be used to sign in.

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());

// The single account that owns this instance, created by setup. It signs in
// only with passkeys.
export const owner = sqliteTable(
	'owner',
	{
		id: integer().primaryKey(),
		// WebAuthn's opaque user handle (base64url), shared by every passkey.
		webauthnUserId: text('webauthn_user_id').notNull(),
		createdAt: createdAt(),
	},
	(table) => [check('single_owner', sql`${table.id} = 1`)]
);

// The owner's passkeys. `id` is the credential ID (base64url).
export const passkeys = sqliteTable('passkeys', {
	id: text().primaryKey(),
	publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
	counter: integer().notNull(),
	transports: text({ mode: 'json' }).$type<string[]>(),
	name: text().notNull(),
	createdAt: createdAt(),
	lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
});

// Issued from the terminal (`bun run recover`) when the owner has lost their
// passkeys. Single use.
export const recoveryTokens = sqliteTable('recovery_tokens', {
	tokenHash: text('token_hash').primaryKey(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

// The owner's browser sessions (dashboard, and approving apps).
export const sessions = sqliteTable('sessions', {
	tokenHash: text('token_hash').primaryKey(),
	createdAt: createdAt(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

// An app is identified by its origin (its OAuth client_id), and registered the
// first time the owner approves it.
export const apps = sqliteTable('apps', {
	id: integer().primaryKey(),
	clientId: text('client_id').notNull().unique(),
	name: text().notNull(),
	createdAt: createdAt(),
	lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
	// Fetched from the app's origin when it's first approved, so the dashboard
	// never loads anything from the app itself.
	icon: blob({ mode: 'buffer' }),
	iconType: text('icon_type'),
});

// One approved grant: an app on one device (or browser profile).
export const devices = sqliteTable('devices', {
	id: integer().primaryKey(),
	appId: integer('app_id')
		.notNull()
		.references(() => apps.id, { onDelete: 'cascade' }),
	name: text().notNull(),
	refreshTokenHash: text('refresh_token_hash').notNull().unique(),
	createdAt: createdAt(),
	lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
});

export const accessTokens = sqliteTable('access_tokens', {
	tokenHash: text('token_hash').primaryKey(),
	deviceId: integer('device_id')
		.notNull()
		.references(() => devices.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

// Authorization codes waiting to be exchanged for tokens. Single use.
export const authCodes = sqliteTable('auth_codes', {
	codeHash: text('code_hash').primaryKey(),
	appId: integer('app_id')
		.notNull()
		.references(() => apps.id, { onDelete: 'cascade' }),
	redirectUri: text('redirect_uri').notNull(),
	codeChallenge: text('code_challenge').notNull(),
	deviceName: text('device_name'),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

// Apps' data. The server doesn't know its shape: a document is any JSON object
// with a string id. A removed document stays as a tombstone (data is null) so
// incremental pulls can report the removal. `seq` is the value of the global
// sequence when the document last changed.
export const documents = sqliteTable(
	'documents',
	{
		appId: integer('app_id')
			.notNull()
			.references(() => apps.id, { onDelete: 'cascade' }),
		collection: text().notNull(),
		id: text().notNull(),
		data: text(),
		seq: integer().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.appId, table.collection, table.id] }),
		index('documents_changes').on(table.appId, table.collection, table.seq),
	]
);

// Server-wide counters. `seq` increases with every push, and is what pull
// cursors refer to.
export const meta = sqliteTable('meta', {
	key: text().primaryKey(),
	value: integer().notNull(),
});
