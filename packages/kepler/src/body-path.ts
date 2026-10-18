/**
 * Body path models (plan 123, ADR 0183): a fixed conic, elements with linear rates (JPL
 * "Approximate Positions of the Planets", Level A) and periodic series (the Astronomical Almanac's
 * low-precision Moon). State relative to the parent, in the game frame (+Y pole, ADR 0007).
 */
import { fromStateVector, toStateVector, type StateVector } from './convert.ts';
import type { OrbitalElements } from './elements.ts';
import type { Vec3 } from './vec3.ts';

/** Seconds in a Julian century. */
export const SECONDS_PER_CENTURY = 36_525 * 86_400;
/** Astronomical unit, m (IAU 2012). */
export const AU = 149_597_870_700;
const DEG = Math.PI / 180;

/** Rates per second of the elements of a `kepler-rates` path (ADR 0183 point 2). */
export interface ElementRates {
	a?: number;
	e?: number;
	i?: number;
	raan?: number;
	argp?: number;
	/** Rate of the mean anomaly, rad/s. */
	meanMotion: number;
}

/** A periodic term: amplitude (deg), phase (deg), frequency (deg per Julian century). */
export type SeriesTerm = readonly [number, number, number];

/** Ecliptic longitude, latitude and parallax series of a body seen from its parent (ADR 0183 point 3). */
export interface BodySeries {
	longitude: { base: readonly [number, number]; terms: readonly SeriesTerm[] };
	latitude: { terms: readonly SeriesTerm[] };
	parallax: { base: number; terms: readonly SeriesTerm[] };
	/** The parent's radius the parallax is measured against, m. */
	parentRadius: number;
}

export type BodyPath =
	| { model: 'kepler'; elements: OrbitalElements }
	| { model: 'kepler-rates'; elements: OrbitalElements; rates: ElementRates }
	| { model: 'series'; elements: OrbitalElements; series: BodySeries }
	/** A tabulated path (plan 125, ADR 0122 point 7): the DE440 asset, as a function of seconds from J2000. */
	| { model: 'table'; elements: OrbitalElements; at: (tau: number) => StateVector };

/** The osculating elements of a `kepler-rates` path at `tau` (seconds from J2000), epoch `tau`. */
function ratedElements(el: OrbitalElements, rates: ElementRates, tau: number): OrbitalElements {
	const dt = tau - el.epoch;
	return {
		a: el.a + (rates.a ?? 0) * dt,
		e: el.e + (rates.e ?? 0) * dt,
		i: el.i + (rates.i ?? 0) * dt,
		raan: el.raan + (rates.raan ?? 0) * dt,
		argp: el.argp + (rates.argp ?? 0) * dt,
		m0: el.m0 + rates.meanMotion * dt,
		epoch: tau
	};
}

const sum = (terms: readonly SeriesTerm[], T: number, f: (x: number) => number): number =>
	terms.reduce((s, [amp, phase, freq]) => s + amp * f((phase + freq * T) * DEG), 0);

/** Position of a `series` path at `tau` (seconds from J2000), game frame. */
function seriesPosition(s: BodySeries, tau: number): Vec3 {
	const T = tau / SECONDS_PER_CENTURY;
	const lon =
		(s.longitude.base[0] + s.longitude.base[1] * T + sum(s.longitude.terms, T, Math.sin)) * DEG;
	const lat = sum(s.latitude.terms, T, Math.sin) * DEG;
	const par = (s.parallax.base + sum(s.parallax.terms, T, Math.cos)) * DEG;
	const r = s.parentRadius / Math.sin(par);
	const x = r * Math.cos(lat) * Math.cos(lon);
	const y = r * Math.cos(lat) * Math.sin(lon);
	const z = r * Math.sin(lat);
	// ecliptic (x, y, z) → game (x, z, −y) (ADR 0183 point 4)
	return { x, y: z, z: -y };
}

/** Half the central-difference baseline of a series velocity, s. */
const SERIES_DT = 30;

/**
 * State of a path relative to its parent. `t` is the world's time for `kepler` and seconds from
 * J2000 for the other models (the caller adds the world's epoch, ADR 0183 point 5).
 */
export function bodyPathState(path: BodyPath, mu: number, t: number): StateVector {
	switch (path.model) {
		case 'kepler':
			return toStateVector(path.elements, mu, t);
		case 'kepler-rates':
			return toStateVector(ratedElements(path.elements, path.rates, t), mu, t);
		case 'table':
			return path.at(t);
		case 'series': {
			const a = seriesPosition(path.series, t - SERIES_DT);
			const b = seriesPosition(path.series, t + SERIES_DT);
			const k = 1 / (2 * SERIES_DT);
			return {
				r: seriesPosition(path.series, t),
				v: { x: (b.x - a.x) * k, y: (b.y - a.y) * k, z: (b.z - a.z) * k }
			};
		}
	}
}

/** The conic a path is on at `t` (same time axis as `bodyPathState`), epoch `t`. */
export function osculatingElements(path: BodyPath, mu: number, t: number): OrbitalElements {
	if (path.model === 'kepler') return path.elements;
	if (path.model === 'kepler-rates') return ratedElements(path.elements, path.rates, t);
	const s = bodyPathState(path, mu, t);
	return fromStateVector(s.r, s.v, mu, t);
}

/** A row of JPL Table 1: values and rates per Julian century (au, deg). */
export interface LevelARow {
	a: readonly [number, number];
	e: readonly [number, number];
	I: readonly [number, number];
	L: readonly [number, number];
	/** Longitude of perihelion ϖ. */
	peri: readonly [number, number];
	/** Longitude of the ascending node Ω. */
	node: readonly [number, number];
}

/** A JPL Level A row as a `kepler-rates` path's elements (epoch J2000) and SI rates (ADR 0183 point 2). */
export function levelAElements(row: LevelARow): { elements: OrbitalElements; rates: ElementRates } {
	const perSec = 1 / SECONDS_PER_CENTURY;
	return {
		elements: {
			a: row.a[0] * AU,
			e: row.e[0],
			i: row.I[0] * DEG,
			raan: row.node[0] * DEG,
			argp: (row.peri[0] - row.node[0]) * DEG,
			m0: (row.L[0] - row.peri[0]) * DEG,
			epoch: 0
		},
		rates: {
			a: row.a[1] * AU * perSec,
			e: row.e[1] * perSec,
			i: row.I[1] * DEG * perSec,
			raan: row.node[1] * DEG * perSec,
			argp: (row.peri[1] - row.node[1]) * DEG * perSec,
			meanMotion: (row.L[1] - row.peri[1]) * DEG * perSec
		}
	};
}
