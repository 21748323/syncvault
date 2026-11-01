import { type AppIcon, fetchAppIcon } from './auth/app-icon.ts';
import { createOAuth } from './auth/oauth.ts';
import { createOwnerAuth } from './auth/owner.ts';
import type { Config } from './config.ts';
import type { Db } from './db/index.ts';
import { createEvents } from './events.ts';
import { createDocuments } from './store/documents.ts';

export function createServices(
	db: Db,
	config: Config,
	setupToken: string,
	// Replaced in tests, so they never reach an app's real origin.
	fetchIcon: (origin: string) => Promise<AppIcon | null> = fetchAppIcon
) {
	return {
		config,
		owner: createOwnerAuth(db, setupToken),
		oauth: createOAuth(db, config.accessTokenTtl, fetchIcon),
		documents: createDocuments(db),
		events: createEvents(config.pingInterval),
	};
}

export type Services = ReturnType<typeof createServices>;
