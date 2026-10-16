<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Kbd from './Kbd.svelte';
	import Segmented from './Segmented.svelte';
	import { BINDING_GROUPS, BINDING_MODE_LABEL, type BindingMode } from '../keybindings';
	import {
		clearGraphicsPreset,
		loadAutoQuality,
		presetChoice,
		saveAutoQuality,
		saveGraphicsPreset,
		type PresetChoice
	} from '../graphics';
	import { settings } from '../settings/settings.svelte';
	import type { UnitSystem } from '../units.svelte';
	import { TUTORIAL_STEPS } from '../onboarding/tutorial';

	let {
		open,
		onclose,
		onpreset,
		onautoquality
	}: {
		open: boolean;
		onclose: () => void;
		/** A running flight applies the preset now (`Flight.setGraphicsPreset`); the dialog saves it either way. */
		onpreset?: (choice: PresetChoice) => void;
		onautoquality?: (on: boolean) => void;
	} = $props();

	type Tab = 'graphics' | 'game' | 'controls' | 'audio';
	let tab = $state<Tab>('graphics');
	let preset = $state<PresetChoice>('auto');
	let auto = $state(true);
	let controlsMode = $state<BindingMode>('flight');

	// Read the stored choices each time the dialog opens, so two pages never disagree.
	$effect(() => {
		if (!open) return;
		preset = presetChoice();
		auto = loadAutoQuality();
	});

	function choosePreset(choice: PresetChoice): void {
		preset = choice;
		if (choice === 'auto') clearGraphicsPreset();
		else saveGraphicsPreset(choice);
		onpreset?.(choice);
	}
	function chooseAuto(on: boolean): void {
		auto = on;
		saveAutoQuality(on);
		onautoquality?.(on);
	}

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'graphics', label: 'Graphics' },
		{ id: 'game', label: 'Game' },
		{ id: 'controls', label: 'Controls' },
		{ id: 'audio', label: 'Audio' }
	];
	const presetOptions = [
		{ value: 'auto', label: 'Automatic', hint: 'Chosen from your graphics hardware' },
		{ value: 'low', label: 'Low', hint: 'Fewest effects, fastest' },
		{ value: 'medium', label: 'Medium', hint: 'Shadows and denser terrain' },
		{ value: 'high', label: 'High', hint: 'Everything on' }
	] as const;
	const unitOptions = [
		{ value: 'metric', label: 'Metric', hint: 'Metres, kilometres, m/s, kg, tonnes' },
		{ value: 'imperial', label: 'Imperial', hint: 'Feet, miles, ft/s, pounds, short tons' }
	] as const;
	const modeOptions = (Object.keys(BINDING_MODE_LABEL) as BindingMode[]).map((m) => ({
		value: m,
		label: BINDING_MODE_LABEL[m]
	}));
	const tutorialText = $derived(
		settings.tutorial.status === 'done'
			? 'You finished the first-flight guide.'
			: settings.tutorial.status === 'skipped'
				? 'The first-flight guide is switched off.'
				: `The first-flight guide is on (step ${Math.min(settings.tutorial.step + 1, TUTORIAL_STEPS.length)} of ${TUTORIAL_STEPS.length}).`
	);
</script>

