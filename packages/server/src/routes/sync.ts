import type { Services } from '../services.ts';
import { findInvalidKey } from '../store/merge.ts';
import { collectionName } from './shared.ts';
import { Elysia, t } from 'elysia';

const collectionParams = t.Object({ name: collectionName });
const doc = t.Object({ id: t.String() }, { additionalProperties: true });

// What apps call to sync. Each access token belongs to one device of one app,
// and an app only ever sees its own collections.
export function syncRoutes({ oauth, documents, events }: Services) {
	return (
		new Elysia({ prefix: '/api' })
			// derive runs before body validation, so a bad token gets a 401
			// rather than a validation error.
			.derive(({ headers, set, status }) => {
				const token = headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
				const device = token ? oauth.authenticate(token) : undefined;
				if (!device) {
					set.headers['www-authenticate'] = 'Bearer';
					return status(401, 'Missing, invalid or expired access token');
				}
				return { device };
			})
			// The whole collection, or with ?since=<cursor> only what changed
			// after that cursor.
			.get(
				'/collections/:name',
				({ device, params, query }) =>
					documents.pull(device.appId, params.name, query.since),
				{
					params: collectionParams,
					query: t.Object({ since: t.Optional(t.Numeric({ minimum: 0 })) }),
				}
			)
			.post(
				'/collections/:name/changes',
				({ device, params, body, status }) => {
					for (const doc of [...body.added, ...body.modified]) {
						const key = findInvalidKey(doc);
						if (key) {
							return status(
								422,
								`Keys can't contain dots or be __proto__: ${key} in ${doc.id}`
							);
						}
					}
					if (documents.applyChanges(device.appId, params.name, body)) {
						events.broadcast(device.appId, params.name);
					}
					return status(204);
				},
				{
					params: collectionParams,
					body: t.Object({
						added: t.Array(doc),
						modified: t.Array(doc),
						modifiedFields: t.Record(t.String(), t.Array(t.String())),
						removed: t.Array(t.String()),
					}),
				}
			)
			.get('/events', ({ device, request, server }) => {
				// The stream is meant to stay open, so don't apply Bun's idle timeout.
				server?.timeout(request, 0);
				return events.subscribe(device.appId, device.deviceId);
			})
	);
}
