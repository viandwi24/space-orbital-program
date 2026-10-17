import { describe, expect, it } from 'vitest';
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
} from './script-editing-commands';
import { createHistory, findAll, type Edit } from './script-editing';

/** `|` marks the caret, `[` and `]` a selection. */
function at(text: string): Edit {
	const open = text.indexOf('[');
	if (open !== -1) {
		const close = text.indexOf(']');
		const value = text.slice(0, open) + text.slice(open + 1, close) + text.slice(close + 1);
		return { value, start: open, end: close - 1 };
	}
	const caret = text.indexOf('|');
	return { value: text.replace('|', ''), start: caret, end: caret };
}
function show(e: Edit): string {
	if (e.start === e.end) return e.value.slice(0, e.start) + '|' + e.value.slice(e.start);
	return (
		e.value.slice(0, e.start) + '[' + e.value.slice(e.start, e.end) + ']' + e.value.slice(e.end)
	);
}

describe('find options', () => {
	it('whole word does not match inside a longer identifier', () => {
		const text = 'ship shipment ship.altitude myship $ship ship_1 (ship)';
		expect(findAll(text, 'ship')).toHaveLength(7);
		expect(findAll(text, 'ship', { wholeWord: true })).toEqual([0, 14, 49]);
	});
	it('whole word ignores a side where the query has no word character', () => {
		expect(findAll('a.b a.bc', '.b', { wholeWord: true })).toEqual([1]);
		expect(findAll('x = ship.t', 'ship.', { wholeWord: true })).toEqual([4]);
	});
	it('match case and whole word combine', () => {
		expect(findAll('Ship ship SHIP', 'ship', { matchCase: true, wholeWord: true })).toEqual([5]);
	});
});

describe('replace', () => {
	it('replaces one match and puts the caret after it', () => {
		const e = replaceAt('a ship b ship', 2, 4, 'craft');
		expect(show(e)).toBe('a craft| b ship');
	});
	it('replaces every match, selecting the first replacement', () => {
		const v = 'ship, Ship and shipment';
		const e = replaceAll(v, findAll(v, 'ship', { wholeWord: true }), 4, 'craft');
		expect(show(e)).toBe('[craft], craft and shipment');
	});
	it('replace all with no match changes nothing', () => {
		expect(replaceAll('abc', [], 1, 'x').value).toBe('abc');
	});
	it('a replacement is one history step', () => {
		const h = createHistory({ value: 'a a a', start: 0, end: 0 });
		const e = replaceAll('a a a', [0, 2, 4], 1, 'bb');
		h.record(e, 'other', 0);
		expect(h.undo()!.value).toBe('a a a');
		expect(h.canUndo).toBe(false);
	});
});

describe('go to line', () => {
	const v = 'one\ntwo\n\nfour';
	it('finds the offsets of a line', () => {
		expect(lineRange(v, 1)).toEqual({ start: 0, end: 3, line: 1 });
		expect(lineRange(v, 2)).toEqual({ start: 4, end: 7, line: 2 });
		expect(lineRange(v, 3)).toEqual({ start: 8, end: 8, line: 3 });
		expect(lineRange(v, 4)).toEqual({ start: 9, end: 13, line: 4 });
	});
	it('clamps past the end and before the start', () => {
		expect(lineRange(v, 99).line).toBe(4);
		expect(lineRange(v, 0).line).toBe(1);
	});
	it('accepts only whole positive numbers', () => {
		expect(parseLineNumber(' 12 ')).toBe(12);
		for (const bad of ['', 'x', '0', '-3', '1.5', '1e3', '12 13', '9999999']) {
			expect(parseLineNumber(bad), bad).toBeNull();
		}
	});
});

