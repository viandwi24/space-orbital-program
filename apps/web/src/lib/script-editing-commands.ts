/**
 * Editing commands added by plan 058, as pure functions on text and a selection like the rest of
 * `script-editing.ts`: replace, go to line, comment toggling, moving and duplicating lines, and the
 * optional auto-closing of brackets and quotes. `hud/CodeEditor.svelte` applies what they return.
 */
import { codeOnly, isCodeAt, lineEndOf, touchedLines, type Edit } from './script-editing';
import { scan } from './script-highlight';

// ---- Replace -------------------------------------------------------------------------------------

/** Replace `length` characters at `at`; the caret ends after the new text. */
export function replaceAt(value: string, at: number, length: number, text: string): Edit {
	const caret = at + text.length;
	return { value: value.slice(0, at) + text + value.slice(at + length), start: caret, end: caret };
}

/** Replace every match (offsets from `findAll`, all of `length`); the selection covers the first replacement. */
export function replaceAll(
	value: string,
	matches: readonly number[],
	length: number,
	text: string
): Edit {
	let out = '';
	let from = 0;
	for (const at of matches) {
		out += value.slice(from, at) + text;
		from = at + length;
	}
	out += value.slice(from);
	const first = matches[0] ?? 0;
	return { value: out, start: first, end: first + (matches.length > 0 ? text.length : 0) };
}

// ---- Go to line ----------------------------------------------------------------------------------

/** A 1-based line number typed by the player ("12", " 12 "); null for anything else. */
export function parseLineNumber(text: string): number | null {
	const t = text.trim();
	if (!/^[0-9]{1,6}$/.test(t)) return null;
	const n = Number(t);
	return n >= 1 ? n : null;
}

/** Offsets of line `line` (1-based, clamped to the last line) without its newline. */
export function lineRange(
	value: string,
	line: number
): { start: number; end: number; line: number } {
	const count = value.split('\n').length;
	const wanted = Math.min(Math.max(1, Math.floor(line)), count);
	let start = 0;
	for (let i = 1; i < wanted; i++) start = value.indexOf('\n', start) + 1;
	return { start, end: lineEndOf(value, start), line: wanted };
}

// ---- Lines ---------------------------------------------------------------------------------------

/** The 0-based first and last line a selection touches (a selection ending at a line start leaves that line out). */
function touchedRange(edit: Edit): { first: number; last: number } {
	const starts = touchedLines(edit.value, edit.start, edit.end);
	const first = edit.value.slice(0, starts[0]!).split('\n').length - 1;
	return { first, last: first + starts.length - 1 };
}

interface Splice {
	from: number;
	to: number;
	text: string;
}

/** Apply sorted, non-overlapping splices and carry the selection along. */
function splice(edit: Edit, splices: readonly Splice[]): Edit {
	let out = '';
	let from = 0;
	for (const s of splices) {
		out += edit.value.slice(from, s.from) + s.text;
		from = s.to;
	}
	out += edit.value.slice(from);
	const move = (pos: number): number => {
		let shift = 0;
		for (const s of splices) {
			if (pos >= s.to) shift += s.text.length - (s.to - s.from);
			else if (pos > s.from) shift += Math.min(s.text.length, pos - s.from) - (pos - s.from);
		}
		return pos + shift;
	};
	return { value: out, start: move(edit.start), end: move(edit.end) };
}

const COMMENT = /^([ \t]*)\/\/ ?/;

/**
 * Ctrl+/: comment every touched line that has text, or, when they are all commented, take the
 * `//` (and one space) off. The marker goes at the shallowest indentation so the block keeps its shape.
 */
export function toggleComment(edit: Edit): Edit {
	const { value } = edit;
	const lines = touchedLines(value, edit.start, edit.end)
		.map((s) => ({ s, text: value.slice(s, lineEndOf(value, s)) }))
		.filter((l) => l.text.trim() !== '');
	if (lines.length === 0) return edit;
	if (lines.every((l) => COMMENT.test(l.text))) {
		return splice(
			edit,
			lines.map((l) => {
				const m = COMMENT.exec(l.text)!;
				return { from: l.s + m[1]!.length, to: l.s + m[0].length, text: '' };
			})
		);
	}
	const depth = Math.min(...lines.map((l) => /^[ \t]*/.exec(l.text)![0].length));
	return splice(
		edit,
		lines.map((l) => ({ from: l.s + depth, to: l.s + depth, text: '// ' }))
	);
}

