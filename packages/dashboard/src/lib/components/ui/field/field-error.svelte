<script lang="ts">
	import '#lib/styles/tints.css';
	import './field.css';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...props
	}: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p role="alert" {...props} data-tint="danger" class={['FieldError', className]}>
	{@render children?.()}
</p>
