/** The stock calendar (plan 081, ADR 0141; plan 122, ADR 0119 point 5): fictional, read on the Sun. */
import { calendarOf, formatDate } from '@orbital/sdk';
import { describe, expect, test } from 'bun:test';
import { HOME_TILT, HomeBody, MoonBody, SunBody } from '../src/bodies.ts';

describe('stock calendar', () => {
	test('a day is the home planet solar day and a year its orbit round the Sun (plan 122)', () => {
		const cal = calendarOf([SunBody, HomeBody, MoonBody]);
		expect(HomeBody.parent).toBe('stock.sun');
		expect(cal.kind).toBe('fictional');
		if (cal.kind !== 'fictional') return;
		expect(cal.home).toBe('stock.home');
		// the sidereal rotation is kept (nothing in the home sphere moves); the solar day is longer
		expect(cal.yearLength).toBeCloseTo(9_203_393, -1);
		expect(cal.dayLength).toBeCloseTo(1 / (1 / HomeBody.rotationPeriod - 1 / cal.yearLength!), 6);
		expect(cal.dayLength).toBeCloseTo(21_650.8, 1);
		expect(formatDate(cal, { day: 0, fraction: 0 }, 2.5 * cal.dayLength).text).toBe(
			'Year 1, day 3, 03:00:25' // half a 21 650.8 s day, in SI hours
		);
		expect(HomeBody.orbit!.i).toBe(HOME_TILT);
	});
});