<Dialog {open} title="Settings" {onclose}>
	<div class="tabs" role="tablist" aria-label="Settings sections">
		{#each tabs as t (t.id)}
			<button
				type="button"
				role="tab"
				id="settings-tab-{t.id}"
				aria-selected={tab === t.id}
				aria-controls="settings-panel"
				tabindex={tab === t.id ? 0 : -1}
				class:on={tab === t.id}
				onclick={() => (tab = t.id)}
				onkeydown={(e) => {
					const at = tabs.findIndex((x) => x.id === tab);
					const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
					if (!step) return;
					e.preventDefault();
					tab = tabs[(at + step + tabs.length) % tabs.length]!.id;
					queueMicrotask(() => document.getElementById(`settings-tab-${tab}`)?.focus());
				}}>{t.label}</button
			>
		{/each}
	</div>

	<div class="body" id="settings-panel" role="tabpanel" aria-labelledby="settings-tab-{tab}">
		{#if tab === 'graphics'}
			<div class="row">
				<div class="what">
					<h3>Quality</h3>
					<p>
						Automatic picks a preset for your graphics hardware. Changes apply at once in flight.
					</p>
				</div>
				<Segmented
					label="Graphics quality"
					value={preset}
					options={presetOptions}
					onchange={choosePreset}
					testid="setting-preset"
				/>
			</div>
			<label class="row check">
				<div class="what">
					<h3>Adjust quality while playing</h3>
					<p>
						Lowers the resolution, then the preset, if the view runs under about 55 frames per
						second.
					</p>
				</div>
				<input
					type="checkbox"
					checked={auto}
					onchange={(e) => chooseAuto(e.currentTarget.checked)}
					data-testid="auto-quality"
				/>
			</label>
		{:else if tab === 'game'}
			<div class="row">
				<div class="what">
					<h3>Units</h3>
					<p>Only the display changes; the simulation and your saves stay in SI.</p>
				</div>
				<Segmented
					label="Display units"
					value={settings.units}
					options={unitOptions}
					onchange={(u: UnitSystem) => settings.setUnits(u)}
					testid="setting-units"
				/>
			</div>
			<div class="row">
				<div class="what">
					<h3>First-flight guide</h3>
					<p>{tutorialText}</p>
				</div>
				<Button onclick={() => settings.resetTutorial()} data-testid="tutorial-reset"
					>Start the guide again</Button
				>
			</div>
		{:else if tab === 'controls'}
			<div class="row modes">
				<p class="note">These keys are fixed in version 1.0; changing them is on the roadmap.</p>
				<Segmented
					label="Which controls"
					value={controlsMode}
					options={modeOptions}
					onchange={(m: BindingMode) => (controlsMode = m)}
				/>
			</div>
			<div class="keys">
				{#each BINDING_GROUPS.filter((g) => g.mode === controlsMode) as g (g.id)}
					<section>
						<h3>{g.title}</h3>
						<dl>
							{#each g.rows as r (r.action)}
								<dt>
									{#each r.show ?? r.keys as k, i (k)}{#if i > 0}<span class="or"
												>{r.show ? '–' : '/'}</span
											>{/if}<Kbd>{k}</Kbd>{/each}
								</dt>
								<dd>{r.action}</dd>
							{/each}
						</dl>
					</section>
				{/each}
			</div>
		{:else}
			<div class="row">
				<div class="what">
					<h3>Sound</h3>
					<p>
						Version 1.0 has no sound. Music and engine audio are on the roadmap; until then there is
						nothing to turn up or down.
					</p>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					value="0"
					disabled
					aria-label="Volume (no sound in this version)"
				/>
			</div>
		{/if}
	</div>
	<div class="foot"><Button variant="primary" onclick={onclose}>Done</Button></div>
</Dialog>

<style>
	.tabs {
		display: flex;
		gap: var(--s-1);
		margin: 0 0 var(--s-4);
		border-bottom: 1px solid var(--line);
	}
	.tabs button {
		min-height: 34px;
		padding: 0 var(--s-4);
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs button:hover {
		color: var(--text);
	}
	.tabs button.on {
		color: var(--c-accent);
		border-bottom-color: var(--c-accent);
	}
	.body {
		min-width: min(560px, calc(100vw - 80px));
		min-height: 220px;
		display: grid;
		align-content: start;
		gap: var(--s-4);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-5);
	}
	.row.check {
		cursor: pointer;
	}
	.row.modes {
		flex-wrap: wrap;
	}
	h3 {
		margin: 0 0 2px;
		font-size: var(--t-md);
		font-weight: 600;
	}
	.what p,
	.note {
		margin: 0;
		max-width: 38ch;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--c-accent);
	}
	input[type='range'] {
		width: 140px;
		opacity: 0.5;
	}
	.keys {
		display: grid;
		gap: var(--s-4);
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		max-height: 340px;
		overflow: auto;
		padding-right: var(--s-2);
	}
	.keys h3 {
		font-size: var(--t-sm);
		color: var(--text-dim);
		margin-bottom: var(--s-2);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--s-2) var(--s-3);
		margin: 0;
		align-items: center;
	}
	dt {
		display: flex;
		gap: 3px;
		align-items: center;
	}
	dd {
		margin: 0;
		font-size: var(--t-sm);
	}
	.or {
		color: var(--text-faint);
		font-size: var(--t-xs);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--s-5);
	}
</style>
