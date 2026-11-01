<!--
@component
A note in the flow of a page: an optional icon, then AlertTitle and
AlertDescription. `tint` sets its colour.
-->

<script lang="ts">
	import '#lib/styles/tints.css';
	import './alert.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		tint = 'neutral',
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLDivElement> & {
		tint?: 'neutral' | 'accent' | 'danger' | 'warning';
	} = $props();
</script>

<div {...props} data-tint={tint} class={['Alert', className]}>
	{@render children?.()}
</div>
