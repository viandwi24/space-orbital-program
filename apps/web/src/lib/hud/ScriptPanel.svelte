<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Panel from '../ui/Panel.svelte';
	import { scriptIsActive, type ScriptView } from '../script-state';
	import type { SandboxStatus } from '../script-sandbox';
	import { reachableProbes } from '../script-sandbox-probe';
	import {
		checkImportedText,
		encodeScript,
		scriptFileName,
		shareUrl,
		MAX_SCRIPT_BYTES,
		type ImportInfo
	} from '../script-share';
	import type { SyntaxProblem } from '../script-checker';
	import CodeEditor from './CodeEditor.svelte';

	let {
		source,
		script,
		canRun,
		imported,
		sandbox,
		notice,
		vesselName,
		check,
		onchange,
		onrun,
		onstop,
		onsample,
		onimport,
		onundo,
		onconfirmed
	}: {
		source: string;
		script: ScriptView;
		canRun: boolean;
		imported: ImportInfo | null;
		sandbox: SandboxStatus;
		/** A problem to show from outside the panel (a bad share link). */
		notice: string | null;
		vesselName: string;
		/** Compile the script in the sandbox for the editor's syntax check (plan 058). */
		check?: (text: string) => Promise<SyntaxProblem | null | undefined>;
		onchange: (text: string) => void;
		onrun: () => void;
		onstop: () => void;
		onsample: () => void;
		onimport: (text: string, info: ImportInfo) => void;
		/** Put back what the editor held before the import. */
		onundo: () => void;
		/** The player confirmed running imported code: it is theirs to run from now on. */
		onconfirmed: () => void;
	} = $props();

	let logEl = $state<HTMLPreElement>();
	let fileInput = $state<HTMLInputElement>();
	let confirmOpen = $state(false);
	let pasteOpen = $state(false);
	let pasted = $state('');
	let pasteProblem = $state<string | null>(null);
	let note = $state<string | null>(null);
	const running = $derived(scriptIsActive(script.status));
	const bad = $derived(script.status === 'failed' || script.status === 'terminated');
	const leaks = $derived(sandbox.state === 'started' ? reachableProbes(sandbox.reports) : []);
	const origin = $derived(
		imported === null
			? ''
			: imported.from === 'file'
				? `the file ${imported.name ?? ''}`.trim()
				: imported.from === 'link'
					? 'a link'
					: 'pasted text'
	);

	// Keep the newest output in view.
	$effect(() => {
		script.log.length;
		if (logEl) logEl.scrollTop = logEl.scrollHeight;
	});

	function run(): void {
		if (imported) confirmOpen = true;
		else onrun();
	}
	function confirmRun(): void {
		confirmOpen = false;
		onconfirmed();
		onrun();
	}

	async function copy(text: string, done: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			note = done;
		} catch {
			note = 'The browser refused to copy. Select the text and copy it by hand.';
		}
	}
	async function copyLink(): Promise<void> {
		const token = await encodeScript(source);
		if (token === null) {
			note = `Too long to share as a link (over ${MAX_SCRIPT_BYTES / 1024} KB). Save it as a file instead.`;
			return;
		}
		await copy(
			shareUrl(location.href, token),
			'Link copied. The script is inside the link, nothing is uploaded.'
		);
	}
	function saveFile(): void {
		const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = scriptFileName(vesselName);
		a.click();
		URL.revokeObjectURL(url);
		note = `Saved ${a.download}.`;
	}
	async function readFile(): Promise<void> {
		const file = fileInput?.files?.[0];
		if (!file) return;
		if (fileInput) fileInput.value = '';
		if (file.size > MAX_SCRIPT_BYTES) {
			note = `${file.name} is larger than ${MAX_SCRIPT_BYTES / 1024} KB.`;
			return;
		}
		const checked = checkImportedText(await file.text());
		if (!checked.ok) note = `Not imported: ${checked.reason}.`;
		else {
			onimport(checked.source, { from: 'file', name: file.name });
			note = null;
		}
	}
	function importPasted(): void {
		const checked = checkImportedText(pasted);
		if (!checked.ok) {
			pasteProblem = checked.reason;
		} else if (checked.source.trim() === '') {
			pasteProblem = 'there is nothing to import';
		} else {
			onimport(checked.source, { from: 'text' });
			pasteOpen = false;
			pasted = '';
			pasteProblem = null;
			note = null;
		}
	}
</script>

