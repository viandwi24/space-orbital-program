/** Epoch and calendars (plan 081, ADRs 0103 and 0141). */
import { describe, expect, test } from 'bun:test';
import {
	calendarOf,
	civilFromDays,
	daysFromCivil,
	epochFromUnixMs,
	epochFromUtc,
	formatDate,
	GRAVITATIONAL_CONSTANT,
	julianDate,
	type BodyDefinition,
	type Calendar,
	type Epoch
} from '../src/index.ts';

const J2000: Epoch = { day: 0, fraction: 0 };
const UTC: Calendar = { kind: 'gregorian-utc' };
const utc = (epoch: Epoch, t: number): string => formatDate(UTC, epoch, t).text;

describe('Gregorian UTC', () => {
	test('J2000.0 (JD 2451545.0 TT) plus 0 s is 2000-01-01 11:58:55.816 UTC', () => {
		expect(utc(J2000, 0)).toBe('2000-01-01 11:58:55.816 UTC');
		expect(julianDate(J2000, 0).value).toBe(2_451_545);
	});

	test('the leap second at the end of 2016 reads 23:59:60, then the new year', () => {
		const leap = epochFromUtc({ year: 2016, month: 12, day: 31, hour: 23, minute: 59, second: 60 });
		expect(utc(leap, -1)).toBe('2016-12-31 23:59:59.000 UTC');
		expect(utc(leap, 0)).toBe('2016-12-31 23:59:60.000 UTC');
		expect(utc(leap, 0.5)).toBe('2016-12-31 23:59:60.500 UTC');
		expect(utc(leap, 1)).toBe('2017-01-01 00:00:00.000 UTC');
	});

	test('a UTC date round-trips through its epoch, across a day without a leap second', () => {
		const e = epochFromUtc({ year: 2026, month: 10, day: 17, hour: 21, minute: 30, second: 5.25 });
		expect(utc(e, 0)).toBe('2026-10-17 21:30:05.250 UTC');
		expect(utc(e, 3 * 3600)).toBe('2026-10-18 00:30:05.250 UTC');
		expect(e.fraction).toBeGreaterThanOrEqual(0);
		expect(e.fraction).toBeLessThan(1);
	});

	test('a Unix time gives the same epoch as its UTC fields', () => {
		const ms = Date.UTC(2026, 9, 17, 6, 0, 0, 125);
		expect(utc(epochFromUnixMs(ms), 0)).toBe('2026-10-17 06:00:00.125 UTC');
	});

	test('ten years of t keep millisecond precision (days and seconds, never one float)', () => {
		const e = epochFromUtc({ year: 2030, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
		const tenYears = (daysFromCivil(2040, 1, 1) - daysFromCivil(2030, 1, 1)) * 86_400;
		expect(utc(e, tenYears + 0.001)).toBe('2040-01-01 00:00:00.001 UTC');
	});

	test('the civil day count matches Date and round-trips', () => {
		for (const [y, m, d] of [
			[1970, 1, 1],
			[2000, 2, 29],
			[2100, 3, 1],
			[1600, 12, 31]
		] as const) {
			const n = daysFromCivil(y, m, d);
			expect(n).toBe(Date.UTC(y, m - 1, d) / 86_400_000);
			expect(civilFromDays(n)).toEqual({ year: y, month: m, day: d });
		}
	});
});

const home = (extra: Partial<BodyDefinition> = {}): BodyDefinition => ({
	id: 'stock.home',
	mass: 3.5316e12 / GRAVITATIONAL_CONSTANT,
	radius: 600_000,
	rotationPeriod: 21_600,
	...extra
});

describe('fictional calendar', () => {
	test('a root home body (the stock shape until plan 122): day = rotation, no year', () => {
		const cal = calendarOf([home()]);
		expect(cal).toEqual({
			kind: 'fictional',
			home: 'stock.home',
			dayLength: 21_600,
			yearLength: null
		});
		expect(formatDate(cal, J2000, 0).text).toBe('Day 1, 00:00:00');
		expect(formatDate(cal, J2000, 21_600 * 3 + 3_725).text).toBe('Day 4, 01:02:05');
	});

	test('a home body that orbits a star: year = orbital period, day = solar day', () => {
		const sun: BodyDefinition = {
			id: 'test.sun',
			mass: 1.7565e28,
			radius: 2.6e8,
			rotationPeriod: 432_000,
			calendar: { kind: 'fictional', home: 'stock.home' }
		};
		const a = 1.36e10;
		const planet = home({
			parent: 'test.sun',
			orbit: { a, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
		});
		const cal = calendarOf([sun, planet]);
		if (cal.kind !== 'fictional') throw new Error('expected fictional');
		const year = 2 * Math.PI * Math.sqrt(a ** 3 / (GRAVITATIONAL_CONSTANT * sun.mass));
		expect(cal.yearLength).toBeCloseTo(year, 6);
		expect(cal.dayLength).toBeCloseTo(1 / (1 / 21_600 - 1 / year), 6);
		const d = formatDate(cal, J2000, year + cal.dayLength + 60);
		expect(d.year).toBe(2);
		expect(d.day).toBe(2);
		expect(d.text).toBe('Year 2, day 2, 00:01:00');
	});

	test('a root body may declare the Gregorian calendar', () => {
		expect(calendarOf([home({ calendar: { kind: 'gregorian-utc' } })])).toEqual(UTC);
	});

	test('a calendar naming a body that is not loaded is refused', () => {
		expect(() => calendarOf([home({ calendar: { kind: 'fictional', home: 'x.none' } })])).toThrow(
			/x.none/
		);
	});
});
