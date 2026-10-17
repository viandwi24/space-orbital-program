import { describe, expect, it } from 'vitest';
import {
	INDENT,
	acceptCompletion,
	applyMarks,
	closeBracket,
	codeOnly,
	completionsAt,
	createHistory,
	didYouMean,
	findAll,
	indent,
	lint,
	matchBracket,
	newline,
	outdent,
	stepMatch,
	type Edit
} from './script-editing';
import { highlight } from './script-highlight';

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
const show = (e: Edit): string =>
	e.start === e.end
		? e.value.slice(0, e.start) + '|' + e.value.slice(e.start)
		: e.value.slice(0, e.start) + '[' + e.value.slice(e.start, e.end) + ']' + e.value.slice(e.end);

describe('Tab and Shift+Tab', () => {
	it('puts one indent at the caret, or in place of a selection inside one line', () => {
		expect(show(indent(at('a|b')))).toBe(`a${INDENT}|b`);
		expect(show(indent(at('a[xx]b')))).toBe(`a${INDENT}|b`);
	});

	it('indents every touched line of a multi-line selection and keeps the selection on the same text', () => {
		const out = indent(at('one\n[two\nthree]\nfour'));
		expect(out.value).toBe(`one\n${INDENT}two\n${INDENT}three\nfour`);
		// the selection covers the indented lines whole
		expect(out.value.slice(out.start, out.end)).toBe('\ttwo\n\tthree');
	});

	it('leaves blank lines blank and skips a last line the selection only touches at its start', () => {
		expect(indent(at('[a\n\nb\n]c')).value).toBe('\ta\n\n\tb\nc');
	});

	it('outdent takes a tab or up to four spaces off each touched line and never goes below the line start', () => {
		const out = outdent(at('[\ta\n    b\n  c\nd]'));
		expect(out.value).toBe('a\nb\nc\nd');
		expect(out.start).toBe(0);
		expect(outdent(at('\t\tx|')).value).toBe('\tx');
		expect(show(outdent(at('\t\tx|')))).toBe('\tx|');
		// a caret inside the cut indentation lands at the line start
		expect(show(outdent(at('\t|x')))).toBe('|x');
		expect(outdent(at('x|')).value).toBe('x');
	});

	it('outdent then indent round-trips a selection of tab-indented lines', () => {
		const start = at('[\ta\n\tb]');
		expect(indent(outdent(start))).toEqual(start);
	});
});

describe('Enter', () => {
	it('copies the indentation of the line', () => {
		expect(show(newline(at('\t\tfoo();|')))).toBe('\t\tfoo();\n\t\t|');
		expect(show(newline(at('foo();|')))).toBe('foo();\n|');
	});

	it('goes one level deeper after an opening bracket, and splits a pair onto three lines', () => {
		expect(show(newline(at('if (x) {|')))).toBe('if (x) {\n\t|');
		expect(show(newline(at('\tfoo(|')))).toBe('\tfoo(\n\t\t|');
		expect(show(newline(at('\twhile (a) {|}')))).toBe('\twhile (a) {\n\t\t|\n\t}');
		expect(show(newline(at('foo(|)')))).toBe('foo(\n\t|\n)');
	});

	it('does not go deeper after a bracket inside a string or a comment', () => {
		expect(show(newline(at("print('{'|")))).toBe("print('{'\n|");
		expect(show(newline(at('// open {|')))).toBe('// open {\n|');
		expect(show(newline(at('s = "{|')))).toBe('s = "{\n|');
	});

	it('replaces a selection and ignores trailing blanks before the caret', () => {
		expect(show(newline(at('f(){[xx]}')))).toBe('f(){\n\t|\n}');
		expect(show(newline(at('{ |')))).toBe('{ \n\t|');
	});
});

describe('closing brackets', () => {
	it('take a level off a line that holds only indentation', () => {
		expect(show(closeBracket(at('if (x) {\n\tfoo();\n\t|'), '}')!)).toBe('if (x) {\n\tfoo();\n}|');
		expect(show(closeBracket(at('{\n\t\t|'), ')')!)).toBe('{\n\t)|');
	});

	it('do nothing on a line with code, at the line start, for another character or with a selection', () => {
		expect(closeBracket(at('\tfoo(|'), ')')).toBeNull();
		expect(closeBracket(at('|'), '}')).toBeNull();
		expect(closeBracket(at('\t|'), 'x')).toBeNull();
		expect(closeBracket(at('[\t]'), '}')).toBeNull();
	});
});

