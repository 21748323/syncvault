<script lang="ts">
	import './card.css';
	import type { HTMLAttributes } from 'svelte/elements';

	// The heading level depends on the page: a card that is the page uses 1.
	let {
		level = 2,
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 } = $props();
</script>

<svelte:element this={`h${level}`} {...props} class={['CardTitle', className]}>
	{@render children?.()}
</svelte:element>
