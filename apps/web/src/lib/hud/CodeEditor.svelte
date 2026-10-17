<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { highlight } from '../script-highlight';
	import {
		acceptCompletion,
		applyMarks,
		closeBracket,
		completionsAt,
		createHistory,
		findAll,
		indent,
		lint,
		matchBracket,
		newline,
		outdent,
		stepMatch,
		type Completions,
		type Edit,
		type EditKind,
		type Mark
	} from '../script-editing';

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

	const uid = $props.id();
	let frame = $state<HTMLDivElement>();
	let box = $state<HTMLDivElement>();
	let area = $state<HTMLTextAreaElement>();
	let findInput = $state<HTMLInputElement>();
	let ruler = $state<HTMLSpanElement>();

	/** The selection as of the last key, click or input; the caret is its end. */
	let sel = $state({ start: 0, end: 0 });
	let focused = $state(false);
	let completion = $state<{ c: Completions; index: number } | null>(null);
	let find = $state({ open: false, query: '', current: -1 });
	/** After Escape, Tab leaves the editor instead of indenting (WCAG 2.1.2 no keyboard trap). */
	let tabLeaves = false;
	let announcement = $state('');

	// ---- history: the textarea's own undo is lost whenever we set `value`, so this is the only one ----
	const history = createHistory(untrack(() => ({ value, start: 0, end: 0 })));
	let lastEmitted = untrack(() => value);
	$effect(() => {
		// The script was replaced from outside (sample, import, undo of an import): start over.
		if (value !== lastEmitted) {
			lastEmitted = value;
			history.reset({ value, start: 0, end: 0 });
			completion = null;
		}
	});

	// ---- what is drawn ----
	const matches = $derived(findAll(value, find.open ? find.query : ''));
	const marks = $derived.by((): Mark[] => {
		const out: Mark[] = [];
		const m = focused && sel.start === sel.end ? matchBracket(value, sel.end) : null;
		if (m)
			out.push(
				{ from: m.a, to: m.a + 1, kind: 'bracket' },
				{ from: m.b, to: m.b + 1, kind: 'bracket' }
			);
		matches.forEach((at, i) =>
			out.push({
				from: at,
				to: at + find.query.length,
				kind: i === find.current ? 'find-current' : 'find'
			})
		);
		return out;
	});
	const lines = $derived(applyMarks(highlight(value), marks));
	/** Width of the longest line in characters: the textarea is as wide as its text, the frame scrolls. */
	const columns = $derived(value.split('\n').reduce((m, l) => Math.max(m, l.length), 0));
	const problems = $derived(lint(value));
	const problemLines = $derived(
		new Map(problems.map((p) => [p.line, p.severity] as const).reverse())
	);
	const findCount = $derived(
		find.query === ''
			? ''
			: matches.length === 0
				? 'No matches'
				: `${find.current + 1} of ${matches.length}`
	);

	// Bring the marked line into view when an error arrives.
	$effect(() => {
		if (!frame || errorLine === null) return;
		const row = frame.querySelector<HTMLElement>(`[data-line="${errorLine}"]`);
		row?.scrollIntoView({ block: 'nearest' });
	});

	// ---- helpers ----
	const current = (): Edit => ({
		value: area!.value,
		start: area!.selectionStart,
		end: area!.selectionEnd
	});
	const lineAt = (offset: number): number => value.slice(0, offset).split('\n').length - 1;
	function revealLine(line: number): void {
		frame?.querySelectorAll<HTMLElement>('.row')[line]?.scrollIntoView({ block: 'nearest' });
	}

	/** Write `next` to the script and put the selection back after the new text is drawn. */
	async function commit(next: Edit, kind: EditKind = 'other'): Promise<void> {
		history.record(next, kind, performance.now());
		lastEmitted = next.value;
		onchange(next.value);
		await tick();
		if (!area) return;
		area.setSelectionRange(next.start, next.end);
		sel = { start: next.start, end: next.end };
		revealLine(lineAt(next.end));
	}

	function restore(state: Edit | null): void {
		if (!state) return;
		completion = null;
		void commit(state, 'other');
	}
	const undo = (): void => {
		const state = history.undo();
		if (state) restore(state);
		announce(state ? 'Undone' : 'Nothing to undo');
	};
	const redo = (): void => {
		const state = history.redo();
		if (state) restore(state);
		announce(state ? 'Redone' : 'Nothing to redo');
	};
	function announce(text: string): void {
		// The same text twice in a row would not be read again.
		announcement = announcement === text ? `${text}.` : text;
	}

	function refreshCompletion(explicit = false): void {
		const c = area ? completionsAt(area.value, area.selectionEnd, explicit) : null;
		if (!c) {
			completion = null;
			return;
		}
		completion = { c, index: 0 };
		announce(
			`${c.items.length} suggestion${c.items.length === 1 ? '' : 's'}. ${c.items[0]!.name}: ${c.items[0]!.doc}`
		);
	}
	function accept(index: number): void {
		if (!completion) return;
		const next = acceptCompletion(area!.value, completion.c, completion.c.items[index]!);
		completion = null;
		void commit(next, 'other');
	}
	function move(step: number): void {
		if (!completion) return;
		const n = completion.c.items.length;
		const index = (completion.index + step + n) % n;
		completion = { ...completion, index };
		const item = completion.c.items[index]!;
		announce(`${item.name}: ${item.doc}`);
		queueMicrotask(() =>
			box
				?.querySelector(`#${CSS.escape(`${uid}-opt-${index}`)}`)
				?.scrollIntoView({ block: 'nearest' })
		);
	}

	/** Visual column of the caret on its line (a tab is drawn 4 wide). */
	function column(text: string, caret: number): number {
		const line = text.slice(text.lastIndexOf('\n', caret - 1) + 1, caret);
		let col = 0;
		for (const ch of line) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
		return col;
	}
	/** Where the suggestion list goes: under the caret, in the box's own coordinates. */
	const popup = $derived.by(() => {
		if (!completion || !box || !frame || !ruler) return null;
		void value;
		const row = frame.querySelectorAll<HTMLElement>('.row')[lineAt(completion.c.to)];
		if (!row) return null;
		const b = box.getBoundingClientRect();
		const r = row.getBoundingClientRect();
		const f = frame.getBoundingClientRect();
		const ch = ruler.getBoundingClientRect().width / 10;
		const code = frame.querySelector<HTMLElement>('.paint')!.getBoundingClientRect();
		const left = code.left + column(value, completion.c.to) * ch - b.left;
		return {
			top: Math.min(r.bottom, f.bottom) - b.top,
			left: Math.max(0, Math.min(left, b.width - 260))
		};
	});

	// ---- find ----
	function openFind(): void {
		const picked = area ? area.value.slice(area.selectionStart, area.selectionEnd) : '';
		find = {
			open: true,
			query: picked !== '' && !picked.includes('\n') ? picked : find.query,
			current: -1
		};
		void tick().then(() => {
			findInput?.focus();
			findInput?.select();
			jump(1, true);
		});
	}
	function closeFind(): void {
		find = { open: false, query: find.query, current: -1 };
		area?.focus();
	}
	/** Select the next or previous match in the textarea (without taking focus from the find box). */
	function jump(direction: 1 | -1, fromStart = false): void {
		const list = findAll(value, find.query);
		if (list.length === 0) {
			find = { ...find, current: -1 };
			return;
		}
		const from = fromStart || direction === -1 ? sel.start : sel.end;
		const i = stepMatch(list, from, direction);
		find = { ...find, current: i };
		const at = list[i]!;
		area?.setSelectionRange(at, at + find.query.length);
		sel = { start: at, end: at + find.query.length };
		revealLine(lineAt(at));
	}

	// ---- keys ----
	function onkeydown(e: KeyboardEvent): void {
		if (e.isComposing) return;
		const mod = e.ctrlKey || e.metaKey;
		if (completion) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				move(e.key === 'ArrowDown' ? 1 : -1);
				return;
			}
			if ((e.key === 'Enter' || e.key === 'Tab') && !mod && !e.shiftKey && !e.altKey) {
				e.preventDefault();
				accept(completion.index);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				completion = null;
				return;
			}
		}
		if (e.key === 'Escape') {
			// Escape belongs to the editor here (it is how Tab is told to leave); the flight page's
			// "open the menu" must not see it.
			e.stopPropagation();
			if (find.open) closeFind();
			else {
				tabLeaves = true;
				announce('Tab now moves focus out of the editor');
			}
			return;
		}
		if (e.key === 'Tab' && !mod && !e.altKey) {
			if (tabLeaves) {
				tabLeaves = false;
				return; // the browser moves the focus
			}
			e.preventDefault();
			void commit(e.shiftKey ? outdent(current()) : indent(current()));
			return;
		}
		if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Alt')
			tabLeaves = false;
		if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
			e.preventDefault();
			void commit(newline(current()));
			return;
		}
		if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
			return;
		}
		if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault();
			redo();
			return;
		}
		if (mod && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
			e.preventDefault();
			openFind();
			return;
		}
		if (e.ctrlKey && !e.altKey && e.key === ' ') {
			e.preventDefault();
			refreshCompletion(true);
		}
	}
	function onbeforeinput(e: InputEvent): void {
		if (e.isComposing) return;
		if (e.inputType === 'historyUndo') {
			e.preventDefault();
			undo();
		} else if (e.inputType === 'historyRedo') {
			e.preventDefault();
			redo();
		} else if (e.inputType === 'insertText' && e.data) {
			const next = closeBracket(current(), e.data);
			if (next) {
				e.preventDefault();
				void commit(next, 'type');
			}
		}
	}
	function oninput(e: Event): void {
		const ev = e as InputEvent;
		const next = current();
		const kind: EditKind = ev.inputType?.startsWith('delete')
			? 'delete'
			: ev.inputType === 'insertText'
				? 'type'
				: 'other';
		history.record(next, kind, performance.now());
		lastEmitted = next.value;
		sel = { start: next.start, end: next.end };
		onchange(next.value);
		if (ev.isComposing) return;
		if (ev.inputType === 'insertText' || ev.inputType === 'deleteContentBackward')
			refreshCompletion();
		else completion = null;
	}
	function track(): void {
		if (!area) return;
		sel = { start: area.selectionStart, end: area.selectionEnd };
	}
	function onclick(): void {
		track();
		completion = null;
	}
	function onfocus(): void {
		focused = true;
		track();
	}
	function onblur(): void {
		focused = false;
		tabLeaves = false;
		completion = null;
	}
	function onfindkey(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			jump(e.shiftKey ? -1 : 1);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			closeFind();
		}
	}
	function goToLine(line: number): void {
		if (!area) return;
		const starts = value.split('\n');
		let at = 0;
		for (let i = 0; i < line - 1; i++) at += starts[i]!.length + 1;
		area.focus();
		area.setSelectionRange(at, at + (starts[line - 1]?.length ?? 0));
		sel = { start: at, end: at + (starts[line - 1]?.length ?? 0) };
		revealLine(line - 1);
	}
