<script lang="ts">
	import Button from './Button.svelte';
	import Kbd from './Kbd.svelte';
	import Segmented from './Segmented.svelte';
	import {
		ACTIONS,
		BINDING_MODE_LABEL,
		FIXED_KEYS,
		actionSpec,
		keyIdOf,
		keyLabel,
		scopeOf,
		type ActionId,
		type BindingMode
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
		for (const a of ACTIONS.filter((x) => x.mode === mode)) {
			out.set(a.group, [...(out.get(a.group) ?? []), a]);
		}
		return [...out];
	});
	const fixed = $derived(FIXED_KEYS.filter((f) => f.scope === scopeOf(mode)));

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
		const key = keyIdOf(e);
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

<div class="head">
	<p class="note">Click a key to change it, then press the new one. Esc cancels.</p>
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
		data-testid="bind-reset-all">Reset all to defaults</Button
	>
</div>

<style>
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
