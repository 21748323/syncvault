<script lang="ts">
	import './field.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p {...props} class={['FieldDescription', className]}>
	{@render children?.()}
</p>
