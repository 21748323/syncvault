<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
</script>

<svelte:head>
	<title>{page.status} · SyncVault</title>
</svelte:head>

<div
	class="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center"
>
	<a
		class="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
		href={resolve('/(dashboard)')}
	>
		<Logo />
	</a>
	<div>
		<h1 class="mb-2 text-3xl font-bold tracking-tight">
			{page.status === 404 ? 'Not found' : 'Something went wrong'}
		</h1>
		<p class="text-as-muted">
			{page.status === 404 && page.error?.message === 'Not Found'
				? "There's nothing at this address."
				: page.error?.message}
		</p>
	</div>
	<Button variant="outline" href={resolve('/(dashboard)')}>Back to apps</Button>
</div>
