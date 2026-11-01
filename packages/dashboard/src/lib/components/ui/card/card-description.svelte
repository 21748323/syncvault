<script lang="ts">
	import './card.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p {...props} class={['CardDescription', className]}>
	{@render children?.()}
</p>
