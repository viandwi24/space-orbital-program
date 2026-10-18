<script lang="ts">
	import Button from './Button.svelte';
	import Kbd from './Kbd.svelte';
	import Segmented from './Segmented.svelte';
	import {
		ACTIONS,
		BINDING_MODE_LABEL,
		FIXED_KEYS,
		KEY_PROFILES,
		KEY_PROFILE_LABEL,
		actionSpec,
		chordIdOf,
		keyLabel,
		scopeOf,
		type ActionId,
		type BindingMode,
		type KeyProfile
	} from '../keybindings';
	import { settings } from '../settings/settings.svelte';

	/** The Controls tab of the settings (plan 053, ADR 0061): every action with its keys, click to rebind. */
	let mode = $state<BindingMode>('flight');
	/** The action waiting for a key press, if any. */
	let capturing = $state<ActionId | null>(null);
	/** A key another action of the same scope uses: the player chooses swap or cancel. */
	let clash = $state<{ id: ActionId; key: string; other: ActionId } | null>(null);
	let refused = $state<string | null>(null);

	const modeOptions = (Object.keys(BINDING_MODE_LABEL) as BindingMode[]).map((m) => ({
		value: m,
		label: BINDING_MODE_LABEL[m]
	}));
	const groups = $derived.by(() => {
		const out = new Map<string, (typeof ACTIONS)[number][]>();
		// an action a later plan wires is not listed until then (plan 216)
		for (const a of ACTIONS.filter((x) => x.mode === mode && !('pending' in x))) {
			out.set(a.group, [...(out.get(a.group) ?? []), a]);
		}
		return [...out];
	});
	const fixed = $derived(
		FIXED_KEYS.filter((f) => f.scope === scopeOf(mode) || (mode === 'map' && f.scope === 'flight'))
	);

	const profileOptions = KEY_PROFILES.map((p) => ({ value: p, label: KEY_PROFILE_LABEL[p] }));
	/** A profile switch waiting for the player's answer on the overrides that clash in it. */
	let pendingProfile = $state<{ to: KeyProfile; clashes: ActionId[]; keep: ActionId[] } | null>(
		null
	);
	function chooseProfile(to: KeyProfile): void {
		if (to === settings.keyProfile) return;
		const clashes = settings.profileClashes(to);
		if (clashes.length === 0) settings.setKeyProfile(to);
		else pendingProfile = { to, clashes, keep: [] };
	}
	function toggleKeep(id: ActionId): void {
		if (!pendingProfile) return;
		const keep = pendingProfile.keep.includes(id)
			? pendingProfile.keep.filter((k) => k !== id)
			: [...pendingProfile.keep, id];
		pendingProfile = { ...pendingProfile, keep };
	}

	function stop(): void {
		capturing = null;
	}
	function begin(id: ActionId): void {
		clash = null;
		refused = null;
		capturing = id;
	}

	// While waiting for a key every key is the answer: Escape cancels, nothing else reaches the page.
	function onKey(e: KeyboardEvent): void {
		if (capturing === null) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.repeat) return;
		if (e.key === 'Escape') return stop();
		const key = chordIdOf(e);
		const id = capturing;
		stop();
		const result = settings.rebind(id, key);
		if (result.ok) return;
		if (result.reason === 'reserved') {
			refused = `${keyLabel(key) || 'That key'} is reserved and cannot be used.`;
		} else {
			clash = { id, key, other: result.with };
		}
	}
	$effect(() => {
		if (capturing === null) return;
		window.addEventListener('keydown', onKey, { capture: true });
		return () => window.removeEventListener('keydown', onKey, { capture: true });
	});
	// Leaving the tab or the mode drops a half-finished change.
	$effect(() => {
		void mode;
		capturing = null;
		clash = null;
		refused = null;
	});

	const changed = (id: ActionId): boolean => settings.bindings[id] !== undefined;
	const anyChanged = $derived(Object.keys(settings.bindings).length > 0);
</script>

