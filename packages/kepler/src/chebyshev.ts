/**
 * Chebyshev ephemeris records (plan 125, ADR 0122 point 1): a body's position over a time span as
 * three Chebyshev series, evaluated the way JPL's readers evaluate DE files (position from the
 * series, velocity from its derivative). Pure float64.
 */
import type { StateVector } from './convert.ts';

export interface ChebyshevRecord {
	/** Span of the record, s (on the time the series is written in). */
	start: number;
	end: number;
	/** Coefficients of x, y and z, m; the same length for the three. */
	x: readonly number[];
	y: readonly number[];
	z: readonly number[];
}

/** Values T₀(τ)…Tₙ₋₁(τ) and their derivatives d/dτ, for τ in [−1, 1]. */
function basis(n: number, tau: number): { t: number[]; d: number[] } {
	const t = new Array<number>(n).fill(0);
	const d = new Array<number>(n).fill(0);
	t[0] = 1;
	if (n > 1) {
		t[1] = tau;
		d[1] = 1;
	}
	for (let k = 2; k < n; k++) {
		t[k] = 2 * tau * t[k - 1]! - t[k - 2]!;
		d[k] = 2 * t[k - 1]! + 2 * tau * d[k - 1]! - d[k - 2]!;
	}
	return { t, d };
}

/** Position and velocity of a record at `time` (clamped to its span). */
export function chebyshevState(record: ChebyshevRecord, time: number): StateVector {
	const half = (record.end - record.start) / 2;
	const tau = Math.min(1, Math.max(-1, (time - record.start) / half - 1));
	const { t, d } = basis(record.x.length, tau);
	const sum = (c: readonly number[], b: number[]): number => {
		let s = 0;
		for (let k = c.length - 1; k >= 0; k--) s += c[k]! * b[k]!;
		return s;
	};
	return {
		r: { x: sum(record.x, t), y: sum(record.y, t), z: sum(record.z, t) },
		v: { x: sum(record.x, d) / half, y: sum(record.y, d) / half, z: sum(record.z, d) / half }
	};
}

/** The record covering `time` in a sorted list (binary search); the first or last outside the span. */
export function recordAt(records: readonly ChebyshevRecord[], time: number): ChebyshevRecord {
	let lo = 0;
	let hi = records.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (records[mid]!.end < time) lo = mid + 1;
		else hi = mid;
	}
	return records[lo]!;
}

/**
 * Fit a record to a function on its span at the Chebyshev nodes (the interpolant of degree n − 1):
 * how tools pack an ephemeris and how the tests check the evaluator.
 */
export function fitChebyshev(
	f: (time: number) => { x: number; y: number; z: number },
	start: number,
	end: number,
	n: number
): ChebyshevRecord {
	const half = (end - start) / 2;
	const nodes = Array.from({ length: n }, (_, j) => Math.cos((Math.PI * (j + 0.5)) / n));
	const values = nodes.map((tau) => f(start + (tau + 1) * half));
	const coeff = (pick: (v: { x: number; y: number; z: number }) => number): number[] =>
		Array.from({ length: n }, (_, k) => {
			let s = 0;
			for (let j = 0; j < n; j++) s += pick(values[j]!) * Math.cos((Math.PI * k * (j + 0.5)) / n);
			return ((k === 0 ? 1 : 2) / n) * s;
		});
	return { start, end, x: coeff((v) => v.x), y: coeff((v) => v.y), z: coeff((v) => v.z) };
}
