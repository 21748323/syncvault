<script lang="ts">
	import './input.css';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		value = $bindable(),
		ref = $bindable(null),
		class: className,
		...props
	}: HTMLInputAttributes & { ref?: HTMLInputElement | null } = $props();
</script>

<input {...props} bind:this={ref} bind:value class={['Input', className]} />
