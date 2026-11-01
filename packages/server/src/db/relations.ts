import * as schema from './schema.ts';
import { defineRelations } from 'drizzle-orm';

export const relations = defineRelations(schema, (r) => ({
	apps: {
		devices: r.many.devices(),
	},
	devices: {
		app: r.one.apps({
			from: r.devices.appId,
			to: r.apps.id,
			optional: false,
		}),
	},
}));
