<script lang="ts">
	import { randomTodoTitle } from '#lib/data/sample-todos.ts';
	import { addTodo, todos } from '#lib/data/todos.ts';

	let title = $state('');

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = title.trim();
		if (!trimmed) return;
		addTodo(trimmed);
		title = '';
	}

	async function addRandomTodo() {
		let existing: { title: string }[] = [];
		try {
			existing = await todos.find({}, { async: true }).fetch();
		} catch {
			// Only used to avoid repeats; any title will do.
		}
		addTodo(randomTodoTitle(existing.map((todo) => todo.title)));
	}
</script>

<form
	class="mx-auto flex w-full max-w-2xl gap-2 px-4 py-4 sm:py-8"
	onsubmit={submit}
>
	<label class="input w-full rounded-box input-lg sm:input-xl">
		<input
			class="grow"
			placeholder="What needs doing?"
			aria-label="New task"
			bind:value={title}
		/>
		<button
			type="button"
			class="btn -mr-1.25 btn-square btn-ghost btn-sm sm:btn-md"
			aria-label="Add a random task"
			title="Add a random task"
			onclick={addRandomTodo}
		>
			<svg
				class="size-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect width="18" height="18" x="3" y="3" rx="2" />
				<path d="M16 8h.01M8 8h.01M8 16h.01M16 16h.01M12 12h.01" />
			</svg>
		</button>
	</label>
	<button
		class="btn rounded-box btn-lg btn-primary max-sm:btn-square sm:btn-xl"
		type="submit"
		aria-label="Add task"
	>
		<svg
			class="size-6"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
		>
			<path d="M5 12h14M12 5v14" />
		</svg>
		<span class="max-sm:hidden">Add</span>
	</button>
</form>
