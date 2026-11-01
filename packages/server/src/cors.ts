import { Elysia } from 'elysia';

// Apps are served from other origins, which can't be known in advance, so the
// routes apps call allow any origin. They authenticate with bearer tokens, never
// cookies, so this doesn't let other sites act as the owner. The owner's
// cookie routes (setup, admin, approving apps) get no CORS headers at all.
const PUBLIC_ROUTES = [
	/^\/api\/(info|events)$/,
	/^\/api\/collections\//,
	/^\/oauth\/(token|revoke)$/,
	/^\/\.well-known\/oauth-authorization-server$/,
];

export const cors = new Elysia({ name: 'cors' }).onRequest(
	({ request, set }) => {
		const { pathname } = new URL(request.url);
		if (!PUBLIC_ROUTES.some((route) => route.test(pathname))) return;
		set.headers['access-control-allow-origin'] = '*';
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'access-control-allow-origin': '*',
					'access-control-allow-methods': 'GET, POST, OPTIONS',
					'access-control-allow-headers': 'Authorization, Content-Type',
					'access-control-max-age': '86400',
				},
			});
		}
	}
);
