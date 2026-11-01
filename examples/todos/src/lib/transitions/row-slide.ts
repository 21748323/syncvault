import { cubicOut } from 'svelte/easing';
import { slide } from 'svelte/transition';

let instant = false;

/**
 * A transition for list rows and date groups: they slide open and fade in
 * when added, and collapse when removed, so the rest of the list moves
 * smoothly around them.
 */
export function rowSlide(node: Element) {
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (instant || reduceMotion) return { duration: 0 };
	const { css, ...options } = slide(node, { duration: 220, easing: cubicOut });
	// slide() only fades over the first few percent; fade across the whole
	// height change instead.
	return {
		...options,
		css: (t: number, u: number) => `${css?.(t, u)}; opacity: ${t}`,
	};
}

/**
 * Runs `update` with row transitions turned off, for changes that animate the
 * whole list some other way.
 */
export async function withoutRowSlide(update: () => Promise<void>) {
	instant = true;
	try {
		await update();
	} finally {
		instant = false;
	}
}
