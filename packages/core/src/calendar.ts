/**
 * World epoch and calendars (plan 081, ADRs 0103 and 0141). Simulation time `t` stays seconds since
 * the world's start; the world's epoch says which instant `t = 0` is, as whole SI days and a fraction
 * from J2000.0 (2000-01-01 12:00:00 TT, JD 2451545.0) on the system's time scale. Every conversion
 * carries (whole days, seconds) and normalises, so `t` is never added to a Julian date in one float.
 * Pure functions: the sim never reads a clock; hosts call these to show and answer dates.
 */
import type { BodyDefinition } from './definitions.ts';
import { GRAVITATIONAL_CONSTANT } from './units.ts';
import type { WorldInfo } from './world.ts';

/** The instant of `t = 0`: whole days and a fraction in [0, 1) from J2000.0 (ADR 0141 point 2). */
export type Epoch = WorldInfo['epoch'];

/** A system's calendar, declared on its root body (ADR 0141 point 1). */
export type CalendarSpec = { kind: 'gregorian-utc' } | { kind: 'fictional'; home: string };

export const SECONDS_PER_DAY = 86_400;
/** Julian date of J2000.0 (TT), the origin of `Epoch.day`. */
export const J2000_JD = 2_451_545;
/** TT − TAI, s (definition of TT). */
export const TT_MINUS_TAI = 32.184;

/**
 * TAI − UTC from 00:00 UTC of each date (IERS `Leap_Second.dat`, Bulletin C 72, July 2026; valid to
 * 2027-06-28; `docs/research/time-scales.md`). Each step is a 23:59:60 the day before.
 */
export const LEAP_SECONDS: readonly (readonly [
	year: number,
	month: number,
	taiMinusUtc: number
])[] = [
	[1972, 1, 10],
	[1972, 7, 11],
	[1973, 1, 12],
	[1974, 1, 13],
	[1975, 1, 14],
	[1976, 1, 15],
	[1977, 1, 16],
	[1978, 1, 17],
	[1979, 1, 18],
	[1980, 1, 19],
	[1981, 7, 20],
	[1982, 7, 21],
	[1983, 7, 22],
	[1985, 7, 23],
	[1988, 1, 24],
	[1990, 1, 25],
	[1991, 1, 26],
	[1992, 7, 27],
	[1993, 7, 28],
	[1994, 7, 29],
	[1996, 1, 30],
	[1997, 7, 31],
	[1999, 1, 32],
	[2006, 1, 33],
	[2009, 1, 34],
	[2012, 7, 35],
	[2015, 7, 36],
	[2017, 1, 37]
];

/** An instant as whole days plus seconds in [0, 86 400). */
export interface DaySeconds {
	day: number;
	seconds: number;
}

const normalise = (day: number, seconds: number): DaySeconds => {
	const carry = Math.floor(seconds / SECONDS_PER_DAY);
	return { day: day + carry, seconds: seconds - carry * SECONDS_PER_DAY };
};

/** The instant `t` seconds after the epoch, as days and seconds from J2000.0 (noon). */
export const instantAt = (epoch: Epoch, t: number): DaySeconds =>
	normalise(epoch.day, epoch.fraction * SECONDS_PER_DAY + t);

/** Julian date of `t` on the system's scale: the whole day, the fraction, and both in one number for display. */
export function julianDate(
	epoch: Epoch,
	t: number
): { day: number; fraction: number; value: number } {
	const at = instantAt(epoch, t);
	const fraction = at.seconds / SECONDS_PER_DAY;
	return { day: J2000_JD + at.day, fraction, value: J2000_JD + at.day + fraction };
}

// --- proleptic Gregorian day numbers (Hinnant, `days_from_civil` / `civil_from_days`) ---------------

/** Days since 1970-01-01 of a civil date. */
export function daysFromCivil(year: number, month: number, day: number): number {
	const y = month <= 2 ? year - 1 : year;
	const era = Math.floor(y / 400);
	const yoe = y - era * 400;
	const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146_097 + doe - 719_468;
}

