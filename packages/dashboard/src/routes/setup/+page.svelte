<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { api, call, describe } from '#lib/api.ts';
	import AddressField from '#lib/components/AddressField.svelte';
	import CardPage from '#lib/components/CardPage.svelte';
	import Steps from '#lib/components/Steps.svelte';
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
	import {
		Field,
		FieldDescription,
		FieldError,
		Label,
	} from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { createCredential } from '#lib/passkeys.ts';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import InfoIcon from '@lucide/svelte/icons/info';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ScanFaceIcon from '@lucide/svelte/icons/scan-face';
	import UsbIcon from '@lucide/svelte/icons/usb';
	import { deviceName } from '@syncvault/client/device-name';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const STEPS = ['Token', 'Address', 'Passkey', 'Done'];
	const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

	let step = $state(0);
	let setupToken = $state('');
	let fromLink = $state(false);
	let name = $state(deviceName(navigator.userAgent));
	let busy = $state(false);
	let error = $state('');

	// Passkeys and the SDK both need a secure context: https, or this machine.
	const address = $derived(new URL(data.info.url));
	const insecure = $derived(
		address.protocol === 'http:' && !LOOPBACK.has(address.hostname)
	);

	onMount(() => {
		if (data.info.setupComplete) return goto(resolve('/(dashboard)'));
		// The link the server prints carries the token in its fragment, which
		// never reaches the server. Take it, and drop it from the address bar.
		const token = new URLSearchParams(location.hash.slice(1)).get('token');
		if (token) {
			setupToken = token;
			fromLink = true;
			replaceState(resolve('/setup'), page.state);
		}
	});

	function go(to: number) {
		error = '';
		step = to;
	}

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
		} catch (cause) {
			error = describe(cause);
		} finally {
			busy = false;
		}
	}

	// Asking for options checks the token without registering anything.
	const checkToken = (event: SubmitEvent) => {
		event.preventDefault();
		return run(async () => {
			setupToken = setupToken.trim();
			await call(api.setup.options.post({ setupToken }));
			step = 1;
		});
	};

	const createPasskey = (event: SubmitEvent) => {
		event.preventDefault();
		return run(async () => {
			const options = await call(api.setup.options.post({ setupToken }));
			const response = await createCredential(options);
			await call(api.setup.post({ setupToken, response, name: name.trim() }));
			step = 3;
		});
	};
</script>

<CardPage title="Set up">
	{#snippet above()}
		<Steps steps={STEPS} current={step} />
	{/snippet}

	{#if step === 0}
		<!-- `contents` keeps the card's spacing between header, content and footer -->
		<form class="contents" onsubmit={checkToken}>
			<CardHeader>
				<CardTitle level={1}>Start setup</CardTitle>
				<CardDescription>
					Enter the setup token from your server's console to claim this
					instance.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Field>
					<Label for="setup-token">Setup token</Label>
					<Input
						id="setup-token"
						class="font-mono"
						autocomplete="off"
						required
						aria-invalid={error ? 'true' : undefined}
						aria-describedby="setup-token-help"
						bind:value={setupToken}
						oninput={() => {
							fromLink = false;
							error = '';
						}}
					/>
					{#if error}
						<FieldError id="setup-token-help">{error}</FieldError>
					{:else if fromLink}
						<FieldDescription id="setup-token-help">
							<CircleCheckIcon />
							Filled in from the setup link
						</FieldDescription>
					{/if}
				</Field>
			</CardContent>
			<CardFooter>
				<Button
					class="ms-auto"
					type="submit"
					variant="primary"
					tint="accent"
					disabled={busy}
				>
					Continue
					{#if busy}
						<LoaderCircleIcon class="animate-spin" />
					{:else}
						<ArrowRightIcon />
					{/if}
				</Button>
			</CardFooter>
		</form>
	{:else if step === 1}
		<CardHeader>
			<CardTitle level={1}>Check this address</CardTitle>
			<CardDescription>
				Confirm your apps will connect to this address.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<Field>
				<Label for="address">Server address</Label>
				<AddressField
					id="address"
					url={data.info.url}
					aria-invalid={insecure || undefined}
				/>
			</Field>
			<!-- Kept on one line so no space lands before the full stop. -->
			{#if insecure}
				<Alert tint="danger">
					<CircleAlertIcon />
					<AlertTitle>This address won't work</AlertTitle>
					<!-- prettier-ignore -->
					<AlertDescription>
						SyncVault needs an HTTPS or localhost address. Set <code>PUBLIC_URL</code> and restart the server.
					</AlertDescription>
				</Alert>
			{:else}
				<Alert>
					<InfoIcon />
					<AlertTitle>Pick the address you'll keep</AlertTitle>
					<!-- prettier-ignore -->
					<AlertDescription>
						Changing the domain later means recovering access from the server's console. Wrong address? Set <code>PUBLIC_URL</code> and restart the server.
					</AlertDescription>
				</Alert>
			{/if}
		</CardContent>
		<CardFooter>
			<Button variant="outline" onclick={() => go(0)}>Back</Button>
			<Button
				class="ms-auto"
				variant="primary"
				tint="accent"
				disabled={insecure}
				onclick={() => go(2)}
			>
				Looks right <ArrowRightIcon />
			</Button>
		</CardFooter>
	{:else if step === 2}
		<form class="contents" onsubmit={createPasskey}>
			<CardHeader>
				<CardTitle level={1}>Create your passkey</CardTitle>
				<CardDescription>
					Create a passkey on this device. You'll use it to sign in instead of a
					password.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Field>
					<Label for="passkey-name">Passkey name</Label>
					<Input
						id="passkey-name"
						maxlength={64}
						required
						aria-describedby="passkey-name-help"
						bind:value={name}
					/>
					<FieldDescription id="passkey-name-help">
						So you can tell your passkeys apart later
					</FieldDescription>
				</Field>
				<hr class="border-border" />
				<div class="flex items-center gap-3 text-as-muted">
					<div class="flex shrink-0 gap-1" aria-hidden="true">
						{#each [FingerprintIcon, ScanFaceIcon, UsbIcon] as Icon, index (index)}
							<span
								class="grid size-7 place-items-center rounded-md border border-border bg-neutral-muted"
							>
								<Icon class="size-3.5" />
							</span>
						{/each}
					</div>
					<p>
						Your browser will ask you to confirm with Touch ID, Face ID, your
						PIN or a security key
					</p>
				</div>
				{#if error}
					<Alert tint="danger" role="alert">
						<CircleAlertIcon />
						<AlertTitle>Couldn't create the passkey</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				{/if}
			</CardContent>
			<CardFooter>
				<Button variant="outline" disabled={busy} onclick={() => go(1)}>
					Back
				</Button>
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
					Create passkey
				</Button>
			</CardFooter>
		</form>
	{:else}
		<CardHeader align="center">
			<span
				class="mb-2.5 grid size-10 place-items-center rounded-[10px] border border-accent-muted-border bg-accent-muted text-as-accent"
			>
				<CheckIcon class="size-5" />
			</span>
			<CardTitle level={1}>You're all set</CardTitle>
			<CardDescription>
				Your server is ready. Enter this address in any app to start syncing.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<AddressField url={data.info.url} aria-label="Server address" />
		</CardContent>
		<CardFooter>
			<Button
				class="flex-1"
				href={resolve('/(dashboard)')}
				variant="primary"
				tint="accent"
				data-sveltekit-reload
			>
				Go to dashboard <ArrowRightIcon />
			</Button>
		</CardFooter>
	{/if}
</CardPage>
