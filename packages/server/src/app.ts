import { cors } from './cors.ts';
import { dashboard } from './dashboard.ts';
import { adminRoutes } from './routes/admin.ts';
import { oauthRoutes, oauthTokenRoutes } from './routes/oauth.ts';
import { setupRoutes } from './routes/setup.ts';
import { syncRoutes } from './routes/sync.ts';
import type { Services } from './services.ts';
import { Elysia } from 'elysia';

export function createApp(services: Services) {
	return new Elysia()
		.use(cors)
		.use(setupRoutes(services))
		.use(adminRoutes(services))
		.use(oauthRoutes(services))
		.use(oauthTokenRoutes(services))
		.use(syncRoutes(services))
		.use(dashboard(services.config.dashboardDir));
}

/** The server's routes and their types, for the dashboard's API client. */
export type App = ReturnType<typeof createApp>;
