<script lang="ts" module>
	export interface Action {
		title: string;
		message?: string;
		/** The button that runs it, e.g. "Delete app". */
		confirm: string;
		danger?: boolean;
		/** Asks for one value first, like a passkey's name. */
		field?: { label: string; value: string; maxlength?: number };
		run: (value: string) => Promise<unknown>;
	}
</script>

<script lang="ts">
	import { describe } from '#lib/api.ts';
	import {
		Alert,
		AlertDescription,
		AlertTitle,
	} from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from '#lib/components/ui/card/index.ts';
	import { Field, Label } from '#lib/components/ui/field/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

	// One dialog per page for confirmations and small forms: `open()` it with
	// what to ask and what to run. It stays open, showing why, if that fails.
	let dialog: HTMLDialogElement;
	let action = $state<Action>();
	let value = $state('');
	let busy = $state(false);
	let error = $state('');

	export function open(next: Action) {
		action = next;
		value = next.field?.value ?? '';
		error = '';
		dialog.showModal();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!action || busy) return;
		busy = true;
		error = '';
		try {
			await action.run(value.trim());
			dialog.close();
		} catch (cause) {
			error = describe(cause);
		} finally {
			busy = false;
		}
	}
</script>

<!-- The card fills the dialog, so a click on the dialog itself is on the
     backdrop around it. -->
<dialog
	bind:this={dialog}
	class="m-auto w-[calc(100%-2rem)] max-w-105 bg-transparent text-on-background backdrop:bg-black/60"
	onclick={(event) => event.target === dialog && !busy && dialog.close()}
>
	<form onsubmit={submit}>
		{#if action}
			<Card class="shadow-xl">
				<CardHeader>
					<CardTitle>{action.title}</CardTitle>
					{#if action.message}
						<CardDescription>{action.message}</CardDescription>
					{/if}
				</CardHeader>
				{#if action.field || error}
					<CardContent>
						{#if action.field}
							<Field>
								<Label for="action-field">{action.field.label}</Label>
								<Input
									id="action-field"
									required
									maxlength={action.field.maxlength}
									bind:value
								/>
							</Field>
						{/if}
						{#if error}
							<Alert tint="danger" role="alert">
								<CircleAlertIcon />
								<AlertTitle>Couldn't {action.confirm.toLowerCase()}</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						{/if}
					</CardContent>
				{/if}
				<CardFooter class="justify-end">
					<Button
						variant="outline"
						disabled={busy}
						onclick={() => dialog.close()}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						tint={action.danger ? 'danger' : 'accent'}
						disabled={busy}
					>
						{#if busy}<LoaderCircleIcon class="animate-spin" />{/if}
						{action.confirm}
					</Button>
				</CardFooter>
			</Card>
		{/if}
	</form>
</dialog>
