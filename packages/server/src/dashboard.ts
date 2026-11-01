import { Elysia } from 'elysia';
import { join, sep } from 'node:path';

// The dashboard: a static SvelteKit SPA (adapter-static, fallback `200.html`)
// served from `dir`. Paths without a file get the fallback, so the SPA's own
// router handles them, except under the API's prefixes, which 404 as before.

const API_PREFIXES = ['/api/', '/oauth/', '/.well-known/'];
const FALLBACK = '200.html';

const headers = {
	// Never in a frame, so other sites can't trick the owner into clicking
	// Allow on the consent page.
	'content-security-policy': "frame-ancestors 'none'",
	'x-frame-options': 'DENY',
};

export function dashboard(dir: string) {
	const root = join(dir, sep);
	return new Elysia().get('/*', async ({ request, status }) => {
		const path = decodeURIComponent(new URL(request.url).pathname);
		if (API_PREFIXES.some((prefix) => `${path}/`.startsWith(prefix))) {
			return status(404, 'Not found');
		}

		// join() resolves `..`, so anything outside the build is refused.
		const target = join(root, path);
		const file = Bun.file(target);
		if (target.startsWith(root) && target !== root && (await file.exists())) {
			return new Response(file, {
				headers: {
					...headers,
					// SvelteKit puts content-hashed files under _app/immutable.
					...(path.startsWith('/_app/immutable/') && {
						'cache-control': 'public, max-age=31536000, immutable',
					}),
				},
			});
		}

		const fallback = Bun.file(join(root, FALLBACK));
		if (!(await fallback.exists())) return status(404, 'Not found');
		return new Response(fallback, {
			headers: { ...headers, 'cache-control': 'no-cache' },
		});
	});
}
