<script lang="ts">
	import { rowSlide } from '#lib/transitions/row-slide.ts';
	import { removeTodo, type Todo, updateTodo } from '#lib/data/todos.ts';

	let { todo }: { todo: Todo } = $props();

	let editing = $state(false);
	let draft = $state('');

	function startEdit() {
		draft = todo.title;
		editing = true;
	}

	function saveEdit() {
		// Also runs on the blur that follows Enter or Escape.
		if (!editing) return;
		const title = draft.trim();
		if (title) updateTodo(todo.id, { title });
		else removeTodo(todo.id);
		editing = false;
	}

	// Focus with the caret at the end, like editing text in place.
	function focus(node: HTMLInputElement) {
		node.focus();
		node.setSelectionRange(node.value.length, node.value.length);
	}
</script>

<li class="group list-row items-center px-2 py-3" transition:rowSlide>
	<!-- Padding with matching negative margin enlarges the tap target to the
	     full row height without changing the layout. -->
	<label
		class="-mx-2 -my-3 flex cursor-pointer touch-manipulation items-center self-stretch px-2 py-3"
	>
		<input
			type="checkbox"
			class="checkbox"
			checked={todo.done}
			aria-label="Mark {todo.title} as done"
			onchange={(e) => updateTodo(todo.id, { done: e.currentTarget.checked })}
		/>
	</label>
	{#if editing}
		<input
			class="-my-3 w-full self-stretch bg-transparent py-3 text-base outline-none"
			aria-label="Rename {todo.title}"
			bind:value={draft}
			{@attach focus}
			onblur={saveEdit}
			onkeydown={(e) => {
				if (e.key === 'Enter') saveEdit();
				if (e.key === 'Escape') editing = false;
			}}
		/>
	{:else}
		<button
			class={[
				'-my-3 flex cursor-text items-center self-stretch py-3 text-left text-base wrap-break-word',
				todo.done && 'line-through opacity-50',
			]}
			onclick={startEdit}
			title="Click to rename"
		>
			{todo.title}
		</button>
	{/if}
	<button
		class="btn -mr-1 btn-square btn-ghost btn-sm group-hover:opacity-100 focus-visible:opacity-100 max-sm:text-base-content/40 max-sm:active:text-base-content sm:opacity-0"
		aria-label="Delete {todo.title}"
		onclick={() => removeTodo(todo.id)}
	>
		<svg
			class="size-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<path d="M18 6 6 18M6 6l12 12" />
		</svg>
	</button>
</li>
