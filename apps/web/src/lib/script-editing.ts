/**
 * What the script editor does with the keyboard, as pure functions on text and a selection (plan
 * 036): indentation, auto-indent, bracket matching, find, completions, undo history and a light
 * check for obvious mistakes. `hud/CodeEditor.svelte` owns the textarea and the key events and only
 * applies what these return. No dependency; the editor library that was weighed instead is in
 * `docs/research/scripting.md`.
 */
import { GLOBALS, SHIP, SHIP_NAMES, SHIP_WRITABLE, type ApiEntry } from './script-api';
import { highlight, scan, type Token, type TokenKind } from './script-highlight';

/** The text and the selection (`start <= end`; a caret has `start === end`). */
export interface Edit {
	value: string;
	start: number;
	end: number;
}

/** One level of indentation: a tab, as in the sample (the editor draws it 4 wide). */
export const INDENT = '\t';
/** Spaces an outdent may take away in place of a tab (a script pasted with space indentation). */
const OUTDENT_SPACES = 4;

const OPEN = '([{';
const CLOSE = ')]}';
const CLOSER_OF: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

const lineStartOf = (value: string, at: number): number => value.lastIndexOf('\n', at - 1) + 1;
const lineEndOf = (value: string, at: number): number => {
	const i = value.indexOf('\n', at);
	return i === -1 ? value.length : i;
};

/** The source with everything that is not code (strings, comments) replaced by spaces; newlines stay. */
export function codeOnly(value: string): string {
	let out = '';
	const lines = highlight(value);
	lines.forEach((line, i) => {
		if (i > 0) out += '\n';
		for (const token of line) {
			out +=
				token.kind === 'string' || token.kind === 'comment'
					? ' '.repeat(token.text.length)
					: token.text;
		}
	});
	return out;
}

// ---- Tab, Shift+Tab, Enter, closing brackets ------------------------------------------------

/** Lines (start offsets) a selection touches; a selection ending at the start of a line leaves that line out. */
function touchedLines(value: string, start: number, end: number): number[] {
	const starts: number[] = [];
	let at = lineStartOf(value, start);
	const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
	for (;;) {
		starts.push(at);
		const next = value.indexOf('\n', at);
		if (next === -1 || next >= last) break;
		at = next + 1;
	}
	return starts;
}

/** Tab: indent every touched line of a multi-line selection, else put one indent where the caret is. */
export function indent(edit: Edit): Edit {
	const { value, start, end } = edit;
	if (!value.slice(start, end).includes('\n')) {
		const at = start + INDENT.length;
		return { value: value.slice(0, start) + INDENT + value.slice(end), start: at, end: at };
	}
	// Blank lines stay blank.
	const starts = touchedLines(value, start, end).filter(
		(s) => value[s] !== '\n' && s < value.length
	);
	let out = '';
	let from = 0;
	for (const s of starts) {
		out += value.slice(from, s) + INDENT;
		from = s;
	}
	out += value.slice(from);
	const before = (pos: number): number => starts.filter((s) => s < pos).length * INDENT.length;
	return { value: out, start: start + before(start), end: end + before(end) };
}

/** Shift+Tab: take one level off every touched line (a tab, or up to four spaces). */
export function outdent(edit: Edit): Edit {
	const { value, start, end } = edit;
	const cuts = touchedLines(value, start, end).map((s) => {
		let take = 0;
		if (value[s] === '\t') take = 1;
		else while (take < OUTDENT_SPACES && value[s + take] === ' ') take += 1;
		return { s, take };
	});
	let out = '';
	let from = 0;
	for (const { s, take } of cuts) {
		out += value.slice(from, s);
		from = s + take;
	}
	out += value.slice(from);
	// A position moves back by what was cut before it (cut text it sat inside counts only up to it).
	const shift = (pos: number): number =>
		cuts.reduce((sum, { s, take }) => sum + Math.min(take, Math.max(0, pos - s)), 0);
	return { value: out, start: start - shift(start), end: end - shift(end) };
}

const isCodeAt = (mask: string, i: number): boolean => i >= 0 && i < mask.length && mask[i] !== ' ';

/**
 * Enter: a new line with the indentation of the current one, one level deeper after an opening
 * bracket, and between `{` and `}` an empty indented line with the closer below it.
 */
