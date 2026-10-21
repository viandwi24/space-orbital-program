<script lang="ts">
	/**
	 * A panel a mod defined (plan 112, ADR 0149): its view evaluated at every HUD update, its canvas
	 * drawn while it is shown, and every error kept inside the panel (point 5).
	 */
	import type { Command, PanelDefinition, PanelInput } from '@orbital/core';
	import { panelCanvas } from './canvas';
	import { commandOf, evaluatePanel, type PanelMemory } from './evaluate';
	import PanelView from './PanelView.svelte';
	import ModPanelFrame from './ModPanelFrame.svelte';

	let {
		panel,
		input,
		oncommand
	}: {
		panel: PanelDefinition;
		input: PanelInput | null;
		oncommand: (command: Command) => void;
	} = $props();

	const memory: PanelMemory = new Map();
	let actionError = $state<string | null>(null);
	let drawError = $state<string | null>(null);
	let frameError = $state<string | null>(null);
	let canvas = $state<HTMLCanvasElement>();
	const result = $derived(input ? evaluatePanel(panel, input, memory) : null);
	const error = $derived(
		result && !result.ok ? result.error : (actionError ?? drawError ?? frameError)
	);

	function act(path: string, on?: boolean | string): void {
		if (!input) return;
		const r = commandOf(panel, path, input, on);
		if ('error' in r) actionError = r.error;
		else if (r.command) oncommand(r.command);
	}

	$effect(() => {
		const c = canvas;
		const def = panel.canvas;
		if (!c || !def || !input) return;
		const ctx = c.getContext('2d');
		if (!ctx) return;
		try {
			def.draw(panelCanvas(ctx, c.width, c.height, getComputedStyle(c).fontFamily), input);
			drawError = null;
		} catch (e) {
			drawError = e instanceof Error ? e.message : String(e);
		}
	});
</script>

<div class="mod" data-testid="panel-{panel.id}">
	{#if error}
		<p class="error" role="alert">This panel stopped: {error}</p>
	{:else if result?.ok}
		<PanelView node={result.nodes} onaction={act} />
	{:else}
		<p class="wait">[—]</p>
	{/if}
	{#if panel.custom && !error}
		<ModPanelFrame
			source={panel.custom.source}
			height={panel.custom.height}
			{input}
			title="{panel.title} (mod UI)"
			{oncommand}
			onerror={(m) => (frameError = m)}
		/>
	{/if}
	{#if panel.canvas && !error}
		<canvas
			bind:this={canvas}
			width="260"
			height={panel.canvas.height}
			aria-label="{panel.title} drawing"
		></canvas>
	{/if}
</div>

<style>
	.mod {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem;
	}
	canvas {
		grid-column: 1 / -1;
		width: 100%;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
	}
	.error,
	.wait {
		grid-column: 1 / -1;
		margin: 0;
		padding: 0.5rem;
		font-size: var(--t-small);
	}
	.error {
		color: var(--danger);
	}
	.wait {
		color: var(--text-muted);
	}
</style>
