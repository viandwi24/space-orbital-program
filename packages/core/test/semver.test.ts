import { describe, expect, test } from 'bun:test';
import { isValidRange, parseVersion, satisfies } from '../src/index.ts';

describe('semver', () => {
	test('parseVersion accepts x.y.z only', () => {
		expect(parseVersion('1.20.3')).toEqual([1, 20, 3]);
		for (const bad of ['1.2', '1.2.3-beta', 'v1.2.3', '01.2.3', '', '1.2.3.4']) {
			expect(parseVersion(bad)).toBeUndefined();
		}
	});

	const cases: Array<[string, string, boolean]> = [
		// caret
		['0.1.0', '^0.1', true],
		['0.1.9', '^0.1', true],
		['0.2.0', '^0.1', false],
		['0.0.9', '^0.1', false],
		['0.1.2', '^0.1.3', false],
		['0.1.3', '^0.1.3', true],
		['0.1.9', '^0.1.3', true],
		['0.0.3', '^0.0.3', true],
		['0.0.4', '^0.0.3', false],
		['0.5.0', '^0', true],
		['1.0.0', '^0', false],
		['1.9.9', '^1.2', true],
		['1.1.9', '^1.2', false],
		['2.0.0', '^1.2.3', false],
		// tilde
		['1.2.9', '~1.2.3', true],
		['1.3.0', '~1.2.3', false],
		['1.2.2', '~1.2.3', false],
		['1.9.0', '~1', true],
		['2.0.0', '~1', false],
		['1.2.0', '~1.2', true],
		['1.3.0', '~1.2', false],
		// bare / exact / partial / wildcard
		['1.2.3', '1.2.3', true],
		['1.2.4', '1.2.3', false],
		['1.2.7', '1.2', true],
		['1.3.0', '1.2', false],
		['1.9.0', '1', true],
		['0.0.0', '*', true]
	];

	test.each(cases)('satisfies(%s, %s) = %p', (v, r, expected) => {
		expect(satisfies(v, r)).toBe(expected);
	});

	test('wildcard accepts anything', () => {
		expect(satisfies('99.0.0', '*')).toBe(true);
	});

	test('unsupported ranges and bad versions throw with the offending text', () => {
		for (const range of ['>=1.0.0', '^1.2.3-beta', '1.x', '^1 || ^2', '']) {
			expect(isValidRange(range)).toBe(false);
			expect(() => satisfies('1.0.0', range)).toThrow(/Unsupported version range/);
		}
		expect(() => satisfies('1.0', '^1')).toThrow(/Invalid version "1.0"/);
	});
});
