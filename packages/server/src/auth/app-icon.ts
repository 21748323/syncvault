export interface AppIcon {
	bytes: Uint8Array;
	type: string;
}

// The whole fetch, page and icon together, must finish within this.
const TIMEOUT = 5000;
const MAX_PAGE = 512 * 1024;
const MAX_ICON = 256 * 1024;

/**
 * Fetches an app's icon from its origin, for the dashboard to show: the page's
 * `<link rel="icon">`, or else /favicon.ico. Returns null if there's none, or
 * it isn't an image within the limits. Never throws.
 */
export async function fetchAppIcon(
	origin: string,
	fetchFn: typeof fetch = fetch
): Promise<AppIcon | null> {
	const signal = AbortSignal.timeout(TIMEOUT);
	try {
		const candidates = [new URL('/favicon.ico', origin).href];
		const page = await fetchFn(origin, { signal });
		if (page.ok && page.headers.get('content-type')?.includes('text/html')) {
			const html = await readAtMost(page, MAX_PAGE);
			const href = html && iconHref(new TextDecoder().decode(html));
			if (href) candidates.unshift(new URL(href, page.url || origin).href);
		}
		for (const url of candidates) {
			if (!/^(https?|data):/.test(url)) continue;
			const response = await fetchFn(url, { signal });
			const type = response.headers.get('content-type')?.split(';')[0];
			if (!response.ok || !type?.startsWith('image/')) continue;
			const bytes = await readAtMost(response, MAX_ICON);
			if (bytes?.length) return { bytes, type };
		}
	} catch {
		// Unreachable, too slow or malformed: the dashboard shows an initial.
	}
	return null;
}

/** The first `<link>` whose rel includes "icon". */
function iconHref(html: string) {
	for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
		const rel = attribute(tag, 'rel')?.toLowerCase().split(/\s+/);
		const href = attribute(tag, 'href');
		if (href && rel?.includes('icon')) return href;
	}
}

function attribute(tag: string, name: string) {
	const match = new RegExp(
		`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
		'i'
	).exec(tag);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

/** The body, or null if it's longer than `limit` bytes. */
async function readAtMost(response: Response, limit: number) {
	if (!response.body) return null;
	const chunks: Uint8Array[] = [];
	let length = 0;
	const reader = response.body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return Buffer.concat(chunks);
		length += value.length;
		if (length > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
}