{#if settings.keyNotice}
	<div class="notice" role="status" data-testid="key-notice">
		<span
			>Orbital now uses KSP's keys by default. Your changed keys are kept on Orbital classic.</span
		>
		<Button onclick={() => chooseProfile('ksp')} data-testid="key-notice-switch"
			>Switch to KSP</Button
		>
		<Button variant="ghost" onclick={() => settings.dismissKeyNotice()}>Keep Orbital classic</Button
		>
	</div>
{/if}

<div class="head">
	<Segmented
		label="Key profile"
		value={settings.keyProfile}
		options={profileOptions}
		onchange={(p: KeyProfile) => chooseProfile(p)}
	/>
</div>

{#if pendingProfile}
	<div
		class="clashes"
		role="group"
		aria-label="Keys that clash in the new profile"
		data-testid="profile-clashes"
	>
		<p>
			These keys you changed clash with {KEY_PROFILE_LABEL[pendingProfile.to]}. Keep yours, or use
			the profile's.
		</p>
		<ul>
			{#each pendingProfile.clashes as id (id)}
				<li>
					<span class="what">{actionSpec(id).label}</span>
					<span class="fixedkeys"
						>{#each settings.bindings[id] ?? [] as k (k)}<Kbd>{keyLabel(k)}</Kbd>{/each}</span
					>
					<Button
						variant={pendingProfile.keep.includes(id) ? 'primary' : 'ghost'}
						onclick={() => toggleKeep(id)}
						data-testid="profile-keep-{id}"
						>{pendingProfile.keep.includes(id) ? 'Keep mine' : 'Use profile'}</Button
					>
				</li>
			{/each}
		</ul>
		<Button
			onclick={() => {
				if (pendingProfile) settings.setKeyProfile(pendingProfile.to, pendingProfile.keep);
				pendingProfile = null;
			}}
			data-testid="profile-apply">Switch to {KEY_PROFILE_LABEL[pendingProfile.to]}</Button
		>
		<Button variant="ghost" onclick={() => (pendingProfile = null)}>Cancel</Button>
	</div>
{/if}

<div class="head">
	<p class="note">
		Click a key to change it, then press the new one (Ctrl and Alt make a chord). Esc cancels.
	</p>
	<Segmented
		label="Which controls"
		value={mode}
		options={modeOptions}
		onchange={(m: BindingMode) => (mode = m)}
	/>
</div>

<div class="status" role="status" aria-live="polite">
	{#if capturing}
		<span>Press a key for <strong>{actionSpec(capturing).label}</strong>… (Esc to cancel)</span>
	{:else if clash}
		<span>
			<Kbd>{keyLabel(clash.key)}</Kbd> is already used by
			<strong>{actionSpec(clash.other).label}</strong>.
		</span>
		<Button
			onclick={() => {
				if (clash) settings.swap(clash.id, clash.key);
				clash = null;
			}}
			data-testid="bind-swap">Swap the two</Button
		>
		<Button variant="ghost" onclick={() => (clash = null)}>Cancel</Button>
	{:else if refused}
		<span>{refused}</span>
	{/if}
</div>

<div class="keys">
	{#each groups as [title, actions] (title)}
		<section>
			<h3>{title}</h3>
			<ul>
				{#each actions as a (a.id)}
					<li>
						<span class="what">{a.label}</span>
						<button
							type="button"
							class="cap"
							class:waiting={capturing === a.id}
							class:changed={changed(a.id)}
							aria-label="{a.label}: {settings.keymap.labels(a.id).join(' or ')}. Change key"
							data-testid="bind-{a.id}"
							onclick={() => begin(a.id)}
						>
							{#if capturing === a.id}…{:else}{settings.keymap.labels(a.id).join(' / ')}{/if}
						</button>
						<button
							type="button"
							class="reset"
							disabled={!changed(a.id)}
							aria-label="Reset {a.label} to its default"
							title="Reset to the default"
							onclick={() => settings.resetBinding(a.id)}>↺</button
						>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
	<section>
		<h3>Fixed</h3>
		<ul>
			{#each fixed as f (f.label)}
				<li>
					<span class="what">{f.label}</span>
					<span class="fixedkeys"
						>{#each f.keys as k (k)}<Kbd>{k}</Kbd>{/each}</span
					>
				</li>
			{/each}
		</ul>
	</section>
</div>
<div class="foot">
	<Button
		disabled={!anyChanged}
		onclick={() => settings.resetAllBindings()}
		data-testid="bind-reset-all">Reset all to the profile's keys</Button
	>
</div>

<style>
	.notice,
	.clashes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
		padding: var(--s-2) var(--s-3);
		font-size: var(--t-sm);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.clashes ul,
	.clashes p {
		width: 100%;
		margin: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
	}
	.note {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-3);
		min-height: 34px;
		margin-bottom: var(--s-2);
		font-size: var(--t-sm);
	}
	.keys {
		display: grid;
		gap: var(--s-4);
		grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
		max-height: 320px;
		overflow: auto;
		padding-right: var(--s-2);
	}
	h3 {
		margin: 0 0 var(--s-2);
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--text-dim);
	}
	ul {
		display: grid;
		gap: var(--s-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-sm);
	}
	.fixedkeys {
		display: flex;
		gap: 3px;
		grid-column: 2 / 4;
		justify-content: flex-end;
	}
	.cap {
		min-width: 64px;
		min-height: 28px;
		padding: 0 var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text);
		background: rgb(150 180 210 / 0.14);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.cap:hover {
		border-color: var(--c-accent);
	}
	.cap.changed {
		color: var(--c-accent);
	}
	.cap.waiting {
		color: var(--c-ink);
		background: var(--c-accent);
		border-color: var(--c-accent);
	}
	.reset {
		width: 28px;
		min-height: 28px;
		color: var(--text-dim);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--r-control);
	}
	.reset:disabled {
		opacity: 0.3;
	}
	.reset:not(:disabled):hover {
		color: var(--text);
		border-color: var(--line-strong);
	}
	.foot {
		display: flex;
		justify-content: flex-start;
		margin-top: var(--s-3);
	}
</style>