export function newline(edit: Edit): Edit {
	const { value, start, end } = edit;
	const lineStart = lineStartOf(value, start);
	let indentEnd = lineStart;
	while (indentEnd < start && (value[indentEnd] === ' ' || value[indentEnd] === '\t'))
		indentEnd += 1;
	const base = value.slice(lineStart, indentEnd);
	// The last non-blank character before the caret on this line decides whether to go deeper.
	let before = start - 1;
	while (before >= lineStart && (value[before] === ' ' || value[before] === '\t')) before -= 1;
	const mask = codeOnly(value);
	const opener =
		before >= lineStart && OPEN.includes(value[before]!) && isCodeAt(mask, before)
			? value[before]!
			: '';
	const after = value[end];
	const between = opener !== '' && before === start - 1 && after === CLOSER_OF[opener];
	const inner = opener === '' ? base : base + INDENT;
	const insert = between ? `\n${inner}\n${base}` : `\n${inner}`;
	const caret = start + 1 + inner.length;
	return { value: value.slice(0, start) + insert + value.slice(end), start: caret, end: caret };
}

/**
 * Typing a closing bracket on a line that holds only indentation takes one level off first, so the
 * `}` after an auto-indented body lines up with its opener. Null when nothing special applies.
 */
export function closeBracket(edit: Edit, typed: string): Edit | null {
	if (!CLOSE.includes(typed) || edit.start !== edit.end) return null;
	const { value, start } = edit;
	const lineStart = lineStartOf(value, start);
	const lead = value.slice(lineStart, start);
	if (lead === '' || !/^[ \t]+$/.test(lead)) return null;
	const cut = lead.endsWith('\t')
		? 1
		: Math.min(OUTDENT_SPACES, lead.length - lead.trimEnd().length);
	const at = start - cut;
	return { value: value.slice(0, at) + typed + value.slice(start), start: at + 1, end: at + 1 };
}

// ---- Brackets ---------------------------------------------------------------------------------

/** The bracket next to the caret and its partner, as offsets; null if there is none or it has no partner. */
export function matchBracket(value: string, caret: number): { a: number; b: number } | null {
	const mask = codeOnly(value);
	const at = [caret - 1, caret].find(
		(i) => i >= 0 && i < mask.length && '()[]{}'.includes(mask[i]!) && mask[i] !== ' '
	);
	if (at === undefined) return null;
	const ch = mask[at]!;
	const opening = OPEN.includes(ch);
	const partner = opening ? CLOSER_OF[ch]! : OPEN[CLOSE.indexOf(ch)]!;
	let depth = 0;
	for (let i = at; opening ? i < mask.length : i >= 0; i += opening ? 1 : -1) {
		if (mask[i] === ch) depth += 1;
		else if (mask[i] === partner) {
			depth -= 1;
			if (depth === 0) return { a: Math.min(at, i), b: Math.max(at, i) };
		}
	}
	return null;
}

// ---- Marks on the painted layer ---------------------------------------------------------------

export type MarkKind = 'bracket' | 'find' | 'find-current';
export interface Mark {
	from: number;
	to: number;
	kind: MarkKind;
}
export interface PaintToken {
	kind: TokenKind;
	text: string;
	mark?: MarkKind;
}

/** Split the tokens of `highlight` where marks begin and end, so each marked stretch is its own token. */
export function applyMarks(
	lines: readonly (readonly Token[])[],
	marks: readonly Mark[]
): PaintToken[][] {
	const priority: MarkKind[] = ['find-current', 'bracket', 'find'];
	let offset = 0;
	return lines.map((line) => {
		const out: PaintToken[] = [];
		for (const token of line) {
			const from = offset;
			const to = from + token.text.length;
			offset = to;
			const cuts = new Set([from, to]);
			for (const m of marks) {
				if (m.from > from && m.from < to) cuts.add(m.from);
				if (m.to > from && m.to < to) cuts.add(m.to);
			}
			const points = [...cuts].sort((a, b) => a - b);
			for (let k = 0; k + 1 < points.length; k++) {
				const a = points[k]!;
				const b = points[k + 1]!;
				const covering = marks.filter((m) => m.from <= a && m.to >= b).map((m) => m.kind);
				const mark = priority.find((kind) => covering.includes(kind));
				out.push({
					kind: token.kind,
					text: token.text.slice(a - from, b - from),
					...(mark ? { mark } : {})
				});
			}
		}
		offset += 1; // the newline
		return out;
	});
}

// ---- Find --------------------------------------------------------------------------------------

/** Start offsets of every non-overlapping occurrence of `query` (case-insensitive unless asked). */
export function findAll(value: string, query: string, matchCase = false): number[] {
	if (query === '') return [];
	const hay = matchCase ? value : value.toLowerCase();
	const needle = matchCase ? query : query.toLowerCase();
	const out: number[] = [];
	for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length))
		out.push(i);
	return out;
}

