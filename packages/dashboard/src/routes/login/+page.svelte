<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { describe } from '#lib/api.ts';
	import mark from '#lib/assets/favicon.svg';
	import Backdrop from '#lib/components/Backdrop.svelte';
	import {
		Alert,
		AlertDescription,
		AlertTitle,
	} from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { passkeysSupported, signIn } from '#lib/passkeys.ts';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

	// The one page without a card: the vault mark on the backdrop, and a single
	// action. Pages that need a session (the dashboard, consent) send the owner
	// here with `next`, and come back once signed in.

	let busy = $state(false);
	let error = $state('');

	const host = $derived(new URL(page.data.info.url).host);

	// Only back to a page on this site.
	function next() {
		const target = page.url.searchParams.get('next');
		return target?.startsWith('/') && !target.startsWith('//') ? target : '/';
	}

	async function submit() {
		busy = true;
		error = '';
		try {
			await signIn();
			// `next` is any page on this site, so it can't be resolved here.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(next(), { invalidateAll: true });
		} catch (cause) {
			error = describe(cause);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in · SyncVault</title>
</svelte:head>

<main
	class="isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16"
>
	<div class="relative">
		<Backdrop />
		<img
			class="size-22 drop-shadow-[0_12px_32px_rgb(0_0_0/45%)]"
			src={mark}
			alt="SyncVault"
		/>
	</div>

	<h1 class="mt-10 text-center text-4xl font-bold tracking-tight">
		Welcome back
	</h1>
	<p
		class="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-as-muted"
	>
		Sign in to
		<span
			class="inline-flex h-6 items-center rounded-full border border-white/14 bg-background/55 px-2.5 font-mono text-xs text-on-background"
		>
			{host}
		</span>
	</p>

	<div class="mt-7 flex w-full max-w-75 flex-col gap-4">
		{#if passkeysSupported()}
			<Button
				class="h-11 rounded-xl text-[15px] shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--color-brand-primary)_80%,transparent),inset_0_1px_0_rgb(255_255_255/50%)]"
				variant="primary"
				tint="accent"
				disabled={busy}
				onclick={submit}
			>
				{#if busy}
					<LoaderCircleIcon class="animate-spin" />
				{:else}
					<KeyRoundIcon />
				{/if}
				Sign in with a passkey
			</Button>
		{:else}
			<Alert>
				<CircleAlertIcon />
				<AlertTitle>This browser doesn't support passkeys</AlertTitle>
				<AlertDescription>Try an up-to-date browser.</AlertDescription>
			</Alert>
		{/if}
		{#if error}
			<Alert tint="danger" role="alert">
				<CircleAlertIcon />
				<AlertTitle>Couldn't sign in</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		{/if}
		<p class="text-center text-[13px] text-as-muted">
			Lost your passkeys?
			<a
				class="font-medium text-on-background underline decoration-white/35 underline-offset-4 hover:decoration-white"
				href={resolve('/recover')}
			>
				Recover access
			</a>
		</p>
	</div>
</main>
