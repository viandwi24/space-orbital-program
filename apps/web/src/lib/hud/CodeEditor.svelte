<script lang="ts">
	import { highlight } from '../script-highlight';

	let {
		value,
		errorLine = null,
		placeholder = '',
		label,
		onchange
	}: {
		value: string;
		/** 1-based line to mark as the one the last error points at. */
		errorLine?: number | null;
		placeholder?: string;
		label: string;
		onchange: (text: string) => void;
	} = $props();

	const lines = $derived(highlight(value));
	/** Width of the longest line in characters: the textarea is as wide as its text, the frame scrolls. */
	const columns = $derived(value.split('\n').reduce((m, l) => Math.max(m, l.length), 0));
	let frame = $state<HTMLDivElement>();

	// Bring the marked line into view when an error arrives.
	$effect(() => {
		if (!frame || errorLine === null) return;
		const row = frame.querySelector<HTMLElement>(`[data-line="${errorLine}"]`);
		row?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="frame" bind:this={frame}>
	<div class="gutter" aria-hidden="true">
		{#each lines as _, i (i)}
			<span class="no" class:err={errorLine === i + 1} data-line={i + 1}>{i + 1}</span>
		{/each}
	</div>
	<div class="code" style:--cols={columns}>
		<div class="paint" aria-hidden="true">
			{#each lines as line, i (i)}<div class="row" class:err={errorLine === i + 1}>
					{#each line as token, t (t)}<span class={token.kind}>{token.text}</span>{/each}{' '}
				</div>{/each}
		</div>
		<textarea
			{value}
			oninput={(e) => onchange(e.currentTarget.value)}
			spellcheck="false"
			autocapitalize="off"
			autocomplete="off"
			wrap="off"
			rows={lines.length}
			{placeholder}
			aria-label={label}
			aria-invalid={errorLine !== null}></textarea>
	</div>
</div>

<style>
	.frame {
		display: flex;
		align-items: stretch;
		min-height: calc(10 * var(--lh));
		max-height: 240px;
		overflow: auto;
		--lh: 1.45em;
		font-family: var(--font-num);
		font-size: var(--t-sm);
		line-height: 1.45;
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.frame:focus-within {
		border-color: var(--c-accent);
	}
	.gutter {
		position: sticky;
		left: 0;
		z-index: 1;
		flex: none;
		display: flex;
		flex-direction: column;
		padding: var(--s-2);
		text-align: right;
		color: var(--text-faint);
		background: var(--field);
		border-right: 1px solid var(--line);
		user-select: none;
	}
	.no {
		display: block;
		min-width: 2ch;
		padding-right: var(--s-1);
	}
	.no.err {
		font-weight: 700;
		color: var(--c-danger);
	}
	.code {
		position: relative;
		flex: 1 0 auto;
		min-width: calc(var(--cols) * 1ch + 2 * var(--s-2) + 2ch);
		padding: var(--s-2);
		box-sizing: border-box;
	}
	.paint,
	textarea {
		margin: 0;
		padding: 0;
		font: inherit;
		white-space: pre;
		tab-size: 4;
	}
	.paint {
		pointer-events: none;
		color: var(--text);
	}
	.row {
		/* The error band spans the whole width of the code area, not just the text. */
		margin: 0 calc(-1 * var(--s-2));
		padding: 0 var(--s-2);
	}
	.row.err {
		background: var(--syn-error-line);
	}
	textarea {
		position: absolute;
		inset: var(--s-2);
		width: calc(100% - 2 * var(--s-2));
		height: calc(100% - 2 * var(--s-2));
		overflow: hidden;
		resize: none;
		color: transparent;
		caret-color: var(--text);
		background: transparent;
		border: 0;
		outline: 0;
	}
	textarea::placeholder {
		color: var(--text-faint);
	}
	textarea::selection {
		color: transparent;
		background: rgb(92 207 255 / 0.32);
	}
	.keyword {
		color: var(--syn-keyword);
	}
	.string {
		color: var(--syn-string);
	}
	.number {
		color: var(--syn-number);
	}
	.comment {
		color: var(--syn-comment);
		font-style: italic;
	}
	.api {
		color: var(--syn-api);
	}
</style>
