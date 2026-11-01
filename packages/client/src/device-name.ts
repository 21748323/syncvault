// A readable name for this device, like "Firefox on macOS", so the owner can
// tell devices apart when revoking one. Order matters: Edge and Chrome both
// claim to be Safari, and Edge also claims to be Chrome.
const BROWSERS: [RegExp, string][] = [
	[/Edg\//, 'Edge'],
	[/Firefox\/|FxiOS\//, 'Firefox'],
	[/OPR\//, 'Opera'],
	[/Chrome\/|CriOS\//, 'Chrome'],
	[/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
	[/iPhone|iPad|iPod/, 'iOS'],
	[/Android/, 'Android'],
	[/Windows/, 'Windows'],
	[/Mac OS X|Macintosh/, 'macOS'],
	[/CrOS/, 'ChromeOS'],
	[/Linux/, 'Linux'],
];

const match = (list: [RegExp, string][], userAgent: string) =>
	list.find(([pattern]) => pattern.test(userAgent))?.[1];

export function deviceName(userAgent: string) {
	const browser = match(BROWSERS, userAgent) ?? 'Browser';
	const system = match(SYSTEMS, userAgent);
	return system ? `${browser} on ${system}` : browser;
}
