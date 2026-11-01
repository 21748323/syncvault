<script lang="ts">
	import { resolve } from '$app/paths';
	import AppIcon from '#lib/components/AppIcon.svelte';
	import CopyButton from '#lib/components/CopyButton.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { formatAgo, formatBytes } from '#lib/format.ts';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Synced in the last few minutes: shown with a lit dot.
	const RECENT = 10 * 60 * 1000;
	const isRecent = (date: Date | string | null) =>
		date !== null && Date.now() - +new Date(date) < RECENT;
	const plural = (count: number, word: string) =>
		`${count} ${word}${count === 1 ? '' : 's'}`;

	const COLUMNS = 'md:grid-cols-[1fr_100px_120px_170px_16px]';
</script>

<svelte:head>
	<title>Apps · SyncVault</title>
</svelte:head>

{#snippet synced(date: Date | string | null)}
	<span class="flex items-center gap-2 text-as-muted">
		<i
			class={[
				'size-1.75 shrink-0 rounded-full',
				isRecent(date) ? 'bg-accent' : 'bg-border',
			]}
		></i>
		{date ? formatAgo(date) : 'Never'}
	</span>
{/snippet}

<h1 class="mb-5 text-3xl font-bold tracking-tight">Apps</h1>

<Alert class="mb-5">
	<InfoIcon />
	<AlertDescription class="leading-7 sm:leading-5">
		To connect {data.apps.length ? 'a new' : 'an'} app, enter
		<CopyButton text={data.info.url} /> in the app and approve it.
	</AlertDescription>
</Alert>

{#if data.apps.length === 0}
	<div
		class="rounded-xl border border-dashed border-border px-6 py-14 text-center"
	>
		<p class="mb-1 font-medium">No apps yet</p>
		<p class="text-as-muted">Apps appear here once you approve them.</p>
	</div>
{:else}
	<!-- A table from md up; a stacked list below it. -->
	<div class="overflow-hidden rounded-xl border border-border bg-surface">
		<div
			class={[
				'hidden h-10 items-center gap-4 border-b border-border px-5 text-xs font-medium tracking-wider text-as-faint uppercase md:grid',
				COLUMNS,
			]}
		>
			<span>App</span>
			<span>Devices</span>
			<span>Storage</span>
			<span>Last synced</span>
		</div>
		{#each data.apps as app (app.id)}
			<a
				href={resolve('/(dashboard)/apps/[id]', { id: String(app.id) })}
				class={[
					'flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0 hover:bg-white/3 focus-visible:bg-white/3 focus-visible:outline-none md:grid md:h-18 md:gap-4 md:px-5 md:py-0',
					COLUMNS,
				]}
			>
				<span class="flex min-w-0 flex-1 items-center gap-3 md:gap-3.5">
					<AppIcon {app} />
					<span class="min-w-0">
						<b class="block truncate font-semibold">{app.name}</b>
						<small class="block truncate font-mono text-xs text-as-muted">
							{app.clientId}
						</small>
						<span
							class="mt-1.5 flex flex-wrap gap-x-1.5 text-xs text-as-muted md:hidden"
						>
							{@render synced(app.lastSeenAt)}
							<span class="text-as-faint">·</span>
							{plural(app.devices, 'device')}
							<span class="text-as-faint">·</span>
							{formatBytes(app.storage)}
						</span>
					</span>
				</span>
				<span class="hidden md:inline">{app.devices}</span>
				<span class="hidden md:inline">{formatBytes(app.storage)}</span>
				<span class="hidden md:inline">{@render synced(app.lastSeenAt)}</span>
				<ChevronRightIcon class="size-4 shrink-0 text-as-faint" />
			</a>
		{/each}
	</div>
{/if}
