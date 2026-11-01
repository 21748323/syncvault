// The server knows nothing about any app's data model: a collection is just a
// name, and a document is any JSON object with a string id and no dots in its
// keys (see findInvalidKey).
export type Doc = { id: string } & Record<string, unknown>;

// JSON.parse keeps "__proto__" as an ordinary key, but assigning to it (as a
// merge would) replaces an object's prototype, or with a path through it,
// changes Object.prototype for the whole server.
const FORBIDDEN_KEY = '__proto__';

/**
 * Returns the path of the first key that can't be stored, if any:
 * - A key containing a dot. Changed fields arrive as dot-joined paths, so a
 *   key like 'a.b' couldn't be told apart from the nested path a → b.
 *   SignalDB's own modifiers treat dots as path separators too.
 * - `__proto__`, which merging can't handle safely.
 */
export function findInvalidKey(value: unknown, path = ''): string | undefined {
	if (typeof value !== 'object' || value === null) return;
	for (const [key, child] of Object.entries(value)) {
		const childPath = path ? `${path}.${key}` : key;
		if (key.includes('.') || key === FORBIDDEN_KEY) return childPath;
		const found = findInvalidKey(child, childPath);
		if (found) return found;
	}
}

/**
 * Copies each changed path from `incoming` into `stored`, so edits to other
 * fields made by other clients are kept. A path whose incoming value is
 * undefined was deleted. Arrays are copied whole: per-index paths would leave
 * holes when an array shrinks. Paths through `__proto__` are ignored.
 */
export function mergePaths(
	stored: Record<string, unknown>,
	incoming: Record<string, unknown>,
	paths: string[]
) {
	for (const path of paths) {
		const keys = path.split('.');
		if (keys.includes(FORBIDDEN_KEY)) continue;
		let target = stored;
		let source: unknown = incoming;
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i]!;
			// Own properties only, so inherited ones like `constructor` read as
			// missing rather than as functions.
			const value = Object.hasOwn(source as object, key)
				? (source as Record<string, unknown>)[key]
				: undefined;
			const isLast = i === keys.length - 1;
			if (isLast || !isPlainObject(value)) {
				if (value === undefined) delete target[key];
				else target[key] = structuredClone(value);
				break;
			}
			if (!Object.hasOwn(target, key) || !isPlainObject(target[key])) {
				target[key] = {};
			}
			target = target[key] as Record<string, unknown>;
			source = value;
		}
	}
	return stored;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
