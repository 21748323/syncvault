<script lang="ts">
	import './card.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		align = 'start',
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'center' } = $props();
</script>

<div {...props} data-align={align} class={['CardHeader', className]}>
	{@render children?.()}
</div>
