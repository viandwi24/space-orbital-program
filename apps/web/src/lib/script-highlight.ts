/**
 * A small JavaScript tokenizer for the script editor (plan 030): enough to colour keywords,
 * strings, numbers, comments and the script API, line by line. It is not a parser (no regex
 * literals, `${}` inside a template stays part of the string); a wrong colour never changes what
 * the script does. No dependency: CodeMirror 6 or highlight.js would be 100 KB or more for this
 * (docs/research/scripting.md).
 */

export type TokenKind = 'plain' | 'keyword' | 'api' | 'string' | 'number' | 'comment';

export interface Token {
	kind: TokenKind;
	text: string;
}

const KEYWORDS = new Set(
	(
		'async await break case catch class const continue debugger default delete do else export ' +
		'extends false finally for function if import in instanceof let new null of return static ' +
		'super switch this throw true try typeof undefined var void while with yield'
	).split(' ')
);

/** The names the script API adds to the QuickJS global (docs/architecture/scripting.md). */
const API = new Set(['ship', 'stage', 'action', 'wait', 'waitUntil', 'nextTick', 'time', 'print']);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;

/** Tokenize `source` and split the result at newlines: one token list per line. */
export function highlight(source: string): Token[][] {
	const lines: Token[][] = [[]];
	const push = (kind: TokenKind, text: string): void => {
		// A token that spans lines (block comment, template string) is cut at each newline.
		const parts = text.split('\n');
		parts.forEach((part, i) => {
			if (i > 0) lines.push([]);
			if (part === '') return;
			const line = lines[lines.length - 1]!;
			const last = line[line.length - 1];
			if (last && last.kind === kind) last.text += part;
			else line.push({ kind, text: part });
		});
	};

	let i = 0;
	const n = source.length;
	while (i < n) {
		const c = source[i]!;
		const next = source[i + 1];
		if (c === '/' && next === '/') {
			let j = source.indexOf('\n', i);
			if (j === -1) j = n;
			push('comment', source.slice(i, j));
			i = j;
		} else if (c === '/' && next === '*') {
			const end = source.indexOf('*/', i + 2);
			const j = end === -1 ? n : end + 2;
			push('comment', source.slice(i, j));
			i = j;
		} else if (c === '"' || c === "'" || c === '`') {
			let j = i + 1;
			while (j < n && source[j] !== c) {
				if (source[j] === '\\') j += 1;
				else if (source[j] === '\n' && c !== '`') break; // unterminated: stop at the line end
				j += 1;
			}
			j = Math.min(j + 1, n);
			if (source[j - 1] === '\n') j -= 1;
			push('string', source.slice(i, j));
			i = j;
		} else if (DIGIT.test(c) || (c === '.' && next !== undefined && DIGIT.test(next))) {
			let j = i + 1;
			while (j < n && /[0-9A-Za-z_.]/.test(source[j]!)) {
				// `1e-3`, `1E+9`: the sign belongs to the number
				if (
					/[eE]/.test(source[j]!) &&
					/[+-]/.test(source[j + 1] ?? '') &&
					!/^0[xX]/.test(source.slice(i, j))
				) {
					j += 1;
				}
				j += 1;
			}
			push('number', source.slice(i, j));
			i = j;
		} else if (IDENT_START.test(c)) {
			let j = i + 1;
			while (j < n && IDENT_PART.test(source[j]!)) j += 1;
			const word = source.slice(i, j);
			// `ship.mass` is the API; `thing.ship` is somebody's property.
			const afterDot = source[i - 1] === '.';
			push(
				!afterDot && KEYWORDS.has(word) ? 'keyword' : !afterDot && API.has(word) ? 'api' : 'plain',
				word
			);
			i = j;
		} else {
			push('plain', c);
			i += 1;
		}
	}
	return lines;
}