/** Index in `matches` of the first match at or after `from` (wrapping), or the one before it going backwards; -1 without matches. */
export function stepMatch(matches: readonly number[], from: number, direction: 1 | -1): number {
	if (matches.length === 0) return -1;
	if (direction === 1) {
		const i = matches.findIndex((m) => m >= from);
		return i === -1 ? 0 : i;
	}
	for (let i = matches.length - 1; i >= 0; i--) if (matches[i]! < from) return i;
	return matches.length - 1;
}

// ---- Completions --------------------------------------------------------------------------------

export interface Completions {
	/** Replace `value.slice(from, to)` with the chosen name. */
	from: number;
	to: number;
	items: ApiEntry[];
}

const IDENT = /[A-Za-z0-9_$]/;
const MAX_ITEMS = 40;

/**
 * What the API offers at the caret: the globals for a word being typed, the members of `ship`
 * after `ship.`. Nothing inside a string or comment, after a digit, or for any other receiver.
 * `explicit` (Ctrl+Space) also offers at an empty prefix.
 */
export function completionsAt(value: string, caret: number, explicit = false): Completions | null {
	const mask = codeOnly(value);
	let from = caret;
	while (from > 0 && IDENT.test(value[from - 1]!)) from -= 1;
	const prefix = value.slice(from, caret);
	if (/^[0-9]/.test(prefix)) return null;
	if (
		caret > 0 &&
		caret <= mask.length &&
		mask[caret - 1] === ' ' &&
		value[caret - 1] !== ' ' &&
		value[caret - 1] !== '\t' &&
		value[caret - 1] !== '\n'
	) {
		return null; // inside a string or comment
	}
	const lower = prefix.toLowerCase();
	const pick = (table: readonly ApiEntry[]): ApiEntry[] => {
		const starts = table.filter((e) => e.name.toLowerCase().startsWith(lower));
		const items = starts.slice(0, MAX_ITEMS);
		// A finished word with nothing else to offer is not a suggestion.
		return items.length === 1 && items[0]!.name === prefix ? [] : items;
	};
	let dot = from - 1;
	while (dot >= 0 && (value[dot] === ' ' || value[dot] === '\t')) dot -= 1;
	if (dot >= 0 && value[dot] === '.' && isCodeAt(mask, dot)) {
		let r = dot - 1;
		while (r >= 0 && (value[r] === ' ' || value[r] === '\t')) r -= 1;
		let rs = r + 1;
		while (rs > 0 && IDENT.test(value[rs - 1]!)) rs -= 1;
		const receiver = value.slice(rs, r + 1);
		const beforeReceiver = rs > 0 ? value[rs - 1] : '';
		if (receiver !== 'ship' || beforeReceiver === '.') return null;
		const items = pick(SHIP);
		return items.length === 0 ? null : { from, to: caret, items };
	}
	// A word starts offering at its second letter: one letter would pop up on every identifier.
	if (prefix.length < 2 && !explicit) return null;
	const items = pick(GLOBALS);
	return items.length === 0 ? null : { from, to: caret, items };
}

/** The text after choosing `entry`. */
export function acceptCompletion(value: string, c: Completions, entry: ApiEntry): Edit {
	const at = c.from + entry.name.length;
	return { value: value.slice(0, c.from) + entry.name + value.slice(c.to), start: at, end: at };
}

// ---- Undo and redo -----------------------------------------------------------------------------

export type EditKind = 'type' | 'delete' | 'other';

/**
 * Our own undo stack. The textarea's native one is lost whenever the script sets `value` (every
 * indent, auto-indent and completion does), so all editing goes through this one and the native
 * undo is intercepted. Typing and deleting runs are merged until a pause or a change of kind.
 */
export interface History {
	record(state: Edit, kind: EditKind, now: number): void;
	undo(): Edit | null;
	redo(): Edit | null;
	/** Forget everything and start from `state` (the script was replaced from outside). */
	reset(state: Edit): void;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
}

const MERGE_MS = 1000;
const MAX_STATES = 300;

export function createHistory(initial: Edit): History {
	let states: Edit[] = [initial];
	let at = 0;
	let lastKind: EditKind = 'other';
	let lastTime = 0;
	return {
		record(state, kind, now) {
			const current = states[at]!;
			if (state.value === current.value) {
				states[at] = state; // only the selection moved
				return;
			}
			const merge =
				kind !== 'other' &&
				kind === lastKind &&
				now - lastTime < MERGE_MS &&
				at === states.length - 1 &&
				at > 0;
			if (merge) states[at] = state;
			else {
				states = states.slice(0, at + 1);
				states.push(state);
				if (states.length > MAX_STATES) states.shift();
				at = states.length - 1;
			}
			lastKind = kind;
			lastTime = now;
		},
		undo() {
			if (at === 0) return null;
			lastKind = 'other';
			at -= 1;
			return states[at]!;
		},
		redo() {
			if (at >= states.length - 1) return null;
			lastKind = 'other';
			at += 1;
			return states[at]!;
		},
		reset(state) {
			states = [state];
			at = 0;
			lastKind = 'other';
		},
		get canUndo() {
			return at > 0;
		},
		get canRedo() {
			return at < states.length - 1;
		}
	};
}

