export interface DateGroup<T> {
	label: string;
	items: T[];
}

// Local midnight `daysAgo` days before `now`. Uses calendar days rather than
// fixed 24h steps so daylight saving changes don't shift the boundaries.
function startOfDay(now: Date, daysAgo = 0) {
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() - daysAgo
	).getTime();
}

// Relative buckets for recent items, then calendar months for older ones.
export function dateLabel(timestamp: number, now = new Date()) {
	if (timestamp >= startOfDay(now)) return 'Today';
	if (timestamp >= startOfDay(now, 1)) return 'Yesterday';
	if (timestamp >= startOfDay(now, 7)) return 'Previous 7 days';
	if (timestamp >= startOfDay(now, 30)) return 'Previous 30 days';

	const date = new Date(timestamp);
	return date.toLocaleDateString(undefined, {
		month: 'long',
		year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
	});
}

// Expects items already sorted by date, so each label forms one run.
export function groupByDate<T>(
	items: T[],
	getTimestamp: (item: T) => number,
	now = new Date()
): DateGroup<T>[] {
	const groups: DateGroup<T>[] = [];
	for (const item of items) {
		const label = dateLabel(getTimestamp(item), now);
		const last = groups.at(-1);
		if (last?.label === label) last.items.push(item);
		else groups.push({ label, items: [item] });
	}
	return groups;
}
