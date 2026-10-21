<script lang="ts">
	/**
	 * Local achievements across worlds (plan 102, ADR 0147 points 6 and 7; the v3 tab since plan 317,
	 * V3_CHANGES §3.3): the count over the profile, a filter, medal cards (unlocked, locked, hidden),
	 * and the profile's export and import.
	 */
	import type { AchievementDefinition } from '@orbital/core';
	import { downloadText } from '../download';
	import { HIDDEN_ICON, milestoneIcon } from '../worlds/milestone-icons';
	import { mergeProfiles, parseProfile, serializeProfile, type Profile } from './profile';
	import type { ProfileStore } from './store';

	let {
		achievements,
		store,
		usedCheats = null,
		onprofile = () => {}
	}: {
		achievements: readonly AchievementDefinition[];
		store: ProfileStore;
		/** The chosen world's name when it used cheats (plan 203): nothing unlocks there. */
		usedCheats?: string | null;
		/** The profile once read or imported (the Worlds tab shows the count). */
		onprofile?: (profile: Profile) => void;
	} = $props();

	let profile = $state.raw<Profile | null>(null);
	let note = $state<string | null>(null);
	let filter = $state<'all' | 'unlocked' | 'locked'>('all');
	let file: HTMLInputElement;
	const FILTERS = [
		['all', 'All'],
		['unlocked', 'Unlocked'],
		['locked', 'Locked']
	] as const;

	$effect(() => {
		void store.get().then((p) => {
			profile = p;
			onprofile(p);
		});
	});

	const count = $derived(achievements.filter((a) => profile?.unlocked[a.id] !== undefined).length);
	const shown = $derived(
		achievements.filter((a) => {
			const done = profile?.unlocked[a.id] !== undefined;
			return filter === 'all' || (filter === 'unlocked') === done;
		})
	);
	const date = (iso: string): string =>
		new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

	async function importFile(f: File): Promise<void> {
		try {
			const merged = mergeProfiles(await store.get(), parseProfile(await f.text()));
			await store.put(merged);
			profile = merged;
			onprofile(merged);
			note = 'Profile imported.';
		} catch (e) {
			note = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<section class="achievements" aria-label="Achievements" data-testid="achievements">
	<header>
		<div class="total">
			<span class="cap">Profile · all worlds</span>
			<span class="big"
				><span class="num">{count}</span>
				<span class="of">of {achievements.length} unlocked</span></span
			>
			<span class="bar"
				><span style:width="{achievements.length ? (count / achievements.length) * 100 : 0}%"
				></span></span
			>
		</div>
		<div class="filter" role="radiogroup" aria-label="Filter">
			{#each FILTERS as [k, label] (k)}
				<button
					type="button"
					role="radio"
					aria-checked={filter === k}
					class:on={filter === k}
					onclick={() => (filter = k)}>{label}</button
				>
			{/each}
		</div>
		<div class="actions">
			<button
				type="button"
				class="pill"
				disabled={!profile}
				onclick={() =>
					profile && downloadText(serializeProfile(profile), 'achievements-profile.json')}
				>Export profile</button
			>
			<button type="button" class="pill" onclick={() => file.click()}>Import profile</button>
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
	</header>
	{#if usedCheats}
		<p class="cheats" data-testid="achievements-cheats">
			<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"
				><path d="M12 4 L21 20 H3 Z M12 10 V14 M12 17 H12.01" /></svg
			>
			{usedCheats} used cheats: no achievement unlocks in it. Achievements count from every other world.
		</p>
	{/if}
	{#if note}<p class="note" role="status">{note}</p>{/if}
	<ul>
		{#each shown as a (a.id)}
			{@const u = profile?.unlocked[a.id]}
			{@const secret = a.hidden && !u}
			<li class:on={u !== undefined} class:secret>
				<div class="top">
					<span class="medal" aria-hidden="true"
						><svg viewBox="0 0 24 24" width="30" height="30"
							><path
								d={secret
									? HIDDEN_ICON
									: milestoneIcon(a.criteria.milestone, a.criteria.crewed === true)}
							/></svg
						></span
					>
					<span class="state">{u ? 'Unlocked' : secret ? 'Hidden' : 'Locked'}</span>
				</div>
				<div class="what">
					<strong>{secret ? 'Hidden achievement' : a.label}</strong>
					<span>{secret ? 'Keep flying to reveal it.' : a.description}</span>
				</div>
				<span class="foot"
					>{u ? `Unlocked · ${date(u.at)}` : secret ? 'Revealed when unlocked' : 'Not yet'}</span
				>
			</li>
		{/each}
	</ul>
</section>

<style>
	.achievements {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1.5rem 2.5rem;
	}
	.total {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.cap {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.big {
		font-size: 3.5rem;
		line-height: 1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.of {
		font-size: 1.5rem;
		color: var(--text-muted);
	}
	.bar {
		display: block;
		width: min(26.25rem, 80vw);
		height: 4px;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.12);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--selected-bg);
	}
	.filter {
		display: flex;
		gap: 2px;
		height: 2.5rem;
		box-sizing: border-box;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	.filter button {
		height: 2rem;
		padding: 0 0.875rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.filter button.on {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 0.5rem;
	}
	.pill {
		height: 2.5rem;
		padding: 0 1rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.pill:disabled {
		opacity: 0.5;
	}
	.filter button:focus-visible,
	.pill:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	.cheats {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.75rem;
		color: var(--warn);
	}
	.cheats svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.note {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		min-height: 14.75rem;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1.375rem;
		border-radius: 20px;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid rgb(255 255 255 / 0.07);
	}
	li.on {
		background: linear-gradient(160deg, rgb(255 255 255 / 0.1), rgb(22 23 26 / 0.6) 60%);
		border-color: rgb(255 255 255 / 0.22);
	}
	.top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}
	.medal {
		width: 4.5rem;
		height: 4.5rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.05);
		color: var(--text-disabled);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
	}
	li.secret .medal {
		color: #4a4b50;
	}
	li.on .medal {
		background: radial-gradient(circle at 35% 30%, #fff, #c9cdd3 70%);
		color: #0b0b0c;
		box-shadow:
			0 0 0 4px rgb(255 255 255 / 0.08),
			0 0 0 5px var(--accent),
			0 10px 30px rgb(0 0 0 / 0.5);
	}
	.medal svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.state {
		height: 1.25rem;
		padding: 0 0.5rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.06);
		color: var(--text-subtle);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	li.on .state {
		background: var(--accent);
		color: #fff;
	}
	.what {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	strong {
		font-size: 1.125rem;
		line-height: 1.1;
		font-weight: 600;
		color: #c4c4cc;
	}
	li.on strong {
		color: var(--text-primary);
	}
	.what span {
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.foot {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--text-disabled);
	}
	li.on .foot {
		color: var(--text-primary);
	}
</style>
