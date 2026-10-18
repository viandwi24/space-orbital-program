/**
 * Contact timeline (plan 118, ADR 0163 point 2): when two nodes are linked over the next hours,
 * sampled as the sim samples its network and each change dated by bisection.
 */
import { PLAN_SAMPLE, PLAN_TOLERANCE, linkedAt, type PlanNode, type PlanWorld } from './geometry';

export interface ContactWindow {
	/** s, sim time; `from` when the pair is linked at the start. */
	start: number;
	/** s, sim time; `to` when still linked at the end. */
	end: number;
	/** The window runs on past the horizon. */
	open: boolean;
}

export interface ContactTimeline {
	a: string;
	b: string;
	from: number;
	to: number;
	windows: ContactWindow[];
	/** Changes in time order: up (true) or down (false). */
	events: Array<{ time: number; up: boolean }>;
	/** Fraction of the span the pair is linked. */
	linkedFraction: number;
}

/** The time in (lo, hi] at which the link stops being `was`. */
function bisect(
	world: PlanWorld,
	a: PlanNode,
	b: PlanNode,
	lo: number,
	hi: number,
	was: boolean
): number {
	while (hi - lo > PLAN_TOLERANCE) {
		const mid = (lo + hi) / 2;
		if (linkedAt(world, a, b, mid) === was) lo = mid;
		else hi = mid;
	}
	return hi;
}

export function contactTimeline(
	world: PlanWorld,
	a: PlanNode,
	b: PlanNode,
	from: number,
	horizon: number,
	sample = PLAN_SAMPLE
): ContactTimeline {
	const to = from + horizon;
	const events: ContactTimeline['events'] = [];
	let prev = linkedAt(world, a, b, from);
	let prevT = from;
	for (let k = 1; ; k++) {
		const t = Math.min(to, from + k * sample);
		const now = linkedAt(world, a, b, t);
		if (now !== prev) events.push({ time: bisect(world, a, b, prevT, t, prev), up: now });
		prev = now;
		prevT = t;
		if (t >= to) break;
	}
	const windows: ContactWindow[] = [];
	let start: number | null = linkedAt(world, a, b, from) ? from : null;
	for (const e of events) {
		if (e.up) start = e.time;
		else if (start !== null) {
			windows.push({ start, end: e.time, open: false });
			start = null;
		}
	}
	if (start !== null) windows.push({ start, end: to, open: true });
	const linked = windows.reduce((sum, w) => sum + (w.end - w.start), 0);
	return {
		a: a.id,
		b: b.id,
		from,
		to,
		windows,
		events,
		linkedFraction: horizon > 0 ? linked / horizon : 0
	};
}
