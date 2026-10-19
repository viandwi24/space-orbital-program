<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import ControlsEditor from './ControlsEditor.svelte';
	import Segmented from './Segmented.svelte';
	import Switch from './Switch.svelte';
	import { pageAudio } from '../audio/audio';
	import SavesPanel from '../save/SavesPanel.svelte';
	import { DEBRIS_CAPS, UI_SCALES, type TouchChoice } from '../settings/settings';
	import {
		clearGraphicsPreset,
		loadAutoQuality,
		presetChoice,
		saveAutoQuality,
		saveGraphicsPreset,
		type PresetChoice
	} from '../graphics';
	import { settings } from '../settings/settings.svelte';
	import { markActiveWorldForDebug } from '../debug/world-mark';
	import { PLACE_PAUSE_DEFAULTS, placePauses } from '../clock-state';
	/** Debug mode marked the active world (plan 203). */
	let debugNote = $state<string | null>(null);
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

	type Tab = 'graphics' | 'interface' | 'game' | 'time' | 'controls' | 'audio' | 'saves';
	let tab = $state<Tab>('graphics');
	let preset = $state<PresetChoice>('auto');
	let auto = $state(true);

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
		{ id: 'interface', label: 'Interface' },
		{ id: 'game', label: 'Game' },
		{ id: 'time', label: 'Time' },
		{ id: 'controls', label: 'Controls' },
		{ id: 'audio', label: 'Audio' },
		{ id: 'saves', label: 'Saves' }
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
	const touchOptions = [
		{ value: 'auto', label: 'Automatic', hint: 'On for touch screens, off with a mouse' },
		{ value: 'on', label: 'On', hint: 'Always show the on-screen controls' },
		{ value: 'off', label: 'Off', hint: 'Keyboard and mouse only' }
	] as const;
	const scaleOptions = UI_SCALES.map((s) => ({
		value: String(s),
		label: `${Math.round(s * 100)} %`,
		hint: s === 1 ? 'Default size' : `Text and panels at ${Math.round(s * 100)} %`
	}));
	const volumes = [
		{ key: 'master', label: 'Master', hint: 'Everything' },
		{ key: 'effects', label: 'Effects', hint: 'Engines, wind, staging, warnings' },
		{ key: 'ui', label: 'Interface', hint: 'Button clicks and SAS ticks' },
		{ key: 'music', label: 'Music', hint: 'Quiet ambient beds behind the game' }
	] as const;
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
		{:else if tab === 'interface'}
			<div class="row">
				<div class="what">
					<h3>Interface size</h3>
					<p>Text, panels and buttons; the 3D view is not scaled.</p>
				</div>
				<Segmented
					label="Interface size"
					value={String(settings.ui.scale)}
					options={scaleOptions}
					onchange={(v: string) => settings.setInterface({ scale: Number(v) })}
					testid="setting-ui-scale"
				/>
			</div>
			<div class="row">
				<div class="what">
					<h3>High contrast</h3>
					<p>Solid panels, brighter secondary text and stronger outlines.</p>
				</div>
				<Switch
					checked={settings.ui.highContrast}
					label="High contrast"
					onchange={(on) => settings.setInterface({ highContrast: on })}
					testid="setting-high-contrast"
				/>
			</div>
			<div class="row">
				<div class="what">
					<h3>Centre the vessel in the free area</h3>
					<p>
						The camera moves the vessel to the middle of the space the open panels leave. Off: it
						stays put when a panel opens or closes.
					</p>
				</div>
				<Switch
					checked={settings.ui.centreVessel}
					label="Centre the vessel in the free area"
					onchange={(on) => settings.setInterface({ centreVessel: on })}
					testid="setting-centre-vessel"
				/>
			</div>
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
			<div class="row">
				<div class="what">
					<h3>Touch controls</h3>
					<p>
						On-screen throttle, steering and stage buttons in flight, for tablets (landscape, 1024 ×
						768 or larger).
					</p>
				</div>
				<Segmented
					label="Touch controls"
					value={settings.touch}
					options={touchOptions}
					onchange={(c: TouchChoice) => settings.setTouch(c)}
					testid="setting-touch"
				/>
			</div>
			<div class="row">
				<div class="what">
					<h3>Debug mode</h3>
					<p>
						Cheats and set-state tools (Alt+F12) in Science and Career worlds. A world where you use
						them is marked "used cheats" for good and earns no achievements. Sandbox always has
						them; Hardcore never does.
					</p>
				</div>
				<Switch
					checked={settings.debug}
					label="Debug mode"
					onchange={(on) => {
						settings.setDebug(on);
						debugNote = null;
						if (on)
							void markActiveWorldForDebug().then(
								(marked) => (debugNote = marked ? 'This world is now marked "used cheats".' : null)
							);
					}}
					testid="setting-debug"
				/>
			</div>
			{#if debugNote}<p class="note" data-testid="debug-marked">{debugNote}</p>{/if}
		{:else if tab === 'time'}
			<p class="note">
				Where the world clock pauses by itself (plan 205). A pause you make with P or the time bar
				always wins: only you resume it. A world that does not allow pausing (Hardcore) always runs.
			</p>
			{#each Object.keys(PLACE_PAUSE_DEFAULTS) as place (place)}
				<div class="row">
					<div class="what"><h3>{place}</h3></div>
					<Switch
						checked={placePauses(place, settings.time.places)}
						label="Pause in {place}"
						onchange={(on) => settings.setTime({ places: { [place]: on } })}
						testid="time-place-{place}"
					/>
				</div>
			{/each}
			<div class="row">
				<div class="what">
					<h3>Keep running in a hidden tab</h3>
					<p>The world goes on while you look elsewhere and catches up when you come back.</p>
				</div>
				<Switch
					checked={settings.time.keepRunningHidden}
					label="Keep running in a hidden tab"
					onchange={(on) => settings.setTime({ keepRunningHidden: on })}
					testid="time-background"
				/>
			</div>
			<div class="row">
				<div class="what">
					<h3>Ask before leaving a flight</h3>
					<p>When the vessel is in the air, under thrust or in physics.</p>
				</div>
				<Switch
					checked={settings.time.askLeaveFlight}
					label="Ask before leaving a flight"
					onchange={(on) => settings.setTime({ askLeaveFlight: on })}
					testid="time-ask-leave"
				/>
			</div>
			<div class="row">
				<div class="what">
					<h3>Debris kept</h3>
					<p>
						Spent stages and other debris stay in the world up to this many; the oldest goes first.
					</p>
				</div>
				<select
					class="pick"
					value={settings.time.debrisCap}
					aria-label="Debris kept"
					data-testid="time-debris-cap"
					onchange={(e) => settings.setTime({ debrisCap: Number(e.currentTarget.value) })}
				>
					{#each DEBRIS_CAPS as cap (cap)}<option value={cap}>{cap === 0 ? 'None' : cap}</option
						>{/each}
				</select>
			</div>
		{:else if tab === 'saves'}
			<SavesPanel />
		{:else if tab === 'controls'}
			<ControlsEditor />
		{:else}
			<p class="note">
				Every sound is made in your browser as you play; nothing is downloaded. Sound starts after
				your first click or key press.
			</p>
			{#each volumes as v (v.key)}
				<label class="row">
					<div class="what">
						<h3>{v.label}</h3>
						<p>{v.hint}</p>
					</div>
					<input
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(settings.audio[v.key] * 100)}
						oninput={(e) => settings.setAudio({ [v.key]: Number(e.currentTarget.value) / 100 })}
						aria-label="{v.label} volume"
						data-testid="volume-{v.key}"
					/>
				</label>
			{/each}
			<label class="row check">
				<div class="what">
					<h3>Mute</h3>
					<p>Press {settings.keymap.label('mute')} anywhere to switch sound off and on.</p>
				</div>
				<input
					type="checkbox"
					checked={settings.audio.muted}
					onchange={(e) => settings.setAudio({ muted: e.currentTarget.checked })}
					data-testid="audio-mute"
				/>
			</label>
			<div class="row">
				<div class="what">
					<h3>Test</h3>
					<p>Plays a staging thump at the current volume.</p>
				</div>
				<Button onclick={() => pageAudio().oneShot('stage')} data-testid="audio-test">Play</Button>
			</div>
		{/if}
	</div>
	<div class="foot"><Button variant="primary" onclick={onclose}>Done</Button></div>
</Dialog>

<style>
	.pick {
		padding: 0.25rem 0.5rem;
		font: inherit;
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
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
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3) var(--s-5);
	}
	.row.check {
		cursor: pointer;
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
		width: 160px;
		accent-color: var(--c-accent);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--s-5);
	}
</style>
