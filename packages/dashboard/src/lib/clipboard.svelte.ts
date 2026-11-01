/** Copies text to the clipboard; `copied` stays true for a moment after, so
 * the button can say so. */
export function createCopy() {
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	return {
		get copied() {
			return copied;
		},
		async copy(text: string) {
			await navigator.clipboard.writeText(text);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1500);
		},
	};
}
