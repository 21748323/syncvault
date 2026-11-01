<!--
@component
A button, or a link styled as one when given an `href`. `variant` sets its
weight and `tint` its colour.
-->

<script module lang="ts">
	import type {
		HTMLAnchorAttributes,
		HTMLButtonAttributes,
	} from 'svelte/elements';

	type Variants = {
		shape: 'auto' | 'square';
		tint: 'neutral' | 'accent' | 'danger';
		variant: 'primary' | 'outline' | 'ghost';
	};

	type Props = Partial<Variants> &
		(
			| (HTMLButtonAttributes & { href?: undefined })
			| (HTMLAnchorAttributes & { href: string })
		);
</script>

<script lang="ts">
	import '#lib/styles/tints.css';
	import './button.css';

	let {
		shape = 'auto',
		tint = 'neutral',
		variant = 'ghost',
		class: className,
		children,
		...props
	}: Props = $props();
</script>

{#if props.href !== undefined}
	<a
		{...props as HTMLAnchorAttributes}
		data-shape={shape}
		data-tint={tint}
		data-variant={variant}
		class={['Button', className]}
	>
		{@render children?.()}
	</a>
{:else}
	<!-- Native buttons default to type="submit"; default to "button" instead so
	     a Button inside a <form> only submits it when asked to. -->
	<button
		type="button"
		{...props as HTMLButtonAttributes}
		data-shape={shape}
		data-tint={tint}
		data-variant={variant}
		class={['Button', className]}
	>
		{@render children?.()}
	</button>
{/if}
