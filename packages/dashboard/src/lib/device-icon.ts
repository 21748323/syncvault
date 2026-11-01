import KeyRoundIcon from '@lucide/svelte/icons/key-round';
import LaptopIcon from '@lucide/svelte/icons/laptop';
import MonitorIcon from '@lucide/svelte/icons/monitor';
import SmartphoneIcon from '@lucide/svelte/icons/smartphone';

// Device and passkey names are free text (usually "Firefox on macOS" from the
// SDK, or what the owner typed), so the icon is a best guess.
const GUESSES: [RegExp, typeof LaptopIcon][] = [
	[/iphone|ipad|android|phone|ios\b/i, SmartphoneIcon],
	[/yubikey|security key|titan/i, KeyRoundIcon],
	[/mac|book|laptop/i, LaptopIcon],
];

export function deviceIcon(name: string) {
	return GUESSES.find(([pattern]) => pattern.test(name))?.[1] ?? MonitorIcon;
}
