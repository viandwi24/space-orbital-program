import { describe, expect, test } from 'bun:test';
import { holdSubject } from '../src/camera-hold.ts';

describe('holdSubject (plan 257)', () => {
	test('follows the live vessel and remembers it', () => {
		expect(holdSubject('a', undefined, false)).toEqual({ subject: 'a', last: 'a' });
	});
	test('after a crash it holds the last vessel instead of falling to the origin', () => {
		expect(holdSubject(undefined, 'a', false)).toEqual({ subject: 'a', last: 'a' });
	});
	test('the map follows nothing it does not have, and no vessel ever seen is none', () => {
		expect(holdSubject(undefined, 'a', true).subject).toBeUndefined();
		expect(holdSubject(undefined, undefined, false).subject).toBeUndefined();
	});
});
