<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Panel from '../ui/Panel.svelte';
	import { scriptIsActive, type ScriptView } from '../script-state';

	let {
		source,
		script,
		canRun,
		onchange,
		onrun,
		onstop,
		onsample
	}: {
		source: string;
		script: ScriptView;
		canRun: boolean;
		onchange: (text: string) => void;
		onrun: () => void;
		onstop: () => void;
		onsample: () => void;
	} = $props();

	let logEl = $state<HTMLPreElement>();
	const running = $derived(scriptIsActive(script.status));
	const bad = $derived(script.status === 'failed' || script.status === 'terminated');

	// Keep the newest output in view.
	$effect(() => {
		script.log.length;
		if (logEl) logEl.scrollTop = logEl.scrollHeight;
	});
</script>

<Panel title="Script" solid aria-label="Script">
	{#snippet aside()}
		<span class="status" class:bad data-testid="script-status">{script.status}</span>
	{/snippet}
	<textarea
		value={source}
		oninput={(e) => onchange(e.currentTarget.value)}
		spellcheck="false"
		rows="10"
		placeholder={'Write the flight in JavaScript, for example:\nship.throttle = 1;\nstage();\nawait wait(5);\nprint(ship.altitude);'}
		aria-label="Script source"></textarea>
	<div class="buttons">
		<Button variant="primary" disabled={!canRun} onclick={onrun}>Run</Button>
		<Button disabled={!running} onclick={onstop}>Stop</Button>
		<Button variant="ghost" onclick={onsample}>Load sample</Button>
	</div>
	{#if script.status !== 'idle'}
		<p class="timing num">
			last tick {script.lastMs.toFixed(1)} ms, worst {script.maxMs.toFixed(1)} ms
		</p>
	{/if}
	{#if script.error}<pre class="err">{script.error}</pre>{/if}
	<pre class="log num" bind:this={logEl} aria-label="Script output">{script.log.length > 0
			? script.log.join('\n')
			: 'Output from print() appears here.'}</pre>
</Panel>

<style>
	textarea {
		box-sizing: border-box;
		width: 100%;
		resize: vertical;
		padding: var(--s-2);
		font-family: var(--font-num);
		font-size: var(--t-sm);
		line-height: 1.45;
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	textarea::placeholder {
		color: var(--text-faint);
	}
	.buttons {
		display: flex;
		gap: var(--s-2);
		margin-top: var(--s-2);
	}
	.status {
		font-weight: 600;
		color: var(--c-accent);
	}
	.status.bad,
	.err {
		color: var(--c-danger);
	}
	.timing {
		margin: var(--s-2) 0 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	pre {
		margin: var(--s-2) 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: var(--t-xs);
	}
	.log {
		min-height: 3.2em;
		max-height: 150px;
		overflow-y: auto;
		padding: var(--s-2);
		color: var(--text-dim);
		background: var(--field);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	.err {
		max-height: 80px;
		overflow-y: auto;
	}
</style>