describe('bracket matching', () => {
	it('finds the partner of the bracket before or at the caret, over nested pairs', () => {
		const v = 'f(a, [b, {c}], d)';
		expect(matchBracket(v, 2)).toEqual({ a: 1, b: 16 });
		expect(matchBracket(v, 1)).toEqual({ a: 1, b: 16 });
		expect(matchBracket(v, 17)).toEqual({ a: 1, b: 16 });
		expect(matchBracket(v, 11)).toEqual({ a: 9, b: 11 });
		expect(matchBracket(v, 6)).toEqual({ a: 5, b: 12 });
		expect(matchBracket(v, 7)).toBeNull();
	});

	it('ignores brackets in strings and comments and returns null without a partner or a bracket', () => {
		const v = 'f("(", x) // )\n';
		expect(matchBracket(v, 2)).toEqual({ a: 1, b: 8 });
		expect(matchBracket('f(()', 2)).toBeNull();
		expect(matchBracket('abc', 1)).toBeNull();
		expect(matchBracket('"(" )', 1)).toBeNull();
	});
});

describe('marks on the painted layer', () => {
	const text = (lines: ReturnType<typeof applyMarks>) =>
		lines.map((l) => l.map((t) => (t.mark ? `${t.mark}:${t.text}` : t.text)));

	it('splits tokens at the marks and keeps the text intact', () => {
		const source = 'ship.mass\n(a)';
		const marked = applyMarks(highlight(source), [
			{ from: 5, to: 9, kind: 'find' },
			{ from: 10, to: 11, kind: 'bracket' },
			{ from: 12, to: 13, kind: 'bracket' }
		]);
		expect(text(marked)).toEqual(
			[
				['ship', '.', 'find:mass'],
				['bracket:(', 'a', 'bracket:)']
			].map((l, i) => (i === 0 ? ['ship', '.', 'find:mass'] : l))
		);
		expect(marked.map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(source);
	});

	it('lets the current find match win over a plain one and works on a token cut by a mark in its middle', () => {
		const marked = applyMarks(highlight('abcdef'), [
			{ from: 1, to: 4, kind: 'find' },
			{ from: 2, to: 3, kind: 'find-current' }
		]);
		expect(text(marked)).toEqual([['a', 'find:b', 'find-current:c', 'find:d', 'ef']]);
	});

	it('returns the lines unchanged without marks', () => {
		expect(applyMarks(highlight('a\nb'), []).map((l) => l.map((t) => t.text))).toEqual([
			['a'],
			['b']
		]);
	});
});

describe('find', () => {
	it('lists non-overlapping matches, case-insensitive unless asked', () => {
		expect(findAll('Ship ship SHIP', 'ship')).toEqual([0, 5, 10]);
		expect(findAll('Ship ship SHIP', 'ship', true)).toEqual([5]);
		expect(findAll('aaaa', 'aa')).toEqual([0, 2]);
		expect(findAll('abc', '')).toEqual([]);
	});

	it('steps forward and backward with wrap-around', () => {
		const m = [3, 10, 20];
		expect(stepMatch(m, 0, 1)).toBe(0);
		expect(stepMatch(m, 4, 1)).toBe(1);
		expect(stepMatch(m, 21, 1)).toBe(0);
		expect(stepMatch(m, 10, -1)).toBe(0);
		expect(stepMatch(m, 3, -1)).toBe(2);
		expect(stepMatch([], 0, 1)).toBe(-1);
	});
});

describe('completions', () => {
	const names = (v: string, caret = v.length, explicit = false) =>
		completionsAt(v, caret, explicit)?.items.map((e) => e.name) ?? null;

	it('offers the globals for a word being typed, by prefix', () => {
		expect(names('wa')).toEqual(['wait', 'waitUntil', 'warp', 'warpTo']);
		expect(names('await war')).toEqual(['warp', 'warpTo']);
		expect(names('x = set')).toEqual(['setNode', 'setTarget']);
		expect(names('x = SET')).toEqual(['setNode', 'setTarget']);
	});

	it('offers the members of ship after the dot, with writable ones marked', () => {
		const c = completionsAt('ship.thr', 8)!;
		expect(c.items.map((e) => e.name)).toEqual(['throttle']);
		expect(c.items[0]!.writable).toBe(true);
		expect(c.from).toBe(5);
		expect(names('ship.ta')).toEqual(['target', 'targets']);
		expect(names('ship.', 5)).toContain('altitude');
		expect(names('ship.', 5)).toHaveLength(28);
		expect(names('ship. t')).toEqual(expect.arrayContaining(['t', 'throttle']));
	});

	it('offers nothing for other receivers, in strings and comments, after a digit, or for a finished word', () => {
		expect(names('thing.thr')).toBeNull();
		expect(names('a.ship.thr')).toBeNull();
		expect(names('"ship.thr')).toBeNull();
		expect(names('// ship.thr')).toBeNull();
		expect(names('1wa')).toBeNull();
		expect(names('ship.throttle')).toBeNull();
		expect(names('')).toBeNull();
		expect(names('w')).toBeNull();
		expect(names('w', 1, true)).toContain('wait');
		expect(names('x = ')).toBeNull();
	});

	it('Ctrl+Space also offers at an empty prefix', () => {
		expect(names('x = ', 4, true)?.length).toBeGreaterThan(5);
		expect(names('ship.', 5, true)?.length).toBeGreaterThan(5);
	});

	it('caps the list (the popup scrolls)', () => {
		expect(completionsAt('ship.', 5)!.items.length).toBeLessThanOrEqual(40);
	});

	it('accepting replaces the typed prefix and puts the caret after the name', () => {
		const v = 'ship.thr + 1';
		const c = completionsAt(v, 8)!;
		expect(show(acceptCompletion(v, c, c.items[0]!))).toBe('ship.throttle| + 1');
	});
});

describe('undo history', () => {
	const e = (value: string): Edit => ({ value, start: value.length, end: value.length });

	it('undoes and redoes in the order edits were made', () => {
		const h = createHistory(e(''));
		h.record(e('a'), 'other', 0);
		h.record(e('ab'), 'other', 0);
		expect(h.undo()).toEqual(e('a'));
		expect(h.undo()).toEqual(e(''));
		expect(h.undo()).toBeNull();
		expect(h.redo()).toEqual(e('a'));
		expect(h.redo()).toEqual(e('ab'));
		expect(h.redo()).toBeNull();
	});

	it('merges a run of typing into one step, but not across a pause, a change of kind or an undo', () => {
		const h = createHistory(e(''));
		h.record(e('a'), 'type', 0);
		h.record(e('ab'), 'type', 100);
		h.record(e('abc'), 'type', 200);
		h.record(e('abcd'), 'type', 5_000); // a pause
		h.record(e('abc'), 'delete', 5_100);
		h.record(e('ab'), 'delete', 5_200);
		expect(h.undo()).toEqual(e('abcd'));
		expect(h.undo()).toEqual(e('abc'));
		expect(h.undo()).toEqual(e(''));
	});

	it('a new edit after an undo drops the redo tail', () => {
		const h = createHistory(e(''));
		h.record(e('a'), 'other', 0);
		h.record(e('ab'), 'other', 0);
		h.undo();
		h.record(e('ax'), 'other', 0);
		expect(h.canRedo).toBe(false);
		expect(h.undo()).toEqual(e('a'));
	});

	it('a selection-only change does not add a step, and reset forgets the past', () => {
		const h = createHistory(e('abc'));
		h.record({ value: 'abc', start: 0, end: 1 }, 'other', 0);
		expect(h.canUndo).toBe(false);
		h.record(e('abcd'), 'other', 0);
		h.reset(e('zzz'));
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
	});

	it('keeps at most a few hundred steps', () => {
		const h = createHistory(e(''));
		for (let i = 1; i <= 400; i++) h.record(e('x'.repeat(i)), 'other', 0);
		let steps = 0;
		while (h.undo()) steps += 1;
		expect(steps).toBeLessThanOrEqual(300);
		expect(steps).toBeGreaterThan(100);
	});
});

describe('lint', () => {
	const messages = (v: string) => lint(v).map((p) => `${p.line}:${p.severity}:${p.message}`);

	it('is quiet on the sample-like code', () => {
		expect(
			lint(
				'const a = ship.altitude;\nship.throttle = 1;\nstage();\nawait wait(5);\nwhile (ship.apoapsis === null || ship.apoapsis < 80000) await nextTick();\nprint(`x ${a}`);\n'
			)
		).toEqual([]);
	});

	it('reports brackets that do not pair, with the line of the opener', () => {
		expect(messages('if (x) {\n\tfoo(\n}')).toEqual([
			'1:error:The { on this line is never closed.',
			'3:error:Found } where ) was expected to close the ( on line 2.'
		]);
		expect(messages('foo())')).toEqual(['1:error:Unexpected ): nothing is open.']);
		expect(messages('{')).toEqual(['1:error:The { on this line is never closed.']);
	});

	it('ignores brackets in strings and comments', () => {
		expect(lint('print("(");\n// )\n')).toEqual([]);
	});

	it('reports a string and a comment that never end', () => {
		expect(messages("print('oops);\nx = 1")).toEqual([
			"1:error:This string is never closed (missing ').",
			'1:error:The ( on this line is never closed.'
		]);
		expect(messages('x = `abc')[0]).toContain('never closed (missing `)');
		expect(messages('x = 1; /* hi')).toEqual([
			'1:warning:This comment is never closed (missing */).'
		]);
		expect(lint('x = `a\nb`;')).toEqual([]);
	});

	it('flags an unknown ship member and suggests the nearest', () => {
		expect(messages('print(ship.altitud)')).toEqual([
			'1:warning:ship.altitud is not part of the script API; did you mean ship.altitude?'
		]);
		expect(messages('ship.zzzzzz')[0]).toContain('ship.zzzzzz is not part of the script API.');
		expect(lint('const o = { ship: 1 }; o.ship.foo; "ship.zzz"; // ship.zzz')).toEqual([]);
		expect(didYouMean('throtle')).toBe('throttle');
		expect(didYouMean('qqqqqqq')).toBeNull();
	});

	it('flags assigning to a read-only member, but not comparing', () => {
		expect(messages('ship.altitude = 5;')).toEqual([
			expect.stringMatching(
				/^1:error:ship\.altitude is read-only; only ship\.throttle, ship\.attitude, ship\.sas can be set\.$/
			)
		]);
		expect(lint('ship.throttle = 1; ship.attitude = { pitch: 1 }; ship.sas = "hold";')).toEqual([]);
		expect(lint('if (ship.altitude == 5 || ship.altitude === 6 || ship.altitude >= 7) {}')).toEqual(
			[]
		);
	});

	it('flags wait, waitUntil and nextTick that are not awaited', () => {
		expect(messages('wait(5);\nawait wait(5);\nnextTick();\nx = waitUntil(f);')).toEqual([
			'1:warning:wait() does nothing unless you await it: await wait(...).',
			'3:warning:nextTick() does nothing unless you await it: await nextTick(...).'
		]);
		expect(lint('while (x) await nextTick();\nreturn wait(1);')).toEqual([]);
	});

	it('lists problems by line and stops at twenty', () => {
		const many = Array.from({ length: 30 }, () => 'foo)').join('\n');
		expect(lint(many)).toHaveLength(20);
		expect(lint('wait(1);\n{').map((p) => p.line)).toEqual([1, 2]);
	});
});

describe('codeOnly', () => {
	it('blanks strings and comments and keeps the length and the newlines', () => {
		const v = 'a("b"); // c\n/* d\ne */ f';
		const out = codeOnly(v);
		expect(out).toHaveLength(v.length);
		expect(out.split('\n')).toHaveLength(3);
		expect(out.replace(/\s/g, '')).toBe('a();f');
	});
});