/** Alt+Up / Alt+Down: swap the touched lines with the line above or below; null at the edge. */
export function moveLines(edit: Edit, direction: -1 | 1): Edit | null {
	const lines = edit.value.split('\n');
	const { first, last } = touchedRange(edit);
	if (direction === -1 ? first === 0 : last === lines.length - 1) return null;
	const block = lines.slice(first, last + 1);
	const other = lines[direction === -1 ? first - 1 : last + 1]!;
	const at = direction === -1 ? first - 1 : first;
	lines.splice(at, block.length + 1, ...(direction === -1 ? [...block, other] : [other, ...block]));
	const delta = direction === -1 ? -(other.length + 1) : other.length + 1;
	return { value: lines.join('\n'), start: edit.start + delta, end: edit.end + delta };
}

/** Shift+Alt+Up / Shift+Alt+Down: copy the touched lines above or below; the selection is on the copy. */
export function duplicateLines(edit: Edit, direction: -1 | 1): Edit {
	const { value } = edit;
	const starts = touchedLines(value, edit.start, edit.end);
	const first = starts[0]!;
	const last = lineEndOf(value, starts[starts.length - 1]!);
	const text = value.slice(first, last);
	if (direction === -1) {
		// The copy is inserted above and takes the place (and the selection) of the original.
		return {
			value: value.slice(0, first) + text + '\n' + value.slice(first),
			start: edit.start,
			end: edit.end
		};
	}
	return {
		value: value.slice(0, last) + '\n' + text + value.slice(last),
		start: edit.start + text.length + 1,
		end: edit.end + text.length + 1
	};
}

// ---- Auto-closing brackets and quotes (an option, off by default) --------------------------------

const PAIRS: Record<string, string> = {
	'(': ')',
	'[': ']',
	'{': '}',
	'"': '"',
	"'": "'",
	'`': '`'
};
const CLOSERS = ')]}';
const QUOTES = '"\'`';
const WORD = /[A-Za-z0-9_$]/;

/** Whether the caret sits inside a string or comment (at the end of an unfinished one counts). */
function insideLiteral(value: string, caret: number): boolean {
	let from = 0;
	for (const token of scan(value)) {
		const to = from + token.text.length;
		if (token.kind === 'string' || token.kind === 'comment') {
			if (caret > from && caret < to) return true;
			if (caret === to && (!token.closed || token.text.startsWith('//'))) return true;
		}
		from = to;
	}
	return false;
}

/**
 * What typing `typed` does with auto-closing on: step over a closer that is already there, wrap a
 * selection, or insert the pair with the caret between. Null when the key should just type itself
 * (inside a string or comment, before a word character, or no pair involved).
 */
export function autoClose(edit: Edit, typed: string): Edit | null {
	const { value, start, end } = edit;
	const mask = codeOnly(value);
	if (start === end && value[end] === typed) {
		const closesString = QUOTES.includes(typed) && mask[end] === ' ';
		if (closesString || (CLOSERS.includes(typed) && isCodeAt(mask, end))) {
			return { value, start: end + 1, end: end + 1 };
		}
	}
	const closer = PAIRS[typed];
	if (closer === undefined || CLOSERS.includes(typed)) return null;
	if (start !== end) {
		return {
			value: value.slice(0, start) + typed + value.slice(start, end) + closer + value.slice(end),
			start: start + 1,
			end: end + 1
		};
	}
	if (insideLiteral(value, start)) return null;
	const next = value[end];
	if (next !== undefined && WORD.test(next)) return null;
	if (QUOTES.includes(typed) && start > 0 && WORD.test(value[start - 1]!)) return null;
	return {
		value: value.slice(0, start) + typed + closer + value.slice(end),
		start: start + 1,
		end: start + 1
	};
}

/** Backspace between an auto-closed pair removes both; null otherwise. */
export function deletePair(edit: Edit): Edit | null {
	const { value, start, end } = edit;
	if (start !== end || start === 0) return null;
	const open = value[start - 1]!;
	if (PAIRS[open] === undefined || value[start] !== PAIRS[open]) return null;
	return {
		value: value.slice(0, start - 1) + value.slice(start + 1),
		start: start - 1,
		end: start - 1
	};
}
