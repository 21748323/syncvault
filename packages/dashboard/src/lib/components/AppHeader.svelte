<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from './Logo.svelte';
	import { goto } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import UserIcon from '@lucide/svelte/icons/user';

	// Apps is home (the logo); passkeys and signing out are account things, so
	// they're in the menu rather than beside it.
	let { passkeys }: { passkeys: number } = $props();

	let open = $state(false);
	let menu: HTMLElement;

	async function signOut() {
		await api.admin.logout.post({});
		await goto(resolve('/login'));
	}

	// Closed by a click elsewhere, Escape, or choosing an item.
	function dismiss(event: Event) {
		if (!open) return;
		if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
		if (event instanceof PointerEvent && menu.contains(event.target as Node)) {
			return;
		}
		open = false;
	}
</script>

<svelte:window onpointerdown={dismiss} onkeydown={dismiss} />

<header
	class="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6"
>
	<a
		class="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
		href={resolve('/(dashboard)')}
		aria-label="Apps"
	>
		<Logo />
	</a>
	<div class="relative" bind:this={menu}>
		<button
			class="flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface pr-2.5 pl-1 outline-2 outline-offset-2 outline-transparent hover:bg-neutral-muted focus-visible:outline-ring"
			aria-label="Account"
			aria-expanded={open}
			aria-haspopup="menu"
			onclick={() => (open = !open)}
		>
			<span
				class="grid size-8 place-items-center rounded-full bg-neutral-muted"
			>
				<UserIcon class="size-4" />
			</span>
			<ChevronDownIcon class="size-4 text-as-muted" />
		</button>
		{#if open}
			<ul
				class="absolute top-full right-0 z-10 mt-2 w-60 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
				role="menu"
			>
				<li role="none">
					<a
						class="flex h-10 items-center gap-2.5 rounded-lg px-3 font-medium hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
						href={resolve('/(dashboard)/passkeys')}
						role="menuitem"
						onclick={() => (open = false)}
					>
						<KeyRoundIcon class="size-4 text-as-muted" />
						Passkeys
						<span class="ml-auto text-xs text-as-faint">{passkeys}</span>
					</a>
				</li>
				<li class="mt-1.5 border-t border-border pt-1.5" role="none">
					<button
						class="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 font-medium hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
						role="menuitem"
						onclick={signOut}
					>
						<LogOutIcon class="size-4 text-as-muted" />
						Sign out
					</button>
				</li>
			</ul>
		{/if}
	</div>
</header>
