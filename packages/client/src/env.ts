// The browser APIs the SDK uses, gathered in one place so tests can run in Bun
// with stand-ins instead of a DOM.

export type KeyValueStorage = Pick<
	Storage,
	'getItem' | 'setItem' | 'removeItem'
>;

export interface Env {
	fetch(input: string, init?: RequestInit): Promise<Response>;
	localStorage: KeyValueStorage;
	sessionStorage: KeyValueStorage;
	/** The page's current URL. */
	currentUrl(): string;
	/** Navigates away, e.g. to the server's consent screen. */
	navigate(url: string): void;
	/** Changes the address bar without reloading, e.g. to remove `?code=`. */
	replaceUrl(url: string): void | Promise<void>;
	userAgent: string;
	/** Window events: `online`, and `storage` for other tabs' changes. */
	addEventListener(
		type: 'online' | 'storage',
		listener: (event: Event) => void
	): () => void;
}

export function browserEnv(): Env {
	return {
		fetch: (input, init) => fetch(input, init),
		localStorage,
		sessionStorage,
		currentUrl: () => location.href,
		navigate: (url) => location.assign(url),
		replaceUrl: (url) => history.replaceState(history.state, '', url),
		userAgent: navigator.userAgent,
		addEventListener(type, listener) {
			addEventListener(type, listener);
			return () => removeEventListener(type, listener);
		},
	};
}

/** Reads and writes a JSON value in storage, treating bad data as missing. */
export function jsonItem<T>(storage: KeyValueStorage, key: string) {
	return {
		get(): T | undefined {
			try {
				const raw = storage.getItem(key);
				return raw === null ? undefined : (JSON.parse(raw) as T);
			} catch {
				return undefined;
			}
		},
		set(value: T) {
			storage.setItem(key, JSON.stringify(value));
		},
		remove() {
			storage.removeItem(key);
		},
	};
}
