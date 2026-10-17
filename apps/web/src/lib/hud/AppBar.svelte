<script lang="ts">
	import { settings } from '../settings/settings.svelte';
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';

	let {
		map,
		script,
		scriptRunning,
		onmenu,
		onmap,
		onscript,
		onhelp
	}: {
		map: boolean;
		script: boolean;
		scriptRunning: boolean;
		onmenu: () => void;
		onmap: () => void;
		onscript: () => void;
		onhelp: () => void;
	} = $props();
</script>

<nav class="bar" aria-label="Flight tools">
	<IconButton icon="menu" label="Pause menu" hint="Esc" text="Menu" onclick={onmenu} />
	<IconButton
		icon="map"
		label="Map view"
		hint={settings.keymap.label('map')}
		text="Map"
		pressed={map}
		onclick={onmap}
	/>
	<IconButton
		icon="script"
		label="Script panel"
		text={scriptRunning ? 'Script (running)' : 'Script'}
		pressed={script}
		onclick={onscript}
	/>
	<IconButton
		icon="help"
		label="Controls"
		hint={settings.keymap.label('help')}
		text="Controls"
		onclick={onhelp}
	/>
	<a class="back" href="/vab" title="Back to the vehicle assembly">
		<Icon name="back" /> <span>VAB</span>
	</a>
</nav>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px var(--s-2);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		height: 36px;
		padding: 0 var(--s-3) 0 var(--s-2);
		margin-left: var(--s-1);
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-dim);
		text-decoration: none;
		border-left: 1px solid var(--line);
	}
	.back:hover {
		color: var(--text);
	}
</style>
