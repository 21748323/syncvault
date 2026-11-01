<script lang="ts">
	import { sync } from '#lib/data/sync.svelte.ts';
	import SyncDialog from './SyncDialog.svelte';
	import SyncIcon from './SyncIcon.svelte';
	import type { SyncState } from '@syncvault/client';

	const LABELS: Record<SyncState, string> = {
		disconnected: 'Not syncing',
		connecting: 'Connecting…',
		online: 'Synced',
		offline: 'Offline',
		unauthorized: 'Reconnect needed',
	};

	let dialog = $state<SyncDialog>();
	const syncState = $derived(sync.status.state);
</script>

<header
	class="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-3"
>
	<!-- Nudged down: centred by its box, the bold heading looks high next to
	     the smaller button text. -->
	<h1 class="translate-y-px text-lg font-bold">Todos</h1>
	<button
		class={[
			'btn gap-1.5 btn-ghost font-normal btn-sm',
			syncState === 'offline' && 'text-warning',
			syncState === 'unauthorized' && 'text-error',
			(syncState === 'online' || syncState === 'disconnected') && 'opacity-70',
		]}
		aria-haspopup="dialog"
		onclick={() => dialog?.open()}
	>
		{LABELS[syncState]}
		<SyncIcon state={syncState} class="size-4" />
	</button>
</header>

<SyncDialog bind:this={dialog} />
