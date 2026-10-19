<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { highlight } from '../script-highlight';
	import {
		autoClose,
		deletePair,
		duplicateLines,
		lineRange,
		moveLines,
		parseLineNumber,
		replaceAll,
		replaceAt,
		toggleComment
	} from '../script-editing-commands';
	import { isModifierKey, keyAction, type KeyAction } from '../script-editing-keys';
	import { loadEditorOptions, saveEditorOptions } from '../editor-options';
	import type { SyntaxProblem } from '../script-checker';
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
		type Mark,
		type Problem
	} from '../script-editing';

	let {
		value,
		errorLine = null,
		placeholder = '',
		label,
		check,
		onchange
	}: {
		value: string;
		/** 1-based line to mark as the one the last error points at. */
		errorLine?: number | null;
		placeholder?: string;
		label: string;
		/**
		 * Compile `text` in the sandbox and give the engine's syntax error (plan 058); `null` for none,
		 * `undefined` when there is no answer. Absent: only the light check runs.
		 */
		check?: (text: string) => Promise<SyntaxProblem | null | undefined>;
		onchange: (text: string) => void;
	} = $props();

	/** Pause after the last change before the script is sent to be compiled, ms. */
	const CHECK_DELAY_MS = 500;

	const uid = $props.id();
	let frame = $state<HTMLDivElement>();
	let box = $state<HTMLDivElement>();
	let area = $state<HTMLTextAreaElement>();
	let findInput = $state<HTMLInputElement>();
	let replaceInput = $state<HTMLInputElement>();
	let ruler = $state<HTMLSpanElement>();

	/** The selection as of the last key, click or input; the caret is its end. */
	let sel = $state({ start: 0, end: 0 });
	let focused = $state(false);
	let completion = $state<{ c: Completions; index: number } | null>(null);
	let find = $state({
		open: false,
		query: '',
		replacement: '',
		matchCase: false,
		wholeWord: false,
		current: -1
	});
	let goto = $state({ open: false, text: '', problem: '' });
	let gotoInput = $state<HTMLInputElement>();
	let options = $state(loadEditorOptions());
	/** Between compositionstart and compositionend: the input method owns the keys. */
	let composing = false;
	/** The engine's own syntax error for the script as it was last checked (plan 058). */
	let engineProblem = $state<{ line: number; message: string } | null>(null);
	/** A touch screen as the main pointer: the on-screen keys are shown. */
	let coarse = $state(false);
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
	const findOptions = $derived({ matchCase: find.matchCase, wholeWord: find.wholeWord });
	const matches = $derived(findAll(value, find.open ? find.query : '', findOptions));
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
	const lintProblems = $derived(lint(value));
	/** The engine's error stands in for the light check's structural guesses, and sorts among the rest. */
	const problems = $derived.by((): Problem[] => {
		if (!engineProblem) return lintProblems;
		const engine: Problem = {
			line: Math.min(engineProblem.line, value.split('\n').length),
			severity: 'error',
			message: `Syntax error: ${engineProblem.message}`
		};
		return [engine, ...lintProblems.filter((p) => !p.syntax)].sort((a, b) => a.line - b.line);
	});
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

	// The syntax check: a short pause after the last change, then the sandbox compiles the script.
	$effect(() => {
		const text = value;
		if (!check) return;
		if (text.trim() === '') {
			engineProblem = null;
			return;
		}
		const timer = setTimeout(() => {
			void check(text).then((answer) => {
				// A newer edit has made this answer stale; the next check follows it.
				if (answer === undefined || untrack(() => value) !== text) return;
				const before = untrack(() => engineProblem);
				if (answer === null) {
					engineProblem = null;
					return;
				}
				engineProblem = { line: answer.line ?? 1, message: answer.message };
				if (before?.line !== engineProblem.line || before.message !== engineProblem.message)
					announce(`Syntax error on line ${engineProblem.line}: ${answer.message}`);
			});
		}, CHECK_DELAY_MS);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const query = matchMedia('(pointer: coarse)');
		coarse = query.matches;
		const change = (e: MediaQueryListEvent): void => {
			coarse = e.matches;
		};
		query.addEventListener('change', change);
		return () => query.removeEventListener('change', change);
	});

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

	// ---- find, replace, go to line ----
	function openFind(): void {
		const picked = area ? area.value.slice(area.selectionStart, area.selectionEnd) : '';
		goto.open = false;
		find = {
			...find,
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
		find = { ...find, open: false, current: -1 };
		area?.focus();
	}
	/** Select the next or previous match in the textarea (without taking focus from the find box). */
	function jump(direction: 1 | -1, fromStart = false): void {
		const list = findAll(value, find.query, findOptions);
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
	/**
	 * Run a find-bar button's action and put the focus back in the find field: Safari does not focus a
	 * button that was clicked, so without this Escape would no longer reach the bar.
	 */
	function stayInFind(action: () => void): void {
		action();
		findInput?.focus();
	}
	function toggleFindOption(name: 'matchCase' | 'wholeWord'): void {
		find = { ...find, [name]: !find[name], current: -1 };
		void tick().then(() => jump(1, true));
	}
	/** Replace the match that is selected, or select the first one if none is yet. */
	async function replaceCurrent(): Promise<void> {
		const list = findAll(value, find.query, findOptions);
		if (list.length === 0) {
			announce('No matches');
			return;
		}
		const at = list[find.current];
		if (at === undefined || sel.start !== at || sel.end !== at + find.query.length) {
			jump(1);
			return;
		}
		await commit(replaceAt(value, at, find.query.length, find.replacement));
		jump(1);
		announce(`Replaced. ${findAll(value, find.query, findOptions).length} left`);
	}
	async function replaceEvery(): Promise<void> {
		const list = findAll(value, find.query, findOptions);
		if (list.length === 0) {
			announce('No matches');
			return;
		}
		find = { ...find, current: -1 };
		await commit(replaceAll(value, list, find.query.length, find.replacement));
		announce(`Replaced ${list.length} match${list.length === 1 ? '' : 'es'}`);
	}
	function openGoto(): void {
		find = { ...find, open: false, current: -1 };
		goto = { open: true, text: '', problem: '' };
		void tick().then(() => gotoInput?.focus());
	}
	function closeGoto(): void {
		goto = { ...goto, open: false, problem: '' };
		area?.focus();
	}
	function submitGoto(): void {
		const count = value.split('\n').length;
		const wanted = parseLineNumber(goto.text);
		if (wanted === null) {
			goto = { ...goto, problem: `Type a line number from 1 to ${count}.` };
			return;
		}
		const range = lineRange(value, wanted);
		goto = { open: false, text: '', problem: '' };
		area?.focus();
		area?.setSelectionRange(range.start, range.end);
		sel = { start: range.start, end: range.end };
		revealLine(range.line - 1);
		announce(`Line ${range.line}`);
	}

	// ---- keys ----
	/** Do what a key (or an on-screen key) means. Returns false when the action does not apply. */
	function perform(action: KeyAction): void {
		switch (action) {
			case 'completion-next':
			case 'completion-previous':
				move(action === 'completion-next' ? 1 : -1);
				return;
			case 'completion-accept':
				if (completion) accept(completion.index);
				return;
			case 'completion-close':
				completion = null;
				return;
			case 'find-close':
				closeFind();
				return;
			case 'tab-leaves':
				tabLeaves = true;
				announce('Tab now moves focus out of the editor');
				return;
			case 'tab-leave':
				tabLeaves = false;
				return;
			case 'indent':
				void commit(indent(current()));
				return;
			case 'outdent':
				void commit(outdent(current()));
				return;
			case 'newline':
				void commit(newline(current()));
				return;
			case 'undo':
				undo();
				return;
			case 'redo':
				redo();
				return;
			case 'find':
				openFind();
				return;
			case 'go-to-line':
				openGoto();
				return;
			case 'suggest':
				refreshCompletion(true);
				return;
			case 'toggle-comment':
				void commit(toggleComment(current()));
				return;
			case 'move-up':
			case 'move-down': {
				const next = moveLines(current(), action === 'move-up' ? -1 : 1);
				if (next) void commit(next);
				return;
			}
			case 'duplicate-up':
			case 'duplicate-down':
				void commit(duplicateLines(current(), action === 'duplicate-up' ? -1 : 1));
				return;
		}
	}
	function onkeydown(e: KeyboardEvent): void {
		const action = keyAction(e, {
			composing,
			completionOpen: completion !== null,
			tabLeaves,
			findOpen: find.open
		});
		if (action === null) {
			// Escape belongs to an input method that is composing, not to the pause menu.
			if (e.key === 'Escape') e.stopPropagation();
			if (!isModifierKey(e.key) && !composing && !e.isComposing) tabLeaves = false;
			return;
		}
		if (action === 'tab-leave') {
			tabLeaves = false;
			return; // the browser moves the focus
		}
		// Escape belongs to the editor here (it is how Tab is told to leave, or how a list or the
		// find bar is closed); the flight page's "open the menu" must not see it.
		if (e.key === 'Escape') e.stopPropagation();
		if (action !== 'tab-leaves') {
			e.preventDefault();
			if (!isModifierKey(e.key)) tabLeaves = false;
		}
		perform(action);
	}
	/** An on-screen key: keep the textarea focused and do what the key does. */
	function press(action: KeyAction, e: Event): void {
		e.preventDefault();
		area?.focus({ preventScroll: true });
		perform(action);
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
			const edit = current();
			const next =
				(options.autoClose ? autoClose(edit, e.data) : null) ?? closeBracket(edit, e.data);
			if (next) {
				e.preventDefault();
				void commit(next, 'type');
			}
		} else if (options.autoClose && e.inputType === 'deleteContentBackward') {
			const next = deletePair(current());
			if (next) {
				e.preventDefault();
				void commit(next, 'delete');
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
		composing = false;
		tabLeaves = false;
		completion = null;
	}
	function onfindkey(e: KeyboardEvent): void {
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			jump(e.shiftKey ? -1 : 1);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			closeFind();
		}
	}
	/** Escape from any control of the find or go-to bar (a button after Replace all, say) closes it. */
	function onbarkey(e: KeyboardEvent): void {
		if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		e.stopPropagation();
		if (goto.open) closeGoto();
		else closeFind();
	}
	function onreplacekey(e: KeyboardEvent): void {
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			void replaceCurrent();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			closeFind();
		}
	}
	function ongotokey(e: KeyboardEvent): void {
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			submitGoto();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			closeGoto();
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
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- Escape closes the bar from any of its controls, not only from the text fields -->
		<div class="find" role="search" onkeydown={onbarkey}>
			<div class="line">
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
				<button type="button" aria-label="Previous match" onclick={() => stayInFind(() => jump(-1))}
					>&#8593;</button
				>
				<button type="button" aria-label="Next match" onclick={() => stayInFind(() => jump(1))}
					>&#8595;</button
				>
				<button
					type="button"
					aria-label="Match case"
					aria-pressed={find.matchCase}
					title="Match case"
					onclick={() => stayInFind(() => toggleFindOption('matchCase'))}>Aa</button
				>
				<button
					type="button"
					aria-label="Whole word"
					aria-pressed={find.wholeWord}
					title="Whole word"
					onclick={() => stayInFind(() => toggleFindOption('wholeWord'))}>ab</button
				>
				<button type="button" aria-label="Close find" onclick={closeFind}>&#10005;</button>
			</div>
			<div class="line">
				<input
					bind:this={replaceInput}
					type="text"
					value={find.replacement}
					aria-label="Replace with"
					placeholder="Replace with"
					spellcheck="false"
					oninput={(e) => (find = { ...find, replacement: e.currentTarget.value })}
					onkeydown={onreplacekey}
				/>
				<button
					type="button"
					class="word"
					onclick={() => void replaceCurrent().then(() => replaceInput?.focus())}>Replace</button
				>
				<button
					type="button"
					class="word"
					onclick={() => void replaceEvery().then(() => replaceInput?.focus())}>Replace all</button
				>
			</div>
		</div>
	{/if}
	{#if goto.open}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- Escape closes the bar from any of its controls, not only from the text field -->
		<div class="find" role="search" onkeydown={onbarkey}>
			<div class="line">
				<input
					bind:this={gotoInput}
					type="text"
					inputmode="numeric"
					value={goto.text}
					aria-label="Go to line"
					aria-describedby={goto.problem ? `${uid}-goto-problem` : undefined}
					aria-invalid={goto.problem !== ''}
					placeholder="Line number"
					spellcheck="false"
					oninput={(e) => (goto = { ...goto, text: e.currentTarget.value, problem: '' })}
					onkeydown={ongotokey}
				/>
				<button type="button" class="word" onclick={submitGoto}>Go</button>
				<button type="button" aria-label="Close go to line" onclick={closeGoto}>&#10005;</button>
			</div>
			{#if goto.problem}<p class="goto-problem" id="{uid}-goto-problem" role="alert">
					{goto.problem}
				</p>{/if}
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
				oncompositionstart={() => (composing = true)}
				oncompositionend={() => (composing = false)}
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

	{#if coarse}
		<div class="touchbar" role="toolbar" aria-label="Editor keys">
			{#each [['Tab', 'indent'], ['Shift+Tab', 'outdent'], ['Undo', 'undo'], ['Redo', 'redo'], ['Suggest', 'suggest']] as const as [name, action] (action)}
				<button
					type="button"
					aria-label={action === 'indent'
						? 'Indent (Tab)'
						: action === 'outdent'
							? 'Outdent (Shift+Tab)'
							: name}
					onpointerdown={(e) => e.preventDefault()}
					onmousedown={(e) => e.preventDefault()}
					onclick={(e) => press(action, e)}>{name}</button
				>
			{/each}
		</div>
	{/if}

	<p class="hint" id="{uid}-hint">
		Tab indents. Press Esc, then Tab, to leave the editor. Ctrl+F finds, Ctrl+Space or Ctrl+I
		suggests, Ctrl+Z undoes.
	</p>
	<details class="keys">
		<summary>More editor keys and options</summary>
		<ul>
			<li><kbd>Ctrl+G</kbd> go to a line</li>
			<li><kbd>Ctrl+/</kbd> comment or uncomment the lines</li>
			<li><kbd>Alt+Up</kbd> / <kbd>Alt+Down</kbd> move the lines</li>
			<li><kbd>Shift+Alt+Up</kbd> / <kbd>Shift+Alt+Down</kbd> copy the lines</li>
			<li>
				On a Mac, Cmd works in place of Ctrl; Ctrl+Space switches input sources there, so use <kbd
					>Cmd+I</kbd
				> to suggest.
			</li>
		</ul>
		<label class="option">
			<input
				type="checkbox"
				checked={options.autoClose}
				onchange={(e) => {
					options = { ...options, autoClose: e.currentTarget.checked };
					saveEditorOptions(options);
				}}
			/>
			Close brackets and quotes for me
		</label>
	</details>
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
		font-family: var(--font-mono);
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
		background: color-mix(in srgb, var(--code-select) 32%, transparent);
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
		flex-direction: column;
		gap: var(--s-1);
		margin-bottom: var(--s-1);
	}
	.find .line {
		display: flex;
		align-items: center;
		gap: var(--s-1);
	}
	.find button[aria-pressed='true'] {
		background: color-mix(in srgb, var(--code-select) 25%, transparent);
		border-color: var(--c-accent);
	}
	.find button.word {
		padding: 1px var(--s-2);
		white-space: nowrap;
	}
	.goto-problem {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--c-danger);
	}
	.touchbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1);
		margin-top: var(--s-1);
	}
	.touchbar button {
		min-width: 44px;
		min-height: 44px;
		padding: 0 var(--s-2);
		font: inherit;
		font-size: var(--t-sm);
		color: var(--text);
		cursor: pointer;
		background: transparent;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.touchbar button:focus-visible,
	.option input:focus-visible,
	.keys summary:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	.keys {
		margin-top: var(--s-1);
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.keys ul {
		margin: var(--s-1) 0;
		padding-left: var(--s-4);
	}
	.keys kbd {
		font-family: var(--font-mono);
		color: var(--text);
	}
	.option {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		cursor: pointer;
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
		background: color-mix(in srgb, var(--code-select) 28%, transparent);
		outline: 1px solid color-mix(in srgb, var(--code-select) 70%, transparent);
		border-radius: 2px;
	}
	.m-find {
		background: color-mix(in srgb, var(--code-match) 28%, transparent);
	}
	.m-find-current {
		background: color-mix(in srgb, var(--code-match) 65%, transparent);
		outline: 1px solid var(--code-match);
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
		box-shadow: 0 6px 18px var(--surface-scrim);
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
		background: color-mix(in srgb, var(--code-select) 20%, transparent);
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
