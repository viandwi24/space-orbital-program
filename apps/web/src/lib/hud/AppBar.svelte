<script lang="ts">
	/**
	 * The refs flight toolbar (plan 088, ADR 0144): `Map · VAB · Camera | Dock · Vessel · Staging · Nav
	 * · Crew | Script · Controls | Menu`, flat icons with the 4 px dot for what is open. Camera, Dock,
	 * Vessel and Crew wait for their plans and show disabled; Script and Controls are ours.
	 */
	import { settings } from '../settings/settings.svelte';
	import Icon from '../ui/Icon.svelte';

	let {
		map,
		script,
		scriptRunning,
		staging = true,
		dock = true,
		nav = true,
		onmenu,
		onmap,
		onscript,
		onhelp,
		onstaging,
		ondock,
		onnav
	}: {
		map: boolean;
		script: boolean;
		scriptRunning: boolean;
		/** The staging panel is shown. */
		staging?: boolean;
		/** The panel dock is shown (plan 112). */
		dock?: boolean;
		/** The navball module is shown. */
		nav?: boolean;
		onmenu: () => void;
		onmap: () => void;
		onscript: () => void;
		onhelp: () => void;
		onstaging?: () => void;
		ondock?: () => void;
		onnav?: () => void;
	} = $props();

	const later = (what: string, plan: number): string => `${what}: comes with plan ${plan}`;
</script>

<nav class="bar" aria-label="Flight tools">
	<button
		type="button"
		class="tb"
		class:on={map}
		aria-label="Map view"
		aria-pressed={map}
		title="Map view ({settings.keymap.label('map')})"
		onclick={onmap}><Icon name="orbit" size={18} /></button
	>
	<a class="tb" href="/vab" aria-label="Vehicle assembly" title="Back to the vehicle assembly"
		><Icon name="hangar" size={18} /></a
	>
	<button
		type="button"
		class="tb"
		aria-label="Camera view"
		title={later('Camera views', 112)}
		disabled><Icon name="camera" size={18} /></button
	>
	<span class="rule" aria-hidden="true"></span>
	<button
		type="button"
		class="tb"
		class:on={dock}
		aria-label="Panel dock"
		aria-pressed={dock}
		title="Panel dock"
		onclick={ondock}><Icon name="dock" size={18} /></button
	>
	<button
		type="button"
		class="tb"
		aria-label="Vessel panel"
		title={later('The vessel panel', 111)}
		disabled><Icon name="vessel" size={18} /></button
	>
	<button
		type="button"
		class="tb"
		class:on={staging}
		aria-label="Staging panel"
		aria-pressed={staging}
		title="Staging panel"
		onclick={onstaging}><Icon name="staging" size={18} /></button
	>
	<button
		type="button"
		class="tb"
		class:on={nav}
		aria-label="Navball"
		aria-pressed={nav}
		title="Navball and instruments"
		onclick={onnav}><Icon name="navball" size={18} /></button
	>
	<button
		type="button"
		class="tb"
		aria-label="Crew panel"
		title={later('The crew panel', 108)}
		disabled><Icon name="crew" size={18} /></button
	>
	<span class="rule" aria-hidden="true"></span>
	<button
		type="button"
		class="tb"
		class:on={script}
		class:running={scriptRunning}
		aria-label="Script panel"
		aria-pressed={script}
		title={scriptRunning ? 'Script panel (a script is running)' : 'Script panel'}
		onclick={onscript}><Icon name="script" size={18} /></button
	>
	<button
		type="button"
		class="tb"
		aria-label="Controls"
		title="Controls ({settings.keymap.label('help')})"
		onclick={onhelp}><Icon name="help" size={18} /></button
	>
	<span class="rule" aria-hidden="true"></span>
	<button type="button" class="tb" aria-label="Pause menu" title="Menu (Esc)" onclick={onmenu}
		><Icon name="menu" size={18} /></button
	>
</nav>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		height: var(--capsule);
		padding: 0.25rem;
		box-sizing: border-box;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.tb {
		position: relative;
		display: grid;
		place-items: center;
		width: var(--round-btn);
		height: var(--round-btn);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-subtle);
		text-decoration: none;
	}
	@media (pointer: coarse) {
		.tb {
			width: var(--touch-min);
			height: var(--touch-min);
		}
	}
	.tb:hover:not(:disabled) {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.tb:disabled {
		color: var(--text-disabled);
		cursor: not-allowed;
	}
	/* the flat active state (refs): a white icon and a 4 px dot under it */
	.tb.on {
		color: var(--text-primary);
	}
	.tb::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: var(--dot);
		height: var(--dot);
		margin-left: calc(var(--dot) / -2);
		border-radius: 50%;
		background: transparent;
	}
	.tb.on::after {
		background: var(--text-primary);
	}
	.tb.running::after {
		background: var(--accent);
	}
	.rule {
		width: 1px;
		height: 1.125rem;
		margin: 0 0.125rem;
		background: var(--surface-chip);
	}
</style>
