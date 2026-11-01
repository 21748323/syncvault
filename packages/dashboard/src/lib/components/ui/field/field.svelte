<!--
@component
Lays out a form control with its Label, FieldDescription and FieldError.
-->

<script lang="ts">
	import './field.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div role="group" {...props} class={['Field', className]}>
	{@render children?.()}
</div>
