<script lang="ts">
	import AppHeader from '#lib/components/AppHeader.svelte';
	import FilterTabs, {
		FILTERS,
		type Filter,
	} from '#lib/components/FilterTabs.svelte';
	import NewTodoForm from '#lib/components/NewTodoForm.svelte';
	import TodoRow from '#lib/components/TodoRow.svelte';
	import { flyTransition } from '#lib/transitions/fly-transition.ts';
	import { groupByDate } from '#lib/utils/group-by-date.ts';
	import { rowSlide, withoutRowSlide } from '#lib/transitions/row-slide.ts';
	import { clearDone, todos } from '#lib/data/todos.ts';
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';

	const selectors = {
		all: {},
		active: { done: false },
		done: { done: true },
	} as const;

	let filter = $state<Filter>('all');

	// If the browser won't open its storage (e.g. blocked site data), the
	// collection never becomes ready, so show that instead of loading forever.
	let loadFailed = $state(false);
	todos.ready().catch(() => {
		loadFailed = true;
	});

	const visible = $derived(
		todos.find(selectors[filter], { sort: { createdAt: -1 } }).fetch()
	);
	const groups = $derived(groupByDate(visible, (todo) => todo.createdAt));
	const total = $derived(todos.find().count());
	const remaining = $derived(todos.find({ done: false }).count());
	const counts = $derived({
		all: total,
		active: remaining,
		done: total - remaining,
	});
	const showClear = $derived(filter === 'done' && counts.done > 0);

	let listEl = $state<HTMLElement>();

	function selectFilter(next: Filter) {
		if (next === filter || !listEl) return;
		const direction = FILTERS.indexOf(next) > FILTERS.indexOf(filter) ? 1 : -1;
		// The fly animates the whole list, so rows shouldn't also slide.
		flyTransition(listEl, direction, () =>
			withoutRowSlide(async () => {
				filter = next;
				await tick();
			})
		);
	}
</script>

<main class="flex min-h-dvh flex-col overflow-x-clip">
	<AppHeader />
	<section
		class={[
			'mx-auto flex w-full max-w-2xl flex-1 flex-col px-4',
			showClear ? 'pb-20' : 'pb-4',
		]}
	>
		{#if loadFailed}
			<div
				role="alert"
				class="flex flex-1 flex-col items-center justify-center gap-3 text-center"
			>
				<p class="text-lg font-medium">Couldn't open your todos</p>
				<p class="max-w-sm text-sm opacity-60">
					This browser wouldn't let the app use its storage. Private browsing or
					blocked site data can cause this.
				</p>
				<button class="btn btn-sm" onclick={() => location.reload()}>
					Try again
				</button>
			</div>
		{:else if !todos.isReady()}
			<div class="flex flex-1 items-center justify-center">
				<span class="loading loading-lg loading-spinner"></span>
			</div>
		{:else if total === 0}
			<div
				class="flex flex-1 flex-col items-center justify-center gap-1 text-center opacity-60"
			>
				<p class="text-lg font-medium">Nothing to do yet</p>
				<p class="text-sm">Add a task below to get started.</p>
			</div>
		{:else}
			<div
				class="sticky top-0 z-10 -mx-4 bg-linear-to-b from-base-100 from-50% to-transparent px-4 pt-3 pb-4"
			>
				<FilterTabs {filter} {counts} onselect={selectFilter} />
			</div>

			<div bind:this={listEl}>
				{#each groups as group, i (group.label)}
					<section class="pb-2" aria-labelledby="group-{i}" transition:rowSlide>
						<h2
							id="group-{i}"
							class="px-2 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase opacity-60"
						>
							{group.label}
						</h2>
						<ul class="list">
							{#each group.items as todo (todo.id)}
								<TodoRow {todo} />
							{/each}
						</ul>
					</section>
				{:else}
					<p class="py-8 text-center opacity-60">No {filter} todos.</p>
				{/each}
			</div>
		{/if}
	</section>

	<footer
		class="sticky bottom-0 z-10 border-t border-base-300 bg-base-100/90 backdrop-blur"
	>
		{#if showClear}
			<button
				class="btn absolute bottom-full left-1/2 mb-4 -translate-x-1/2 rounded-full shadow-lg"
				aria-label="Clear done todos"
				onclick={clearDone}
				transition:fly={{ y: 16, duration: 150 }}
			>
				Clear
			</button>
		{/if}
		<NewTodoForm />
	</footer>
</main>
