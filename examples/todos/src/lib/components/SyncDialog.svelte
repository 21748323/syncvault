<script lang="ts">
	import { sync } from '#lib/data/sync.svelte.ts';
	import SyncIcon from './SyncIcon.svelte';

	let dialog = $state<HTMLDialogElement>();
	let serverUrl = $state('');
	let busy = $state(false);

	const status = $derived(sync.status);
	const connected = $derived(
		status.state === 'online' ||
			status.state === 'offline' ||
			status.state === 'connecting'
	);
	const host = $derived(status.serverUrl && new URL(status.serverUrl).host);

	export function open() {
		// Reconnecting after a revoke usually means the same server.
		serverUrl ||= status.serverUrl ?? '';
		dialog?.showModal();
	}

	// A failed connection (e.g. access denied on the server) is reported after
	// the browser comes back, so open the dialog to show it.
	$effect(() => {
		if (sync.error && !dialog?.open) open();
	});

	async function connect(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		try {
			// Navigates to the server, so stay busy until the page unloads.
			await sync.connect(serverUrl);
		} catch {
			busy = false;
		}
	}

	async function disconnect() {
		busy = true;
		try {
			await sync.disconnect();
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="modal modal-bottom sm:modal-middle"
	onclose={sync.clearError}
>
	<div class="modal-box">
		<h2 class="mb-2 text-lg font-bold">Sync</h2>

		{#if connected}
			<p class="text-sm opacity-70">Your todos sync with</p>
			<p class="mb-4 font-semibold break-all">{host}</p>
			<div
				class={[
					'mb-6 flex items-center gap-2 rounded-box bg-base-200 p-3',
					status.state === 'offline' && 'text-warning',
				]}
			>
				<SyncIcon state={status.state} />
				<span>
					{#if status.state === 'online'}
						Up to date
					{:else if status.state === 'offline'}
						Can't reach the server. Changes will sync when it's back.
					{:else}
						Connecting…
					{/if}
				</span>
			</div>
			{#if sync.error}
				<p class="text-sm text-error">{sync.error}</p>
			{/if}
			<!-- Disconnecting can't be undone, so it's kept apart from Done. -->
			<div class="modal-action justify-between">
				<button
					class="btn btn-soft btn-error"
					disabled={busy}
					onclick={disconnect}
				>
					Disconnect
				</button>
				<form method="dialog"><button class="btn">Done</button></form>
			</div>
		{:else}
			{#if status.state === 'unauthorized'}
				<div role="alert" class="mb-4 alert alert-soft alert-warning">
					<SyncIcon state="unauthorized" />
					<span>
						The server disconnected this device. Your todos are still here;
						connect again to keep syncing.
					</span>
				</div>
			{:else}
				<p class="mb-4 opacity-80">
					Connect to a SyncVault server to keep your todos in sync across your
					devices.
				</p>
			{/if}
			<form id="connect-form" onsubmit={connect}>
				<label class="floating-label">
					<span>Server address</span>
					<input
						class={['input w-full', sync.error && 'input-error']}
						type="text"
						inputmode="url"
						placeholder="sync.example.com"
						autocomplete="url"
						autocapitalize="none"
						spellcheck="false"
						required
						bind:value={serverUrl}
						oninput={sync.clearError}
					/>
				</label>
				{#if sync.error}
					<p class="mt-2 text-sm text-error">{sync.error}</p>
				{/if}
			</form>
			<div class="modal-action">
				<form method="dialog">
					<button class="btn btn-ghost">Cancel</button>
				</form>
				<button
					class="btn btn-primary"
					form="connect-form"
					type="submit"
					disabled={busy}
				>
					{#if busy}
						<span class="loading loading-sm loading-spinner"></span>
					{/if}
					Connect
				</button>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>Close</button></form>
</dialog>
