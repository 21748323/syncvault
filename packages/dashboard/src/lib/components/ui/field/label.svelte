<script lang="ts">
	import './field.css';
	import type { HTMLLabelAttributes } from 'svelte/elements';

	let { class: className, children, ...props }: HTMLLabelAttributes = $props();
</script>

<label {...props} class={['Label', className]}>
	{@render children?.()}
</label>