describe('toggle comment', () => {
	it('comments the touched lines at the shallowest indentation, skipping blank lines', () => {
		const e = toggleComment(at('[if (a) {\n\tb();\n\n}]'));
		expect(e.value).toBe('// if (a) {\n// \tb();\n\n// }');
	});
	it('uncomments when every line is commented, and round-trips', () => {
		const start = at('[x();\n\ty();]');
		const commented = toggleComment(start);
		expect(commented.value).toBe('// x();\n// \ty();');
		const back = toggleComment({ ...commented, start: 0, end: commented.value.length });
		expect(back.value).toBe(start.value);
	});
	it('comments all when only some are commented', () => {
		const e = toggleComment(at('[// a\nb]'));
		expect(e.value).toBe('// // a\n// b');
	});
	it('keeps the caret on the same text', () => {
		const e = toggleComment(at('x = 1|;'));
		expect(show(e)).toBe('// x = 1|;');
		expect(show(toggleComment(e))).toBe('x = 1|;');
	});
	it('does nothing on blank lines', () => {
		const e = at('a\n|\nb');
		expect(toggleComment(e)).toEqual(e);
	});
});

describe('move and duplicate lines', () => {
	it('moves a line up and down with the caret', () => {
		expect(show(moveLines(at('a\nb|\nc'), -1)!)).toBe('b|\na\nc');
		expect(show(moveLines(at('a\nb|\nc'), 1)!)).toBe('a\nc\nb|');
	});
	it('moves a block of lines and keeps the selection on the same text', () => {
		expect(show(moveLines(at('a\n[b\nc]\nd'), -1)!)).toBe('[b\nc]\na\nd');
		expect(show(moveLines(at('a\n[b\nc]\nd'), 1)!)).toBe('a\nd\n[b\nc]');
	});
	it('does nothing at the first and last line', () => {
		expect(moveLines(at('a|\nb'), -1)).toBeNull();
		expect(moveLines(at('a\nb|'), 1)).toBeNull();
		expect(moveLines(at('[a\nb]'), -1)).toBeNull();
	});
	it('duplicates down and selects the copy', () => {
		expect(show(duplicateLines(at('a\nb|\nc'), 1))).toBe('a\nb\nb|\nc');
		expect(show(duplicateLines(at('[a\nb]'), 1))).toBe('a\nb\n[a\nb]');
	});
	it('duplicates up and keeps the selection on the new upper copy', () => {
		expect(show(duplicateLines(at('a\nb|\nc'), -1))).toBe('a\nb|\nb\nc');
		expect(show(duplicateLines(at('[a\nb]'), -1))).toBe('[a\nb]\na\nb');
	});
});

describe('auto-closing (option)', () => {
	it('inserts a pair with the caret between', () => {
		for (const [typed, pair] of [
			['(', '()'],
			['[', '[]'],
			['{', '{}'],
			['"', '""'],
			["'", "''"],
			['`', '``']
		]) {
			expect(show(autoClose(at('x = |'), typed!)!), typed).toBe(`x = ${pair![0]}|${pair![1]}`);
		}
	});
	it('steps over a closer that is already there', () => {
		expect(show(autoClose(at('f(|)'), ')')!)).toBe('f()|');
		expect(show(autoClose(at('s = "ab|"'), '"')!)).toBe('s = "ab"|');
	});
	it('wraps a selection', () => {
		expect(show(autoClose(at('f([x])'), '{')!)).toBe('f([x])'.replace('[x]', '{[x]}'));
		expect(show(autoClose(at('say [hi]'), '"')!)).toBe('say "[hi]"');
	});
	it('types plainly inside a string or comment, before a word character, and after one for quotes', () => {
		expect(autoClose(at('"a |b"'), '(')).toBeNull();
		expect(autoClose(at('// note |'), '(')).toBeNull();
		expect(autoClose(at('|abc'), '(')).toBeNull();
		expect(autoClose(at('don|'), "'")).toBeNull();
	});
	it('has no opinion about other keys and unmatched closers', () => {
		expect(autoClose(at('a|'), 'b')).toBeNull();
		expect(autoClose(at('a|'), ')')).toBeNull();
	});
	it('backspace between a pair removes both', () => {
		expect(show(deletePair(at('f(|)'))!)).toBe('f|');
		expect(deletePair(at('f(|x)'))).toBeNull();
		expect(deletePair(at('[()]'))).toBeNull();
		expect(show(deletePair(at('s = "|"'))!)).toBe('s = |');
	});
});
