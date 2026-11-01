<script lang="ts">
	import { createCopy } from '#lib/clipboard.svelte.ts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';

	// The server's address as a chip inside a sentence, copied on click. For a
	// field of its own, see AddressField.
	let { text }: { text: string } = $props();

	const clipboard = createCopy();
</script>

<button
	type="button"
	class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 py-px align-baseline font-mono text-[13px] whitespace-nowrap"
	title="Copy address"
	onclick={() => clipboard.copy(text)}
>
	<span class="truncate">{text}</span>
	<span class="grid place-items-center text-as-muted">
		{#if clipboard.copied}
			<CheckIcon class="size-3.5" />
			<span class="sr-only">Copied</span>
		{:else}
			<CopyIcon class="size-3.5" />
		{/if}
	</span>
</button>
