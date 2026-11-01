<script lang="ts">
	import './alert.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p {...props} class={['AlertTitle', className]}>
	{@render children?.()}
</p>
