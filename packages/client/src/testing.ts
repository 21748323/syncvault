import type { Env, KeyValueStorage } from './env.ts';

// Stand-ins for browser APIs, for tests.

export function memoryStorage(): KeyValueStorage {
	const items = new Map<string, string>();
	return {
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
		removeItem: (key) => void items.delete(key),
	};
}

/** A fake browser tab at `url`, recording where it was sent. */
export function testEnv(url: string) {
	let currentUrl = url;
	const navigations: string[] = [];
	const env: Env = {
		fetch: (input, init) => fetch(input, init),
		localStorage: memoryStorage(),
		sessionStorage: memoryStorage(),
		currentUrl: () => currentUrl,
		navigate: (to) => void navigations.push(to),
		replaceUrl: (to) => void (currentUrl = to),
		userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0',
		addEventListener: () => () => {},
	};
	return {
		env,
		navigations,
		/** Simulates the browser loading another URL in this tab. */
		load(to: string) {
			currentUrl = to;
		},
	};
}
