<!--
@component
A surface for one task. Lay it out with CardHeader (CardTitle and
CardDescription), CardContent and CardFooter; the card spaces them evenly.
-->

<script lang="ts">
	import './card.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLElement> = $props();
</script>

<section {...props} class={['Card', className]}>
	{@render children?.()}
</section>