/** Civil date of a day count since 1970-01-01. */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
	const z = days + 719_468;
	const era = Math.floor(z / 146_097);
	const doe = z - era * 146_097;
	const yoe = Math.floor(
		(doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365
	);
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
	const mp = Math.floor((5 * doy + 2) / 153);
	const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
	const month = mp < 10 ? mp + 3 : mp - 9;
	return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Day 0 of the midnight-based counts below: 2000-01-01. */
const DAY_2000 = daysFromCivil(2000, 1, 1);
/** Leap-second steps as (UTC day since 2000-01-01, TAI − UTC from that day). */
const STEPS = LEAP_SECONDS.map(([y, m, n]) => ({
	day: daysFromCivil(y, m, 1) - DAY_2000,
	offset: n
}));

/** TAI − UTC in force on a UTC day (counted from 2000-01-01); 10 s before 1972 (research note). */
function offsetOnUtcDay(day: number): number {
	let offset = STEPS[0]!.offset;
	for (const s of STEPS) if (s.day <= day) offset = s.offset;
	return offset;
}

/** Calendar fields of an instant. `second` is 60.x during an inserted leap second. */
export interface DateFields {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

/** UTC fields of the TT instant `t` after `epoch` (ADR 0141 point 4). */
export function utcFields(epoch: Epoch, t: number): DateFields {
	const tt = instantAt(epoch, t);
	// midnight-based TT label, then TAI
	const tai = normalise(tt.day, tt.seconds + SECONDS_PER_DAY / 2 - TT_MINUS_TAI);
	const since = (s: { day: number; offset: number }): number =>
		(tai.day - s.day) * SECONDS_PER_DAY + tai.seconds - s.offset;
	let k = -1;
	for (let i = 0; i < STEPS.length; i++) if (since(STEPS[i]!) >= 0) k = i;
	const next = STEPS[k + 1];
	if (next && since(next) >= -1) {
		// inside the inserted second: 23:59:60 of the day before the step
		const date = civilFromDays(next.day - 1 + DAY_2000);
		return { ...date, hour: 23, minute: 59, second: 60 + since(next) + 1 };
	}
	const offset = k < 0 ? STEPS[0]!.offset : STEPS[k]!.offset;
	const utc = normalise(tai.day, tai.seconds - offset);
	return { ...civilFromDays(utc.day + DAY_2000), ...clock(utc.seconds) };
}

const clock = (seconds: number): { hour: number; minute: number; second: number } => {
	const hour = Math.floor(seconds / 3600);
	const minute = Math.floor((seconds - hour * 3600) / 60);
	return { hour, minute, second: seconds - hour * 3600 - minute * 60 };
};

/** The epoch of a UTC date and time (`second` may be 60 in a leap second); for a world's start date. */
export function epochFromUtc(f: DateFields): Epoch {
	const day = daysFromCivil(f.year, f.month, f.day) - DAY_2000;
	const tai = f.hour * 3600 + f.minute * 60 + f.second + offsetOnUtcDay(day);
	const at = normalise(day, tai + TT_MINUS_TAI - SECONDS_PER_DAY / 2);
	return { day: at.day, fraction: at.seconds / SECONDS_PER_DAY };
}

/** The epoch of a Unix time in milliseconds (the host's clock, read once at world creation; ADR 0103 point 2). */
export function epochFromUnixMs(ms: number): Epoch {
	const days = Math.floor(ms / 86_400_000);
	const seconds = (ms - days * 86_400_000) / 1000;
	const date = civilFromDays(days);
	return epochFromUtc({ ...date, ...clock(seconds) });
}

// --- calendars --------------------------------------------------------------------------------------

/** A calendar ready to format: Gregorian UTC, or fictional with its day and year in seconds. */
export type Calendar =
	| { kind: 'gregorian-utc' }
	| { kind: 'fictional'; home: string; dayLength: number; yearLength: number | null };

/**
 * The calendar of a system from its bodies: the root body's `calendar`, else fictional from the root.
 * A fictional day is the home body's solar day; its year is the home body's orbital period, or none
 * when the home body orbits nothing (ADR 0141 point 3).
 */
export function calendarOf(bodies: readonly BodyDefinition[]): Calendar {
	const root = bodies.find((b) => b.parent === undefined);
	if (!root) throw new Error('calendarOf: no root body');
	const spec: CalendarSpec = root.calendar ?? { kind: 'fictional', home: root.id };
	if (spec.kind === 'gregorian-utc') return spec;
	const home = bodies.find((b) => b.id === spec.home);
	if (!home) throw new Error(`calendarOf: home body ${spec.home} is not loaded`);
	const parent = home.parent === undefined ? undefined : bodies.find((b) => b.id === home.parent);
	if (!parent || !home.orbit) {
		return { kind: 'fictional', home: home.id, dayLength: home.rotationPeriod, yearLength: null };
	}
	const year = 2 * Math.PI * Math.sqrt(home.orbit.a ** 3 / (GRAVITATIONAL_CONSTANT * parent.mass));
	const rate = 1 / home.rotationPeriod - 1 / year;
	return {
		kind: 'fictional',
		home: home.id,
		dayLength: rate > 0 ? 1 / rate : home.rotationPeriod,
		yearLength: year
	};
}

/** A formatted date: the text the HUD and `date()` show, the Julian date and the fields. */
export interface CalendarDate {
	calendar: Calendar['kind'];
	text: string;
	julianDate: number;
	/** Gregorian: calendar year; fictional: year from 1, or null without a year. */
	year: number | null;
	/** Gregorian only. */
	month: number | null;
	/** Day of the month (Gregorian), of the year, or since the start (fictional), from 1. */
	day: number;
	hour: number;
	minute: number;
	second: number;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Seconds to `ss.sss` without ever showing 60.000 for 59.9996 (leap seconds pass 60 in). */
function splitSeconds(second: number, max: number): [whole: number, ms: number] {
	const ms = Math.min(Math.round(second * 1000), max * 1000 + 999);
	return [Math.floor(ms / 1000), ms % 1000];
}

/** The date `t` seconds after `epoch` in a calendar. */
export function formatDate(calendar: Calendar, epoch: Epoch, t: number): CalendarDate {
	const julian = julianDate(epoch, t).value;
	if (calendar.kind === 'gregorian-utc') {
		let f = utcFields(epoch, t);
		const leap = f.second >= 60;
		let [s, ms] = splitSeconds(f.second, leap ? 60 : 59);
		if (!leap && Math.round(f.second * 1000) >= 60_000) {
			// rounding reached the next minute: format the instant a millisecond later instead
			f = utcFields(epoch, t + 0.001);
			[s, ms] = splitSeconds(f.second, 59);
		}
		const text = `${f.year}-${pad(f.month)}-${pad(f.day)} ${pad(f.hour)}:${pad(f.minute)}:${pad(s)}.${pad(ms, 3)} UTC`;
		return {
			calendar: 'gregorian-utc',
			text,
			julianDate: julian,
			year: f.year,
			month: f.month,
			day: f.day,
			hour: f.hour,
			minute: f.minute,
			second: f.second
		};
	}
	const at = instantAt(epoch, t);
	const total = at.day * SECONDS_PER_DAY + at.seconds;
	const { dayLength, yearLength } = calendar;
	const yearIndex = yearLength === null ? null : Math.floor(total / yearLength);
	const inYear = yearIndex === null ? total : total - yearIndex * (yearLength as number);
	const dayIndex = Math.floor(inYear / dayLength);
	// to the millisecond first, so 59.9999… s of float error reads as the next second
	const inDay = Math.min(
		Math.round((inYear - dayIndex * dayLength) * 1000) / 1000,
		dayLength - 0.001
	);
	const { hour, minute, second } = clock(inDay);
	const time = `${pad(hour)}:${pad(minute)}:${pad(Math.floor(second))}`;
	const text =
		yearIndex === null
			? `Day ${dayIndex + 1}, ${time}`
			: `Year ${yearIndex + 1}, day ${dayIndex + 1}, ${time}`;
	return {
		calendar: 'fictional',
		text,
		julianDate: julian,
		year: yearIndex === null ? null : yearIndex + 1,
		month: null,
		day: dayIndex + 1,
		hour,
		minute,
		second
	};
}
