/**
 * Closest approach of two moving points over a time window (plan 035, ADR 0064). The points are
 * given as functions of time (any propagation: elements, patched conics), so the same search
 * serves vessel-to-vessel and vessel-to-body.
 */
import type { StateVector } from './convert.ts';
import { length, sub } from './vec3.ts';

export interface ClosestApproach {
	/** Time of the minimum distance, s (same clock as the callbacks). */
	t: number;
	/** Distance between the two points then, m. */
	distance: number;
	/** Speed of `to` relative to `from` then, m/s. */
	relativeSpeed: number;
}

const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * Minimum of |to(t) - from(t)| over `[t0, t1]`. The window is scanned at `samples + 1` equally
 * spaced times, the best one is bracketed by its neighbours and refined by golden-section search
 * (the distance is smooth with one minimum inside a bracket that narrow). A minimum at the end of
 * the window is returned as such. The search can miss a minimum that is shorter than a sample
 * interval wide; callers pick `samples` for their window.
 */
export function closestApproach(
	from: (t: number) => StateVector,
	to: (t: number) => StateVector,
	t0: number,
	t1: number,
	samples = 240
): ClosestApproach {
	if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) {
		throw new RangeError(`closestApproach: need finite t0 <= t1 (got ${t0}, ${t1})`);
	}
	const n = Math.max(2, Math.floor(samples));
	const distance = (t: number): number => length(sub(to(t).r, from(t).r));
	const h = (t1 - t0) / n;
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i <= n; i++) {
		const d = distance(t0 + i * h);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	let a = t0 + Math.max(0, best - 1) * h;
	let b = t0 + Math.min(n, best + 1) * h;
	let c = b - GOLDEN * (b - a);
	let d = a + GOLDEN * (b - a);
	let fc = distance(c);
	let fd = distance(d);
	for (let k = 0; k < 60 && b - a > 1e-6 * Math.max(1, Math.abs(b)); k++) {
		if (fc < fd) {
			b = d;
			d = c;
			fd = fc;
			c = b - GOLDEN * (b - a);
			fc = distance(c);
		} else {
			a = c;
			c = d;
			fc = fd;
			d = a + GOLDEN * (b - a);
			fd = distance(d);
		}
	}
	let t = 0.5 * (a + b);
	let dist = distance(t);
	// The bracket's ends can beat its middle when the minimum sits on the window's edge.
	for (const edge of [t0 + best * h]) {
		const e = distance(edge);
		if (e < dist) {
			dist = e;
			t = edge;
		}
	}
	return { t, distance: dist, relativeSpeed: length(sub(to(t).v, from(t).v)) };
}