// ---- A light check for obvious mistakes ----------------------------------------------------------

export interface Problem {
	/** 1-based. */
	line: number;
	severity: 'error' | 'warning';
	message: string;
}

const lineOf = (value: string, offset: number): number => {
	let n = 1;
	for (let i = value.indexOf('\n'); i !== -1 && i < offset; i = value.indexOf('\n', i + 1)) n += 1;
	return n;
};

function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0]!;
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = row[j]!;
			row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = tmp;
		}
	}
	return row[b.length]!;
}

/** The closest known `ship` member to a misspelt one, when it is close enough to be a typo. */
export function didYouMean(name: string): string | null {
	let best: string | null = null;
	let bestD = 3;
	for (const known of SHIP_NAMES) {
		const d = distance(name.toLowerCase(), known.toLowerCase());
		if (d < bestD) {
			bestD = d;
			best = known;
		}
	}
	return best;
}

/**
 * Mistakes a player would want to hear about before pressing Run: brackets that do not pair,
 * unterminated strings and comments, `ship.<name>` that is not in the API (with the nearest name),
 * assignment to a read-only `ship` member, and `wait()`, `waitUntil()` or `nextTick()` without
 * `await`. It is not a parser: the engine's own error, with its line, still decides.
 */
export function lint(value: string): Problem[] {
	const problems: Problem[] = [];
	// Unterminated strings and comments
	let at = 0;
	for (const t of scan(value)) {
		if (!t.closed) {
			const line = lineOf(value, at);
			if (t.kind === 'string') {
				const q = t.text[0]!;
				problems.push({
					line,
					severity: 'error',
					message: `This string is never closed (missing ${q}).`
				});
			} else {
				problems.push({
					line,
					severity: 'warning',
					message: 'This comment is never closed (missing */).'
				});
			}
		}
		at += t.text.length;
	}
	// Brackets
	const mask = codeOnly(value);
	const stack: Array<{ ch: string; at: number }> = [];
	for (let i = 0; i < mask.length; i++) {
		const ch = mask[i]!;
		if (OPEN.includes(ch)) stack.push({ ch, at: i });
		else if (CLOSE.includes(ch)) {
			const top = stack.pop();
			if (!top)
				problems.push({
					line: lineOf(value, i),
					severity: 'error',
					message: `Unexpected ${ch}: nothing is open.`
				});
			else if (CLOSER_OF[top.ch] !== ch) {
				problems.push({
					line: lineOf(value, i),
					severity: 'error',
					message: `Found ${ch} where ${CLOSER_OF[top.ch]} was expected to close the ${top.ch} on line ${lineOf(value, top.at)}.`
				});
			}
		}
	}
	for (const open of stack) {
		problems.push({
			line: lineOf(value, open.at),
			severity: 'error',
			message: `The ${open.ch} on this line is never closed.`
		});
	}
	// `ship.<member>`
	const member = /(?<![.\w$])ship\s*\.\s*([A-Za-z_$][\w$]*)(\s*=(?![=>]))?/g;
	for (let m = member.exec(mask); m; m = member.exec(mask)) {
		const name = m[1]!;
		const line = lineOf(value, m.index);
		if (!SHIP_NAMES.has(name)) {
			const near = didYouMean(name);
			problems.push({
				line,
				severity: 'warning',
				message: `ship.${name} is not part of the script API${near ? `; did you mean ship.${near}?` : '.'}`
			});
		} else if (m[2] !== undefined && !SHIP_WRITABLE.has(name)) {
			problems.push({
				line,
				severity: 'error',
				message: `ship.${name} is read-only; only ${[...SHIP_WRITABLE].map((n) => `ship.${n}`).join(', ')} can be set.`
			});
		}
	}
	// Waiting without await
	const bare = /(^|[;{}\n])[ \t]*(wait|waitUntil|nextTick)\s*\(/g;
	for (let m = bare.exec(mask); m; m = bare.exec(mask)) {
		const at = m.index + m[0].indexOf(m[2]!);
		problems.push({
			line: lineOf(value, at),
			severity: 'warning',
			message: `${m[2]}() does nothing unless you await it: await ${m[2]}(...).`
		});
	}
	problems.sort((a, b) => a.line - b.line);
	return problems.slice(0, 20);
}
