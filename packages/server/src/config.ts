import { join } from 'node:path';

export interface Config {
	databaseFile: string;
	port: number;
	// The URL users reach the server at, if it differs from what requests show
	// (e.g. behind an https reverse proxy).
	publicUrl?: string;
	// Behind a reverse proxy, take the client's IP from X-Forwarded-For.
	trustProxy: boolean;
	pingInterval: number;
	// Seconds, as OAuth's expires_in.
	accessTokenTtl: number;
	setupToken?: string;
	// The dashboard SPA's build output.
	dashboardDir: string;
}

export function loadConfig(
	env: Record<string, string | undefined> = process.env
): Config {
	// Fails at startup rather than running with NaN or a busy-looping ping.
	function integer(name: string, fallback: number, min: number) {
		const raw = env[name];
		if (raw === undefined || raw === '') return fallback;
		const value = Number(raw);
		if (!Number.isInteger(value) || value < min) {
			throw new Error(`${name} must be an integer of at least ${min}`);
		}
		return value;
	}

	return {
		databaseFile: env.DATABASE_FILE || 'data/syncvault.sqlite',
		port: integer('PORT', 3000, 0),
		publicUrl: env.PUBLIC_URL?.replace(/\/$/, '') || undefined,
		trustProxy: ['1', 'true'].includes(env.TRUST_PROXY ?? ''),
		pingInterval: integer('PING_INTERVAL', 15_000, 1000),
		accessTokenTtl: integer('ACCESS_TOKEN_TTL', 3600, 0),
		setupToken: env.SETUP_TOKEN || undefined,
		dashboardDir:
			env.DASHBOARD_DIR || join(import.meta.dir, '../../dashboard/build'),
	};
}
