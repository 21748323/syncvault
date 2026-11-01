<script lang="ts">
	import AppHeader from '#lib/components/AppHeader.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<AppHeader passkeys={data.passkeys.length} />
<main class="mx-auto w-full max-w-240 px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
	{@render children()}
</main>
