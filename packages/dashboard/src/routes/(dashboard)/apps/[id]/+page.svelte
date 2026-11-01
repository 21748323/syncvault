<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { api, call } from '#lib/api.ts';
	import ActionDialog from '#lib/components/ActionDialog.svelte';
	import AppIcon from '#lib/components/AppIcon.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { deviceIcon } from '#lib/device-icon.ts';
	import { formatAgo, formatBytes, formatDate } from '#lib/format.ts';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let dialog: ActionDialog;

	const app = $derived(data.app);
	const total = $derived(
		app.collections.reduce((sum, collection) => sum + collection.storage, 0)
	);
	const RECENT = 10 * 60 * 1000;
	const plural = (count: number, word: string) =>
		`${count} ${word}${count === 1 ? '' : 's'}`;

	function disconnect(device: { id: number; name: string }) {
		dialog.open({
			title: `Disconnect ${device.name}?`,
			message: `${app.name} on this device stops syncing until you approve it again.`,
			confirm: 'Disconnect',
			danger: true,
			run: async () => {
				await call(api.admin.devices({ id: device.id }).delete());
				await invalidateAll();
			},
		});
	}

	function clear(collection: { name: string; documents: number }) {
		dialog.open({
			title: `Clear ${collection.name}?`,
			message: `Removes its ${plural(collection.documents, 'document')} here and on every device.`,
			confirm: 'Clear',
			danger: true,
			run: async () => {
				await call(
					api.admin
						.apps({ id: app.id })
						.collections({ name: collection.name })
						.delete()
				);
				await invalidateAll();
			},
		});
	}

	function deleteApp() {
		dialog.open({
			title: `Delete ${app.name}?`,
			message: `Disconnects ${plural(app.devices.length, 'device')} and deletes its data from this server. This can't be undone.`,
			confirm: 'Delete app',
			danger: true,
			run: async () => {
				await call(api.admin.apps({ id: app.id }).delete());
				await goto(resolve('/(dashboard)'), { invalidateAll: true });
			},
		});
	}
</script>

<svelte:head>
	<title>{app.name} · SyncVault</title>
</svelte:head>

{#snippet activity(lastUsedAt: Date | string | null)}
	{@const recent = lastUsedAt && Date.now() - +new Date(lastUsedAt) < RECENT}
	<i class={['size-1.75 rounded-full', recent ? 'bg-accent' : 'bg-border']}></i>
	{lastUsedAt ? `Active ${formatAgo(lastUsedAt).toLowerCase()}` : 'Never used'}
{/snippet}

<a
	href={resolve('/(dashboard)')}
	class="mb-4 -ml-1 inline-flex items-center gap-1.5 rounded-md p-1 text-[13px] font-medium text-as-muted hover:text-on-background focus-visible:outline-2 focus-visible:outline-ring"
>
	<ArrowLeftIcon class="size-4" />Apps
</a>

<div class="mb-8 flex items-center gap-4">
	<AppIcon {app} large />
	<div class="min-w-0">
		<h1 class="truncate text-3xl font-bold tracking-tight">{app.name}</h1>
		<!-- On one line where it fits; stacked, without the dot, on phones. -->
		<p class="mt-1 flex flex-col text-[13px] text-as-muted sm:block">
			<span class="font-mono break-all text-on-background">{app.clientId}</span>
			<span class="whitespace-nowrap">
				<span class="hidden sm:inline">·</span>
				Connected since {formatDate(app.createdAt)}
			</span>
		</p>
	</div>
</div>

<section class="mb-8">
	<h2 class="mb-3 text-lg font-bold tracking-tight">Devices</h2>
	{#if app.devices.length === 0}
		<p
			class="rounded-xl border border-dashed border-border px-5 py-6 text-as-muted"
		>
			No devices are connected. Approving the app again connects one.
		</p>
	{:else}
		<ul class="overflow-hidden rounded-xl border border-border bg-surface">
			{#each app.devices as device (device.id)}
				{@const Icon = deviceIcon(device.name)}
				<li
					class="flex items-center gap-4 border-b border-border py-3 pr-3 pl-5 last:border-b-0"
				>
					<Icon class="size-4.5 shrink-0 text-as-muted" />
					<div class="min-w-0 flex-1">
						<b class="block truncate font-medium">{device.name}</b>
						<small class="block text-xs text-as-faint">
							Approved {formatDate(device.createdAt)}
						</small>
						<span
							class="mt-1 flex items-center gap-2 text-[13px] text-as-muted sm:hidden"
						>
							{@render activity(device.lastUsedAt)}
						</span>
					</div>
					<span
						class="hidden w-44 items-center gap-2 text-[13px] text-as-muted sm:flex"
					>
						{@render activity(device.lastUsedAt)}
					</span>
					<Button variant="outline" onclick={() => disconnect(device)}>
						Disconnect
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="mb-8">
	<div
		class="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"
	>
		<h2 class="text-lg font-bold tracking-tight">
			Data
			<span class="mx-1.5 font-sans font-normal text-as-faint">·</span>
			<span
				class="font-sans text-[15px] font-medium tracking-normal text-as-muted"
			>
				{formatBytes(total)}
			</span>
		</h2>
		<span class="text-[13px] text-as-faint">
			Clearing a collection also clears it on every device
		</span>
	</div>
	{#if app.collections.length === 0}
		<p
			class="rounded-xl border border-dashed border-border px-5 py-6 text-as-muted"
		>
			Nothing is stored yet.
		</p>
	{:else}
		<ul class="overflow-hidden rounded-xl border border-border bg-surface">
			{#each app.collections as collection (collection.name)}
				<li
					class="flex items-center gap-4 border-b border-border py-3 pr-3 pl-5 last:border-b-0"
				>
					<DatabaseIcon class="size-4.5 shrink-0 text-as-muted" />
					<div class="min-w-0 flex-1">
						<b class="block truncate font-mono text-[13px]">
							{collection.name}
						</b>
						<span class="text-[13px] text-as-muted sm:hidden">
							{plural(collection.documents, 'document')} · {formatBytes(
								collection.storage
							)}
						</span>
					</div>
					<span class="hidden w-44 text-[13px] text-as-muted sm:inline">
						{plural(collection.documents, 'document')} · {formatBytes(
							collection.storage
						)}
					</span>
					<Button
						variant="outline"
						tint="danger"
						onclick={() => clear(collection)}
					>
						Clear
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<div
	class="flex flex-col gap-4 rounded-xl border border-danger-muted-border bg-danger-muted/40 px-5 py-4.5 sm:flex-row sm:items-center sm:justify-between"
>
	<div>
		<b class="block font-semibold">Delete {app.name}</b>
		<p class="text-[13px] text-as-muted">
			Disconnects {plural(app.devices.length, 'device')} and deletes its data from
			this server.
		</p>
	</div>
	<Button variant="primary" tint="danger" onclick={deleteApp}>
		Delete app
	</Button>
</div>

<ActionDialog bind:this={dialog} />
