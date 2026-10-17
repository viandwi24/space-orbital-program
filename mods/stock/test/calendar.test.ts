/** The stock calendar (plan 081, ADR 0141): fictional, from the home planet. */
import { calendarOf, formatDate } from '@orbital/sdk';
import { describe, expect, test } from 'bun:test';
import { HomeBody, MoonBody } from '../src/bodies.ts';

describe('stock calendar', () => {
	test('a day is the home planet solar day; no year until it orbits a Sun (plan 122)', () => {
		const cal = calendarOf([HomeBody, MoonBody]);
		// the home planet is the root: its solar day is its rotation period, it has no orbital period
		expect(HomeBody.parent).toBeUndefined();
		expect(cal).toEqual({
			kind: 'fictional',
			home: 'stock.home',
			dayLength: HomeBody.rotationPeriod,
			yearLength: null
		});
		expect(formatDate(cal, { day: 0, fraction: 0 }, 2.5 * HomeBody.rotationPeriod).text).toBe(
			'Day 3, 03:00:00'
		);
	});
});
