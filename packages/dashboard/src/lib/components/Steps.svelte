<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';

	// Numbered circles with the label under each, joined by a line that's
	// tinted once the step before it is done.
	let { steps, current }: { steps: string[]; current: number } = $props();
</script>

<ol
	class="mb-6 grid w-full max-w-105 auto-cols-fr grid-flow-col"
	aria-label="Setup progress"
>
	{#each steps as step, index (step)}
		{@const done = index < current}
		<li
			class={[
				'relative flex flex-col items-center gap-2 text-[13px] leading-4 font-medium',
				index > 0 &&
					'before:absolute before:top-3 before:right-[calc(50%+22px)] before:left-[calc(-50%+22px)] before:h-px',
				index > 0 &&
					(index <= current ? 'before:bg-accent-border' : 'before:bg-border'),
				index === current
					? 'text-on-background'
					: done
						? 'text-as-muted'
						: 'text-as-faint',
			]}
			aria-current={index === current ? 'step' : undefined}
		>
			<span
				class={[
					'grid size-6 place-items-center rounded-full border text-xs font-semibold tabular-nums',
					done
						? 'border-accent-border bg-accent text-on-accent'
						: index === current
							? 'border-accent shadow-[0_0_0_3px_var(--color-accent-muted)]'
							: 'border-border',
				]}
			>
				{#if done}
					<CheckIcon class="size-3.5" strokeWidth={2.5} aria-hidden="true" />
					<span class="sr-only">Done:</span>
				{:else}
					{index + 1}
				{/if}
			</span>
			{step}
		</li>
	{/each}
</ol>
