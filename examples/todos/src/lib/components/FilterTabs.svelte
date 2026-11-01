<script lang="ts" module>
	export const FILTERS = ['all', 'active', 'done'] as const;
	export type Filter = (typeof FILTERS)[number];
</script>

<script lang="ts">
	let {
		filter,
		counts,
		onselect,
	}: {
		filter: Filter;
		counts: Record<Filter, number>;
		onselect: (filter: Filter) => void;
	} = $props();
</script>

<div role="tablist" class="tabs relative tabs-box w-full tabs-sm">
	<!-- A single active-tab background that slides between the equal-width
	     tabs. It uses daisyUI's own active tab styles, so the tabs themselves
	     have their background turned off. -->
	<span
		aria-hidden="true"
		class="tab pointer-events-none absolute inset-y-1 left-1 tab-active transition-[translate] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
		style:width="calc((100% - 0.5rem) / {FILTERS.length})"
		style:translate="{FILTERS.indexOf(filter) * 100}% 0"
	></span>
	{#each FILTERS as f (f)}
		<button
			role="tab"
			aria-selected={filter === f}
			class={[
				'tab relative flex-1 flex-nowrap justify-center gap-1 bg-transparent px-1 capitalize shadow-none sm:gap-1.5 sm:px-2',
				filter === f && 'tab-active',
			]}
			onclick={() => onselect(f)}
		>
			{f}
			<span class="badge badge-soft badge-xs tabular-nums sm:badge-sm">
				{counts[f]}
			</span>
		</button>
	{/each}
</div>
