// Shared-axis motion: old and new content move together on the same curve
// and duration, like one surface sliding past, and hand over with opacity.
const FLY_DISTANCE = '25%';
const BLUR = 'blur(2px)';
const DURATION = 320;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';
// The old content fades out early in the motion; the new content starts
// fading in slightly before that ends, for a brief crossfade.
const FADE_OUT = { duration: 120 };
const FADE_IN = { delay: 60, duration: 200 };

let outgoing: HTMLElement | undefined;

/**
 * Swaps `el`'s content with a fly transition. A static copy of the current
 * content flies out while `update` swaps in the new content, which flies in
 * from the other side at the same time.
 *
 * Both are real page content rather than view transition snapshots, which
 * shifted when swapped back on iOS Safari. The copy sits in a fixed layer
 * at the old content's on-screen position, so a scroll change from the new
 * content's height can't move it, and it can't widen or lengthen the page.
 *
 * @param direction 1 to move content towards the left, -1 towards the right.
 */
export async function flyTransition(
	el: HTMLElement,
	direction: 1 | -1,
	update: () => Promise<void>
) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		await update();
		return;
	}

	// Settle any transition still running from a previous switch.
	outgoing?.remove();
	for (const animation of el.getAnimations()) animation.cancel();

	const layer = createOutgoingLayer(el);
	outgoing = layer;
	el.before(layer);

	await update();

	const offset = (sign: number) =>
		`translateX(calc(${FLY_DISTANCE} * ${sign * direction}))`;
	const copy = layer.firstElementChild as HTMLElement;

	const motion = { duration: DURATION, easing: EASING };

	copy.animate([{}, { transform: offset(-1), filter: BLUR }], {
		...motion,
		fill: 'forwards',
	});
	copy
		.animate([{}, { opacity: 0 }], { ...FADE_OUT, fill: 'forwards' })
		.finished.finally(() => {
			layer.remove();
			if (outgoing === layer) outgoing = undefined;
		});

	el.animate([{ transform: offset(1), filter: BLUR }, {}], motion);
	el.animate([{ opacity: 0 }, {}], { ...FADE_IN, fill: 'backwards' });
}

// An inert, screen-sized layer holding a static copy of `el` at its
// current on-screen position.
function createOutgoingLayer(el: HTMLElement) {
	const copy = el.cloneNode(true) as HTMLElement;

	// Live state like `checked` and `value` isn't an attribute, so
	// cloneNode doesn't carry it over.
	const inputs = el.querySelectorAll('input');
	copy.querySelectorAll('input').forEach((input, i) => {
		input.checked = inputs[i].checked;
		input.value = inputs[i].value;
	});
	for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');

	const rect = el.getBoundingClientRect();
	Object.assign(copy.style, {
		position: 'absolute',
		top: `${rect.top}px`,
		left: `${rect.left}px`,
		width: `${rect.width}px`,
	});

	const layer = document.createElement('div');
	layer.inert = true;
	layer.setAttribute('aria-hidden', 'true');
	Object.assign(layer.style, {
		position: 'fixed',
		inset: '0',
		overflow: 'hidden',
		pointerEvents: 'none',
	});
	layer.append(copy);
	return layer;
}
