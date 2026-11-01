<script lang="ts">
	import './card.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...props} class={['CardFooter', className]}>
	{@render children?.()}
</div>