</script>

<div class="editor" bind:this={box}>
	{#if find.open}
		<div class="find" role="search">
			<input
				bind:this={findInput}
				type="search"
				value={find.query}
				aria-label="Find in the script"
				placeholder="Find"
				spellcheck="false"
				oninput={(e) => {
					find = { ...find, query: e.currentTarget.value };
					jump(1, true);
				}}
				onkeydown={onfindkey}
			/>
			<span class="count" aria-live="polite">{findCount}</span>
			<button type="button" aria-label="Previous match" onclick={() => jump(-1)}>&#8593;</button>
			<button type="button" aria-label="Next match" onclick={() => jump(1)}>&#8595;</button>
			<button type="button" aria-label="Close find" onclick={closeFind}>&#10005;</button>
		</div>
	{/if}

	<div class="frame" bind:this={frame}>
		<div class="gutter" aria-hidden="true">
			{#each lines as _, i (i)}
				<span
					class="no"
					class:err={errorLine === i + 1}
					class:lint-error={problemLines.get(i + 1) === 'error'}
					class:lint-warning={problemLines.get(i + 1) === 'warning'}
					data-line={i + 1}>{i + 1}</span
				>
			{/each}
		</div>
		<div class="code" style:--cols={columns}>
			<span class="ruler" bind:this={ruler} aria-hidden="true">0000000000</span>
			<div class="paint" aria-hidden="true">
				{#each lines as line, i (i)}<div class="row" class:err={errorLine === i + 1}>
						{#each line as token, t (t)}<span
								class="{token.kind} {token.mark ? `m-${token.mark}` : ''}">{token.text}</span
							>{/each}{' '}
					</div>{/each}
			</div>
			<textarea
				bind:this={area}
				{value}
				{oninput}
				{onkeydown}
				{onbeforeinput}
				{onclick}
				{onfocus}
				{onblur}
				onkeyup={track}
				spellcheck="false"
				autocapitalize="off"
				autocomplete="off"
				wrap="off"
				rows={lines.length}
				{placeholder}
				aria-label={label}
				aria-invalid={errorLine !== null}
				aria-describedby="{uid}-hint"
				aria-autocomplete="list"
				aria-controls={completion ? `${uid}-list` : undefined}
				aria-activedescendant={completion ? `${uid}-opt-${completion.index}` : undefined}
			></textarea>
		</div>
	</div>

	{#if completion && popup}
		<ul
			class="list"
			id="{uid}-list"
			role="listbox"
			aria-label="Suggestions"
			style:top="{popup.top}px"
			style:left="{popup.left}px"
		>
			{#each completion.c.items as item, i (item.name)}
				<li
					id="{uid}-opt-{i}"
					role="option"
					aria-selected={i === completion.index}
					class:on={i === completion.index}
					onmousedown={(e) => {
						e.preventDefault();
						accept(i);
					}}
				>
					<span class="name">{item.name}</span>
					<span class="sig">{item.signature}</span>
					{#if i === completion.index}<span class="doc">{item.doc}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<p class="hint" id="{uid}-hint">
		Tab indents. Press Esc, then Tab, to leave the editor. Ctrl+F finds, Ctrl+Space suggests, Ctrl+Z
		undoes.
	</p>
	{#if problems.length > 0}
		<ul class="problems" aria-label="Problems in the script ({problems.length})">
			{#each problems.slice(0, 4) as p, i (i)}
				<li class={p.severity}>
					<button type="button" onclick={() => goToLine(p.line)}>Line {p.line}</button>
					{p.message}
				</li>
			{/each}
			{#if problems.length > 4}<li class="more">and {problems.length - 4} more</li>{/if}
		</ul>
	{/if}
	<div class="sr" role="status" aria-live="polite">{announcement}</div>
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

	.editor {
		position: relative;
	}
	.find {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		margin-bottom: var(--s-1);
	}
	.find input {
		flex: 1;
		min-width: 0;
		padding: 2px var(--s-2);
		font: inherit;
		font-size: var(--t-sm);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.find input:focus-visible,
	.find button:focus-visible,
	.problems button:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	.find button,
	.problems button {
		font: inherit;
		font-size: var(--t-xs);
		color: var(--text);
		cursor: pointer;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	.find button {
		min-width: 24px;
		padding: 1px 4px;
	}
	.count {
		min-width: 5em;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.ruler {
		position: absolute;
		visibility: hidden;
		white-space: pre;
	}
	.no.lint-error {
		color: var(--c-danger);
		text-decoration: underline wavy;
	}
	.no.lint-warning {
		color: var(--c-warning);
		text-decoration: underline wavy;
	}
	.m-bracket {
		background: rgb(92 207 255 / 0.28);
		outline: 1px solid rgb(92 207 255 / 0.7);
		border-radius: 2px;
	}
	.m-find {
		background: rgb(255 214 102 / 0.28);
	}
	.m-find-current {
		background: rgb(255 214 102 / 0.65);
		outline: 1px solid rgb(255 214 102);
	}
	.list {
		position: absolute;
		z-index: 5;
		min-width: 220px;
		max-width: 360px;
		max-height: 176px;
		margin: 0;
		padding: 2px;
		overflow: auto;
		list-style: none;
		font-size: var(--t-xs);
		background: var(--panel-solid);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.45);
	}
	.list li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0 var(--s-2);
		padding: 2px var(--s-2);
		cursor: pointer;
		border-radius: 3px;
	}
	.list li.on {
		background: rgb(92 207 255 / 0.2);
	}
	.list .name {
		font-weight: 600;
		color: var(--syn-api);
	}
	.list .sig {
		overflow: hidden;
		color: var(--text-dim);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list .doc {
		grid-column: 1 / -1;
		color: var(--text);
		font-family: var(--font-ui, inherit);
	}
	.hint {
		margin: var(--s-1) 0 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.problems {
		margin: var(--s-1) 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--t-xs);
	}
	.problems li {
		display: flex;
		gap: var(--s-2);
		align-items: baseline;
		padding: 1px 0;
	}
	.problems .error {
		color: var(--c-danger);
	}
	.problems .warning {
		color: var(--c-warning);
	}
	.problems .more {
		color: var(--text-dim);
	}
	.problems button {
		flex: none;
		padding: 0 4px;
		color: inherit;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
