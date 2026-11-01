import { fetchAppIcon } from './app-icon.ts';
import { describe, expect, test } from 'bun:test';

const ORIGIN = 'https://todos.example';

/** A fetch that serves `routes` (URL → response) and records what it got. */
function fakeFetch(routes: Record<string, () => Response>) {
	const requested: string[] = [];
	const fetchFn = (async (input: string | URL | Request) => {
		const url = String(input);
		requested.push(url);
		return routes[url]?.() ?? new Response('Not found', { status: 404 });
	}) as typeof fetch;
	return { fetchFn, requested };
}

const html = (body: string) => () =>
	new Response(body, { headers: { 'content-type': 'text/html' } });
const image =
	(body: string | Uint8Array, type = 'image/png') =>
	() =>
		new Response(body, { headers: { 'content-type': type } });

describe('fetchAppIcon', () => {
	test("uses the page's icon link, resolved against the page", async () => {
		const { fetchFn } = fakeFetch({
			[ORIGIN]: html('<link rel="shortcut icon" href="/static/icon.svg">'),
			[`${ORIGIN}/static/icon.svg`]: image('<svg/>', 'image/svg+xml'),
		});
		const icon = await fetchAppIcon(ORIGIN, fetchFn);
		expect(icon?.type).toBe('image/svg+xml');
		expect(Buffer.from(icon!.bytes).toString()).toBe('<svg/>');
	});

	test('falls back to /favicon.ico', async () => {
		const { fetchFn, requested } = fakeFetch({
			[ORIGIN]: html('<title>No icon here</title>'),
			[`${ORIGIN}/favicon.ico`]: image('ico', 'image/x-icon'),
		});
		expect((await fetchAppIcon(ORIGIN, fetchFn))?.type).toBe('image/x-icon');
		expect(requested).toEqual([ORIGIN, `${ORIGIN}/favicon.ico`]);
	});

	test('ignores responses that are not images', async () => {
		const { fetchFn } = fakeFetch({
			[ORIGIN]: html('<link href="/icon" rel=icon>'),
			[`${ORIGIN}/icon`]: html('<p>Not an image</p>'),
		});
		expect(await fetchAppIcon(ORIGIN, fetchFn)).toBeNull();
	});

	test('ignores icons that are too large', async () => {
		const { fetchFn } = fakeFetch({
			[`${ORIGIN}/favicon.ico`]: image(new Uint8Array(300 * 1024)),
		});
		expect(await fetchAppIcon(ORIGIN, fetchFn)).toBeNull();
	});

	test('returns null when the origin is unreachable', async () => {
		const fetchFn = (async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		expect(await fetchAppIcon(ORIGIN, fetchFn)).toBeNull();
	});
});
