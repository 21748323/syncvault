<script lang="ts">
	import type { SyncState } from '@syncvault/client';

	let {
		state,
		class: className = 'size-5',
	}: { state: SyncState; class?: string } = $props();
</script>

{#if state === 'connecting'}
	<span
		class={['loading loading-spinner', className]}
		aria-hidden="true"
	></span>
{:else}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if state === 'offline' || state === 'disconnected'}
			<!-- A crossed-out cloud. -->
			<path d="m2 2 20 20" />
			<path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
			<path
				d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"
			/>
		{:else}
			<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
			{#if state === 'online'}
				<path d="m9.5 14 2 2 3.5-3.5" />
			{:else if state === 'unauthorized'}
				<path d="M12 11v3M12 16.5h.01" />
			{/if}
		{/if}
	</svg>
{/if}
