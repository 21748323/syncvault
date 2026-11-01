<script lang="ts">
	import './alert.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...props} class={['AlertDescription', className]}>
	{@render children?.()}
</div>
