<script lang="ts">
	import './layout.css';
	import { afterNavigate } from '$app/navigation';
	import favicon from '#lib/assets/favicon.svg';
	import { startSync } from '#lib/data/sync.svelte.ts';
	import { notifications, notify } from '#lib/notifications.svelte.ts';
	import { swUpdate, watchForUpdates } from '#lib/offline/sw-update.svelte.ts';
	import { fly } from 'svelte/transition';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	watchForUpdates();
	// The first afterNavigate is once the router has started.
	afterNavigate(startSync);

	// A last resort, so a failure nothing else handled isn't only in the
	// console. Not prevented, so the console still has the details.
	function unexpected(cause: unknown) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		notify(`Something went wrong: ${detail}`);
	}
	addEventListener('unhandledrejection', (event) => unexpected(event.reason));
	addEventListener('error', (event) =>
		unexpected(event.error ?? event.message)
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<div class="toast toast-center toast-top z-20 w-full max-w-md">
	{#if swUpdate.available}
		<div
			role="status"
			class="alert shadow-lg"
			transition:fly={{ y: -16, duration: 150 }}
		>
			<span>A new version is available.</span>
			<div class="flex gap-1 justify-self-end">
				<button class="btn btn-ghost btn-sm" onclick={swUpdate.dismiss}>
					Later
				</button>
				<button class="btn btn-primary btn-sm" onclick={swUpdate.apply}>
					Reload
				</button>
			</div>
		</div>
	{/if}
	{#each notifications.list as notification (notification.id)}
		<div
			role="alert"
			class="alert alert-error shadow-lg"
			transition:fly={{ y: -16, duration: 150 }}
		>
			<span class="whitespace-normal">{notification.message}</span>
			<button
				class="btn justify-self-end btn-ghost btn-sm"
				aria-label="Dismiss"
				onclick={() => notifications.dismiss(notification.id)}
			>
				✕
			</button>
		</div>
	{/each}
</div>