<Panel title="Script" solid aria-label="Script">
	{#snippet aside()}
		<span class="status" class:bad data-testid="script-status">{script.status}</span>
	{/snippet}

	<p
		class="isolation"
		class:warn={leaks.length > 0 || sandbox.state === 'failed'}
		data-testid="sandbox-note"
	>
		{#if sandbox.state === 'failed'}
			The sandbox did not start: {sandbox.error ?? 'unknown error'}. Scripts cannot run.
		{:else if leaks.length > 0}
			Isolation is weaker than designed here ({leaks.join(', ')}). Run only scripts you wrote.
		{:else if sandbox.contained}
			Runs isolated: no network, no saved data, no access to this page.
		{:else}
			Runs in an isolated sandbox, checked at the first Run.
		{/if}
	</p>

	{#if sandbox.reports.length > 0}
		<details class="checked" data-testid="sandbox-report">
			<summary>What the sandbox checked</summary>
			<ul>
				{#each sandbox.reports as report (report.context)}
					<li>
						<strong>{report.context === 'frame' ? 'Sandbox page' : 'Script worker'}</strong>
						(origin <span class="num">{report.opaque ? 'opaque' : report.origin}</span>):
						{#each Object.entries(report.probes) as [name, reach] (name)}
							<span class="num probe" class:open={reach === 'reachable'}>{name} {reach}</span>
						{/each}
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if imported}
		<div class="import" role="note" data-testid="import-banner">
			<p>
				<strong>Imported from {origin}.</strong> It is someone else's code and has not run. Read it, and
				run it only if you trust where it came from.
			</p>
			<Button variant="ghost" onclick={onundo}>Put my script back</Button>
		</div>
	{/if}

	<CodeEditor
		value={source}
		errorLine={script.errorLine}
		label="Script source"
		{check}
		placeholder={'Write the flight in JavaScript, for example:\nship.throttle = 1;\nstage();\nawait wait(5);\nprint(ship.altitude);'}
		{onchange}
	/>

	<div class="buttons">
		<Button variant="primary" disabled={!canRun} onclick={run}>
			{imported ? 'Run imported script' : 'Run'}
		</Button>
		<Button disabled={!running} onclick={onstop}>Stop</Button>
		<Button variant="ghost" onclick={onsample}>Load sample</Button>
	</div>

	<div class="share">
		<span class="group" id="share-label">Share</span>
		<div class="row" role="group" aria-labelledby="share-label">
			<Button variant="ghost" onclick={() => copy(source, 'Script copied as text.')}
				>Copy text</Button
			>
			<Button variant="ghost" onclick={copyLink}>Copy link</Button>
			<Button variant="ghost" onclick={saveFile}>Save file</Button>
		</div>
		<span class="group" id="import-label">Import</span>
		<div class="row" role="group" aria-labelledby="import-label">
			<Button variant="ghost" onclick={() => fileInput?.click()}>From file</Button>
			<Button variant="ghost" onclick={() => (pasteOpen = true)}>Paste text</Button>
		</div>
		<input
			bind:this={fileInput}
			type="file"
			accept=".js,.mjs,.txt,text/javascript,text/plain"
			onchange={readFile}
			hidden
			aria-label="Import a script file"
		/>
	</div>
	{#if note ?? notice}<p class="note" role="status">{note ?? notice}</p>{/if}

	{#if script.status !== 'idle'}
		<p class="timing num">
			last tick {script.lastMs.toFixed(1)} ms, worst {script.maxMs.toFixed(1)} ms
		</p>
	{/if}
	{#if script.error}
		<pre class="err">{script.errorLine === null
				? ''
				: `Line ${script.errorLine}: `}{script.error}</pre>
	{/if}
	<pre class="log num" bind:this={logEl} aria-label="Script output">{script.log.length > 0
			? script.log.join('\n')
			: 'Output from print() appears here.'}</pre>
</Panel>

<Dialog
	open={confirmOpen}
	title="Run a script from someone else?"
	onclose={() => (confirmOpen = false)}
>
	<p class="what">
		This code came from {origin}. If you run it, it flies <strong>{vesselName}</strong> without asking
		again: it can throttle, steer, stage and use part actions.
	</p>
	<p class="what">
		It runs in an isolated sandbox, so it cannot read your files or saved vessels or reach the
		network. That protection is strong but not proven. Run it only if you read it and trust it.
	</p>
	<div class="actions">
		<Button variant="primary" onclick={confirmRun}>Run this script</Button>
		<Button onclick={() => (confirmOpen = false)}>Keep reading</Button>
	</div>
</Dialog>

<Dialog
	open={pasteOpen}
	title="Import a script from text"
	onclose={() => {
		pasteOpen = false;
		pasteProblem = null;
	}}
>
	<p class="what">
		The text replaces the script in the editor. It will not run until you confirm it.
	</p>
	<textarea
		class="paste"
		bind:value={pasted}
		spellcheck="false"
		rows="10"
		aria-label="Script text to import"></textarea>
	{#if pasteProblem}<p class="err" role="alert">Not imported: {pasteProblem}.</p>{/if}
	<div class="actions">
		<Button variant="primary" onclick={importPasted}>Import</Button>
		<Button onclick={() => (pasteOpen = false)}>Cancel</Button>
	</div>
</Dialog>

<style>
	.isolation {
		margin: 0 0 var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.isolation.warn {
		color: var(--c-warning);
	}
	.checked {
		margin: 0 0 var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.checked summary {
		cursor: pointer;
	}
	.checked ul {
		margin: var(--s-1) 0 0;
		padding-left: var(--s-4);
	}
	.probe {
		display: inline-block;
		margin-right: var(--s-2);
	}
	.probe.open {
		color: var(--c-warning);
	}
	.import {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-2);
		margin-bottom: var(--s-2);
		padding: var(--s-2) var(--s-3);
		font-size: var(--t-sm);
		color: var(--text);
		background: rgb(255 191 74 / 0.1);
		border: 1px solid var(--c-warning);
		border-radius: var(--r-control);
	}
	.import p {
		margin: 0;
	}
	.buttons,
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2);
	}
	.buttons {
		margin-top: var(--s-2);
	}
	.share {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--s-1) var(--s-3);
		margin-top: var(--s-2);
	}
	.group {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.note {
		margin: var(--s-2) 0 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
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
	.what {
		margin: 0 0 var(--s-3);
		max-width: 52ch;
		color: var(--text-dim);
	}
	strong {
		color: var(--text);
	}
	.actions {
		display: flex;
		gap: var(--s-2);
		margin-top: var(--s-4);
	}
	.paste {
		box-sizing: border-box;
		width: 100%;
		padding: var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
</style>
