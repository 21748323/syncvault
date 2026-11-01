<script lang="ts">
	import { createCopy } from '#lib/clipboard.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import type { HTMLInputAttributes } from 'svelte/elements';

	// The server's address as a read-only field, with a button to copy it.
	let {
		url,
		...props
	}: { url: string } & Pick<
		HTMLInputAttributes,
		'id' | 'aria-label' | 'aria-invalid' | 'aria-describedby'
	> = $props();

	const clipboard = createCopy();
</script>

<div class="flex gap-2">
	<Input {...props} class="font-mono" readonly value={url} />
	<Button
		variant="outline"
		shape="square"
		aria-label={clipboard.copied ? 'Copied' : 'Copy address'}
		onclick={() => clipboard.copy(url)}
	>
		{#if clipboard.copied}<CheckIcon />{:else}<CopyIcon />{/if}
	</Button>
</div>
