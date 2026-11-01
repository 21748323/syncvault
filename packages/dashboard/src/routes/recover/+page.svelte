<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { api, call, describe } from '#lib/api.ts';
	import CardPage from '#lib/components/CardPage.svelte';
	import {
		Alert,
		AlertDescription,
		AlertTitle,
	} from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import {
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from '#lib/components/ui/card/index.ts';
	import { Field, Label } from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { createCredential } from '#lib/passkeys.ts';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { deviceName } from '@syncvault/client/device-name';

	let recoveryToken = $state('');
	let name = $state(deviceName(navigator.userAgent));
	let busy = $state(false);
	let error = $state('');

	async function recover(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const body = { recoveryToken: recoveryToken.trim() };
			const options = await call(api.recover.options.post(body));
			const response = await createCredential(options);
			await call(api.recover.post({ ...body, response, name: name.trim() }));
			await goto(resolve('/(dashboard)'), { invalidateAll: true });
		} catch (cause) {
			error = describe(cause);
		} finally {
			busy = false;
		}
	}
</script>

<CardPage title="Recover access" backdrop>
	<!-- `contents` keeps the card's spacing between header, content and footer -->
	<form class="contents" onsubmit={recover}>
		<CardHeader>
			<CardTitle level={1}>Recover access</CardTitle>
			<CardDescription>
				On the server, run this command and paste the token it prints. Tokens
				last an hour.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<code
				class="flex h-10 items-center gap-2.5 rounded-[10px] border-border bg-background px-4 text-[13px]"
			>
				<span class="text-as-faint" aria-hidden="true">$</span>
				bun run recover
			</code>
			<Field>
				<Label for="recovery-token">Recovery token</Label>
				<Input
					id="recovery-token"
					class="font-mono"
					placeholder="Paste the token"
					autocomplete="off"
					required
					bind:value={recoveryToken}
				/>
			</Field>
			<Field>
				<Label for="passkey-name">New passkey name</Label>
				<Input id="passkey-name" maxlength={64} required bind:value={name} />
			</Field>
			<Alert tint="warning">
				<TriangleAlertIcon />
				<AlertTitle>Your other passkeys will stop working</AlertTitle>
				<AlertDescription>
					This removes them and signs out every session, in case a lost device
					was stolen.
				</AlertDescription>
			</Alert>
			{#if error}
				<Alert tint="danger" role="alert">
					<CircleAlertIcon />
					<AlertTitle>Couldn't recover access</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}
		</CardContent>
		<CardFooter>
			<Button
				class="ms-auto"
				type="submit"
				variant="primary"
				tint="accent"
				disabled={busy}
			>
				{#if busy}
					<LoaderCircleIcon class="animate-spin" />
				{:else}
					<KeyRoundIcon />
				{/if}
				Create new passkey
			</Button>
		</CardFooter>
	</form>
	{#snippet footer()}
		Have a passkey after all? <a href={resolve('/login')}>Sign in</a>
	{/snippet}
</CardPage>
