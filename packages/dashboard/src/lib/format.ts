export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
	const mb = kb / 1024;
	return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
});

/** Like "12 Sep 2026". */
export const formatDate = (date: Date | string) =>
	dateFormat.format(new Date(date));

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 3600],
	['month', 30 * 24 * 3600],
	['week', 7 * 24 * 3600],
	['day', 24 * 3600],
	['hour', 3600],
	['minute', 60],
];

/** Like "2 minutes ago" or "yesterday"; "Just now" within a minute. */
export function formatAgo(date: Date | string) {
	const seconds = (Date.now() - +new Date(date)) / 1000;
	for (const [unit, size] of UNITS) {
		if (seconds >= size) {
			return capitalise(relative.format(-Math.floor(seconds / size), unit));
		}
	}
	return 'Just now';
}

const capitalise = (text: string) => text[0]!.toUpperCase() + text.slice(1);
