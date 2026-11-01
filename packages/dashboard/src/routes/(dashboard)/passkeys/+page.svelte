<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, call } from '#lib/api.ts';
	import ActionDialog from '#lib/components/ActionDialog.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { deviceIcon } from '#lib/device-icon.ts';
	import { formatAgo, formatDate } from '#lib/format.ts';
	import { createCredential } from '#lib/passkeys.ts';
	import InfoIcon from '@lucide/svelte/icons/info';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { deviceName } from '@syncvault/client/device-name';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let dialog: ActionDialog;

	const last = $derived(data.passkeys.length === 1);

	const COLUMNS = 'md:grid-cols-[1fr_170px_170px_88px]';

	function add() {
		dialog.open({
			title: 'Add a passkey',
			message:
				'Your browser will ask where to save it: this device, a phone, or a security key.',
			confirm: 'Create passkey',
			field: {
				label: 'Passkey name',
				value: deviceName(navigator.userAgent),
				maxlength: 64,
			},
			run: async (name) => {
				const options = await call(api.admin.passkeys.options.post({}));
				const response = await createCredential(options);
				await call(api.admin.passkeys.post({ response, name }));
				await invalidateAll();
			},
		});
	}

	function rename(passkey: { id: string; name: string }) {
		dialog.open({
			title: 'Rename passkey',
			confirm: 'Save',
			field: { label: 'Passkey name', value: passkey.name, maxlength: 64 },
			run: async (name) => {
				await call(api.admin.passkeys({ id: passkey.id }).patch({ name }));
				await invalidateAll();
			},
		});
	}

	function remove(passkey: { id: string; name: string }) {
		dialog.open({
			title: `Delete ${passkey.name}?`,
			message: "It won't be able to sign in to this server any more.",
			confirm: 'Delete passkey',
			danger: true,
			run: async () => {
				await call(api.admin.passkeys({ id: passkey.id }).delete());
				await invalidateAll();
			},
		});
	}
</script>

<svelte:head>
	<title>Passkeys · SyncVault</title>
</svelte:head>

<div class="mb-5 flex items-center justify-between gap-4">
	<h1 class="text-3xl font-bold tracking-tight">Passkeys</h1>
	<Button variant="primary" tint="accent" onclick={add}>
		<PlusIcon />Add passkey
	</Button>
</div>

<Alert class="mb-5">
	<InfoIcon />
	<!-- On one line, so no spaces land inside the code. -->
	<!-- prettier-ignore -->
	<AlertDescription>
		If you lose every passkey, run <code class="whitespace-nowrap">bun run recover</code> on the server to get back in.
	</AlertDescription>
</Alert>

<div class="overflow-hidden rounded-xl border border-border bg-surface">
	<div
		class={[
			'hidden h-10 items-center gap-4 border-b border-border px-5 text-xs font-medium tracking-wider text-as-faint uppercase md:grid',
			COLUMNS,
		]}
	>
		<span>Passkey</span>
		<span>Added</span>
		<span>Last used</span>
	</div>
	{#each data.passkeys as passkey (passkey.id)}
		{@const Icon = deviceIcon(passkey.name)}
		{@const used = passkey.lastUsedAt ? formatAgo(passkey.lastUsedAt) : 'Never'}
		<div
			class={[
				'flex items-center gap-3.5 border-b border-border px-4 py-3 last:border-b-0 md:grid md:h-17 md:gap-4 md:px-5 md:py-0',
				COLUMNS,
			]}
		>
			<div class="flex min-w-0 flex-1 items-center gap-3.5">
				<span
					class="grid size-9 shrink-0 place-items-center rounded-[9px] border border-border bg-neutral-muted"
				>
					<Icon class="size-4.5" />
				</span>
				<div class="min-w-0">
					<b class="block truncate font-semibold">{passkey.name}</b>
					<small class="block text-xs text-as-muted md:hidden">
						Added {formatDate(passkey.createdAt)} · Used {used.toLowerCase()}
					</small>
				</div>
			</div>
			<span class="hidden text-as-muted md:inline">
				{formatDate(passkey.createdAt)}
			</span>
			<span class="hidden text-as-muted md:inline">{used}</span>
			<div class="-mr-2 flex justify-end gap-0.5">
				<Button
					shape="square"
					aria-label="Rename {passkey.name}"
					onclick={() => rename(passkey)}
				>
					<PencilIcon class="text-as-muted" />
				</Button>
				<!-- Disabled buttons don't show a title, so the wrapper does. -->
				<span title={last ? "The last passkey can't be deleted" : undefined}>
					<Button
						shape="square"
						aria-label="Delete {passkey.name}"
						disabled={last}
						onclick={() => remove(passkey)}
					>
						<Trash2Icon class="text-as-muted" />
					</Button>
				</span>
			</div>
		</div>
	{/each}
</div>

<ActionDialog bind:this={dialog} />
