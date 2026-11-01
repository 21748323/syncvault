import { createRateLimiter } from '../auth/rate-limit.ts';
import type { Services } from '../services.ts';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	ownerSession,
	relyingParty,
	requireJsonBody,
	setSessionCookie,
} from './session.ts';
import {
	authenticationResponse,
	collectionName,
	passkeyName,
	registrationResponse,
} from './shared.ts';
import { Elysia, t } from 'elysia';

const appParams = t.Object({ id: t.Numeric() });

// Behind a reverse proxy every request comes from the proxy, which would make
// one rate limit shared by everyone. The proxy appends the real client's IP to
// X-Forwarded-For, so the last entry is the one a client can't forge.
function clientIp(
	request: Request,
	server: { requestIP(request: Request): { address: string } | null } | null,
	trustProxy: boolean
) {
	const forwarded = request.headers.get('x-forwarded-for');
	if (trustProxy && forwarded) return forwarded.split(',').at(-1)!.trim();
	return server?.requestIP(request)?.address ?? 'unknown';
}

// What the owner (through the dashboard) can see and do. Everything here needs
// the owner's session, apart from signing in and out.
export function adminRoutes(services: Services) {
	const { owner, oauth, documents, events } = services;
	const loginFailures = createRateLimiter(5, 60_000);

	return new Elysia({ prefix: '/api/admin' })
		.use(ownerSession(services))
		.onBeforeHandle(requireJsonBody)
		.post('/login/options', ({ request }) =>
			owner.loginOptions(relyingParty(services, request))
		)
		.post(
			'/login',
			async ({ body, cookie, request, server, status }) => {
				const ip = clientIp(request, server, services.config.trustProxy);
				if (loginFailures.isLimited(ip)) {
					return status(429, 'Too many failed attempts, try again later');
				}
				const session = await owner.login(
					relyingParty(services, request),
					body.response
				);
				if (!session) {
					loginFailures.fail(ip);
					return status(401, "That passkey isn't registered or didn't verify");
				}
				loginFailures.reset(ip);
				setSessionCookie(cookie, session, services, request);
				return status(204);
			},
			{ body: t.Object({ response: authenticationResponse }) }
		)
		.post('/logout', ({ cookie, status }) => {
			const session = cookie[SESSION_COOKIE];
			if (typeof session?.value === 'string') owner.logout(session.value);
			clearSessionCookie(cookie);
			return status(204);
		})
		.get('/me', ({ owner }) => owner, { owner: true })
		.get('/passkeys', () => owner.listPasskeys(), { owner: true })
		.post(
			'/passkeys/options',
			({ request }) => owner.addPasskeyOptions(relyingParty(services, request)),
			{ owner: true }
		)
		.post(
			'/passkeys',
			async ({ body, request, status }) => {
				const added = await owner.addPasskey(
					relyingParty(services, request),
					body.response,
					body.name
				);
				if (!added) return status(400, "The passkey couldn't be verified");
				return status(201);
			},
			{
				owner: true,
				body: t.Object({
					response: registrationResponse,
					name: t.Optional(passkeyName),
				}),
			}
		)
		.patch(
			'/passkeys/:id',
			({ body, params, status }) => {
				if (!owner.renamePasskey(params.id, body.name)) {
					return status(404, 'No such passkey');
				}
				return status(204);
			},
			{
				owner: true,
				params: t.Object({ id: t.String() }),
				body: t.Object({ name: passkeyName }),
			}
		)
		.delete(
			'/passkeys/:id',
			({ params, status }) => {
				const result = owner.deletePasskey(params.id);
				if (result === 'not_found') return status(404, 'No such passkey');
				if (result === 'last_passkey') {
					return status(409, "The last passkey can't be removed");
				}
				return status(204);
			},
			{ owner: true, params: t.Object({ id: t.String() }) }
		)
		.get('/apps', () => oauth.listApps(), { owner: true })
		.get(
			'/apps/:id',
			({ params, status }) => {
				const app = oauth.getApp(params.id);
				if (!app) return status(404, 'No such app');
				return {
					...app,
					devices: oauth.listDevices(app.id),
					collections: documents.collections(app.id),
				};
			},
			{ owner: true, params: appParams }
		)
		.get(
			'/apps/:id/icon',
			({ params, status }) => {
				const icon = oauth.getAppIcon(params.id);
				if (!icon) return status(404, 'No icon');
				return new Response(new Uint8Array(icon.bytes), {
					headers: {
						'content-type': icon.type,
						'cache-control': 'private, max-age=3600',
						// The bytes come from the app: an SVG opened directly
						// mustn't run scripts on this origin.
						'content-security-policy':
							"default-src 'none'; style-src 'unsafe-inline'",
						'x-content-type-options': 'nosniff',
					},
				});
			},
			{ owner: true, params: appParams }
		)
		.delete(
			'/apps/:id',
			({ params, status }) => {
				events.closeApp(params.id);
				if (!oauth.deleteApp(params.id)) return status(404, 'No such app');
				return status(204);
			},
			{ owner: true, params: appParams }
		)
		.get(
			'/apps/:id/collections/:name',
			({ params }) => documents.list(params.id, params.name),
			{
				owner: true,
				params: t.Object({ id: t.Numeric(), name: collectionName }),
			}
		)
		.delete(
			'/apps/:id/collections/:name',
			({ params }) => {
				const removed = documents.clear(params.id, params.name);
				if (removed > 0) events.broadcast(params.id, params.name);
				return { removed };
			},
			{
				owner: true,
				params: t.Object({ id: t.Numeric(), name: collectionName }),
			}
		)
		.delete(
			'/devices/:id',
			({ params, status }) => {
				events.closeDevice(params.id);
				if (!oauth.revokeDevice(params.id)) {
					return status(404, 'No such device');
				}
				return status(204);
			},
			{ owner: true, params: appParams }
		);
}
