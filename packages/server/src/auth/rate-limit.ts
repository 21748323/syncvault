/**
 * Counts failures per key (e.g. an IP address) within a sliding window. Kept in
 * memory: losing the counts on restart is fine for slowing down guessing.
 */
export function createRateLimiter(max: number, windowMs: number) {
	const failures = new Map<string, number[]>();

	function recent(key: string) {
		const cutoff = Date.now() - windowMs;
		const times = (failures.get(key) ?? []).filter((time) => time > cutoff);
		if (times.length) failures.set(key, times);
		else failures.delete(key);
		return times;
	}

	return {
		isLimited: (key: string) => recent(key).length >= max,
		fail(key: string) {
			// Forget keys that have gone quiet, so many sources can't grow the
			// map forever.
			for (const other of failures.keys()) recent(other);
			failures.set(key, [...recent(key), Date.now()]);
		},
		reset(key: string) {
			failures.delete(key);
		},
	};
}
