import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';

// One cache per build, so a new deploy never serves a mix of old and new files.
const CACHE = `cache-${version}`;

// Manifest paths are relative to the base path ('' is the root page), and the
// worker is always served from the base path, so resolve against its folder.
const ROOT = new URL('./', self.location.href);
const toPathname = (path: string) => new URL(path, ROOT).pathname;

// The app is fully prerendered and todos live in IndexedDB, so caching the
// build output is enough for it to load and work offline.
const PRECACHE = [...immutable, ...assets, ...prerendered].map(({ path }) =>
	toPathname(path)
);
const PRECACHED = new Set(PRECACHE);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

// A new version waits until the page asks it to take over (see sw-update),
// so open tabs keep running against the cache they loaded from.
self.addEventListener('message', (event) => {
	if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (PRECACHED.has(url.pathname)) {
		event.respondWith(
			caches
				.match(url.pathname, { cacheName: CACHE })
				.then((cached) => cached ?? fetch(request))
		);
		return;
	}

	// Pages not in the precache (e.g. a URL with a query string) fall back to
	// the prerendered root, which boots the client-side app.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const fallback = await caches.match(ROOT.pathname, {
					cacheName: CACHE,
				});
				return fallback ?? Response.error();
			})
		);
	}
});
