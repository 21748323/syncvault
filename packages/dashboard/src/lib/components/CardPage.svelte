<script lang="ts">
	import Backdrop from './Backdrop.svelte';
	import Logo from './Logo.svelte';
	import { resolve } from '$app/paths';
	import { Card } from '#lib/components/ui/card/index.ts';
	import type { Snippet } from 'svelte';

	// The pages before the dashboard (setup, recovery, consent): one card on the
	// ground, laid out with CardHeader, CardContent and CardFooter. `above` sits
	// over the card, like setup's steps; with it, the card is anchored to the
	// top so it doesn't jump between steps. `backdrop` puts the sign-in page's
	// glow behind the card.
	let {
		title,
		backdrop = false,
		above,
		footer,
		children,
	}: {
		title: string;
		backdrop?: boolean;
		above?: Snippet;
		footer?: Snippet;
		children: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{title} · SyncVault</title>
</svelte:head>

<div class="isolate flex min-h-dvh flex-col overflow-hidden">
	<header class="p-6">
		<a
			class="inline-block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
			href={resolve('/(dashboard)')}
		>
			<Logo />
		</a>
	</header>
	<main
		class={[
			'flex flex-1 flex-col items-center px-4 pb-16',
			above ? 'pt-10 sm:pt-22' : 'justify-center sm:pb-28',
		]}
	>
		{@render above?.()}
		<div class="relative w-full max-w-105">
			{#if backdrop}<Backdrop />{/if}
			<Card>
				{@render children()}
			</Card>
		</div>
		{#if footer}
			<p
				class="mt-5 text-center text-[13px] text-as-faint [&_a]:font-medium [&_a]:text-as-muted [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-on-background"
			>
				{@render footer()}
			</p>
		{/if}
	</main>
</div>
