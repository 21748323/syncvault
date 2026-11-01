<script lang="ts">
	// The app's favicon (fetched by the server when it was approved) in a
	// rounded tile, or the first letter of its name.
	let {
		app,
		large = false,
	}: { app: { id: number; name: string; hasIcon: boolean }; large?: boolean } =
		$props();

	let failed = $state(false);
</script>

<span
	class={[
		'grid shrink-0 place-items-center border border-border bg-neutral-muted font-display font-bold',
		large ? 'size-13 rounded-[13px] p-3 text-xl' : 'size-9 rounded-[9px] p-2',
	]}
	aria-hidden="true"
>
	{#if app.hasIcon && !failed}
		<img
			class="size-full object-contain"
			src="/api/admin/apps/{app.id}/icon"
			alt=""
			onerror={() => (failed = true)}
		/>
	{:else}
		{app.name.trim()[0]?.toUpperCase() ?? '?'}
	{/if}
</span>
