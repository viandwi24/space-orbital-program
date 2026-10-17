<script lang="ts">
	/**
	 * Local achievements across worlds (plan 102, ADR 0147 points 6 and 7): what is unlocked, hidden
	 * ones once found, and the profile's export and import.
	 */
	import type { AchievementDefinition } from '@orbital/core';
	import { downloadText } from '../download';
	import Button from '../ui/Button.svelte';
	import { mergeProfiles, parseProfile, serializeProfile, type Profile } from './profile';
	import type { ProfileStore } from './store';

	let {
		achievements,
		store
	}: { achievements: readonly AchievementDefinition[]; store: ProfileStore } = $props();

	let profile = $state.raw<Profile | null>(null);
	let note = $state<string | null>(null);
	let file: HTMLInputElement;

	$effect(() => {
		void store.get().then((p) => (profile = p));
	});

	const shown = $derived(
		achievements.filter((a) => !a.hidden || profile?.unlocked[a.id] !== undefined)
	);
	const count = $derived(achievements.filter((a) => profile?.unlocked[a.id] !== undefined).length);

	async function importFile(f: File): Promise<void> {
		try {
			const merged = mergeProfiles(await store.get(), parseProfile(await f.text()));
			await store.put(merged);
			profile = merged;
			note = 'Profile imported.';
		} catch (e) {
			note = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<section class="achievements" aria-label="Achievements" data-testid="achievements">
	<header>
		<h2>Achievements</h2>
		<span class="count num">{count} / {achievements.length}</span>
	</header>
	<ul>
		{#each shown as a (a.id)}
			{@const u = profile?.unlocked[a.id]}
			<li class:on={u !== undefined}>
				<strong>{a.label}</strong>
				<span>{a.description}</span>
				{#if u}<span class="when">{u.at.slice(0, 10)}</span>{/if}
			</li>
		{/each}
	</ul>
	{#if note}<p class="note" role="status">{note}</p>{/if}
	<div class="actions">
		<Button
			disabled={!profile}
			onclick={() =>
				profile && downloadText(serializeProfile(profile), 'achievements-profile.json')}
			>Export profile</Button
		>
		<Button onclick={() => file.click()}>Import profile</Button>
		<input
			bind:this={file}
			type="file"
			accept="application/json,.json"
			hidden
			aria-label="Profile file"
			onchange={(e) => {
				const f = e.currentTarget.files?.[0];
				if (f) void importFile(f);
				e.currentTarget.value = '';
			}}
		/>
	</div>
</section>

<style>
	.achievements {
		display: grid;
		gap: var(--s-3);
		margin-top: var(--s-6);
		padding-top: var(--s-4);
		border-top: 1px solid var(--line);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
	}
	h2 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
	}
	.count {
		color: var(--text-dim);
	}
	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--s-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		gap: var(--s-1);
		padding: var(--s-2) var(--s-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-tile);
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
	li.on {
		color: var(--text);
		border-color: var(--c-accent-dim);
	}
	strong {
		font-weight: 600;
	}
	.when {
		font-size: var(--t-label);
	}
	.note {
		margin: 0;
		font-size: var(--t-sm);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
</style>
