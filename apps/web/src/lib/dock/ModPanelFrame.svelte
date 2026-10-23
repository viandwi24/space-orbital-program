<script lang="ts">
	/**
	 * A mod panel's own UI (plan 330, ADR 0285 point 1) in a sandboxed frame: scripts only, an opaque
	 * origin. It gets the panel input at each update; its commands go to the sim like a button's.
	 */
	import type { Command, PanelInput } from '@orbital/core';
	import { frameInput, frameMessage, modFrameDocument } from './mod-frame';

	let {
		source,
		height,
		input,
		title,
		oncommand,
		onerror
	}: {
		source: string;
		height: number;
		input: PanelInput | null;
		title: string;
		oncommand: (command: Command) => void;
		onerror: (message: string) => void;
	} = $props();

	let frame = $state<HTMLIFrameElement>();
	let ready = $state(false);
	let size = $state(0);
	let doc = $state<string | null>(null);
	void modFrameDocument().then((d) => (doc = d));

	const theme = (): Record<string, string> => {
		const css = getComputedStyle(document.documentElement);
		const read = (name: string, fallback: string): string =>
			css.getPropertyValue(name).trim() || fallback;
		return {
			text: read('--text-primary', '#e8eef5'),
			dim: read('--text-dim', '#9aa4b2'),
			accent: read('--c-accent', '#4c8dff'),
			surface: read('--surface-inset', '#11151b'),
			button: read('--surface-button', '#1c222b'),
			font: read('--font-ui', 'system-ui, sans-serif')
		};
	};

	$effect(() => {
		const f = frame;
		if (!f) return;
		const onMessage = (event: MessageEvent): void => {
			if (event.source !== f.contentWindow) return;
			const m = frameMessage(event.data);
			if (!m) return;
			if (m.kind === 'ready') {
				ready = true;
				f.contentWindow?.postMessage({ kind: 'mount', source, theme: theme() }, '*');
			} else if (m.kind === 'command') oncommand(m.command);
			else if (m.kind === 'resize') size = m.height;
			else onerror(m.message);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	$effect(() => {
		if (!ready || !input || !frame) return;
		// the frame's origin is opaque: "*" is the only target that matches it
		frame.contentWindow?.postMessage({ kind: 'input', input: frameInput(input) }, '*');
	});
</script>

{#if doc}
	<iframe
		bind:this={frame}
		sandbox="allow-scripts"
		referrerpolicy="no-referrer"
		{title}
		srcdoc={doc}
		style:height="{size || height}px"
	></iframe>
{/if}

<style>
	iframe {
		grid-column: 1 / -1;
		width: 100%;
		border: 0;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
	}
</style>
