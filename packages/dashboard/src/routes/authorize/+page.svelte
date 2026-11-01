<script lang="ts">
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
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import ServerIcon from '@lucide/svelte/icons/server';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let busy = $state(false);
	let error = $state('');

	const app = $derived(data.request?.app);
	// A registered app's stored name; otherwise the app's own claim. The
	// origin, shown above it, is what to trust.
	const appName = $derived(
		app ? (app.registeredName ?? app.name ?? new URL(app.clientId).host) : ''
	);
	const others = $derived(
		app && app.devices === 1
			? '1 other device'
			: `${app?.devices} other devices`
	);

	async function decide(approve: boolean) {
		busy = true;
		error = '';
		try {
			const { redirectTo } = await call(
				api.oauth.authorize.post({ ...data.params, approve })
			);
			location.href = redirectTo;
		} catch (cause) {
			error = describe(cause);
			busy = false;
		}
	}
</script>

{#if data.problem || !data.request}
	<CardPage title="Can't connect" backdrop>
		<CardHeader align="center">
			<span
				class="mb-2.5 grid size-10 place-items-center rounded-[10px] border border-danger-muted-border bg-danger-muted text-as-danger"
			>
				<CircleAlertIcon class="size-5" />
			</span>
			<CardTitle level={1}>This app can't connect</CardTitle>
			<CardDescription>{data.problem}</CardDescription>
		</CardHeader>
	</CardPage>
{:else if app}
	<CardPage title="Connect an app" backdrop>
		{#snippet footer()}
			You can disconnect this device any time from the dashboard
		{/snippet}
		<CardHeader>
			<CardTitle level={1}>
				{app.registeredName
					? 'Register new device'
					: 'Register new application'}
			</CardTitle>
		</CardHeader>
		<CardContent>
			<p
				class="rounded-[10px] border border-border bg-background px-4 py-2.5 font-mono font-medium break-all"
			>
				{app.clientId}
			</p>
			<!-- Svelte trims whitespace at the edges of blocks and elements, and
			     Prettier moves it, so optional clauses get their spaces from
			     expressions. -->
			<!-- prettier-ignore -->
			<p class="text-as-muted [&_b]:font-medium [&_b]:text-on-background">
				{#if !app.registeredName}
					<b>{appName}</b> wants to sync its data with this server{data.request.deviceName ? ' from ' : ''}{#if data.request.deviceName}<b>{data.request.deviceName}</b>{/if}. It can only see and change its own data.
				{:else}
					<b>{data.request.deviceName ?? 'A new device'}</b> wants to sync <b>{appName}</b>{app.devices > 0 ? ' with your ' : ''}{#if app.devices > 0}<span class="whitespace-nowrap">{others}</span>{/if}.
				{/if}
			</p>
			<ul class="flex flex-col gap-2 text-[13px] text-as-muted">
				{#if app.registeredName}
					<li class="flex gap-2.5">
						<ServerIcon class="mt-0.5 size-4 shrink-0" />
						Data on the server will be synced with the app
					</li>
				{/if}
				<li class="flex gap-2.5">
					<ShieldCheckIcon class="mt-0.5 size-4 shrink-0" />
					Only allow this if you opened the app yourself
				</li>
			</ul>
			{#if error}
				<Alert tint="danger" role="alert">
					<CircleAlertIcon />
					<AlertTitle>Couldn't finish connecting</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}
		</CardContent>
		<CardFooter>
			<Button
				class="flex-1"
				variant="outline"
				disabled={busy}
				onclick={() => decide(false)}
			>
				Deny
			</Button>
			<Button
				class="flex-1"
				variant="primary"
				tint="accent"
				disabled={busy}
				onclick={() => decide(true)}
			>
				{#if busy}<LoaderCircleIcon class="animate-spin" />{/if}
				Allow
			</Button>
		</CardFooter>
	</CardPage>
{/if}
