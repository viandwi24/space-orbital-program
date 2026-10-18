/**
 * The n-body path of a vessel (plan 125, ADR 0122 point 6): the same segments as the patched-conic
 * prediction, one per frame and sample interval, each starting from the integrated state, so every
 * consumer that propagates a segment's entry (map, rendezvous aids) stays on the integrated path.
 * Frames switch at the same sphere boundaries as the patched path (ADR 0051), as coordinates only.
 */
import { bodyStateAt } from './body-state.ts';
import { fromStateVector, type StateVector } from './convert.ts';
import { KeplerError, type OrbitalElements } from './elements.ts';
import { integrateNBody, type NBodyField } from './nbody.ts';
import type { PatchedBody, PatchedOptions, PatchedSegment, PatchedStart } from './patched.ts';
import { findCrossing, intoChildFrame, intoParentFrame } from './soi.ts';
import { length, sub, type Vec3 } from './vec3.ts';

/** The field of `id`'s frame: its own μ and every other body, positioned relative to it. */
export function nBodyFieldOf(bodies: readonly PatchedBody[], id: string): NBodyField {
	const self = bodies.find((b) => b.id === id);
	if (!self) throw new RangeError(`nBodyFieldOf: unknown body "${id}"`);
	return {
		mu: self.mu,
		perturbers: bodies
			.filter((b) => b.id !== id)
			.map((b) => ({
				mu: b.mu,
				at: (t: number): Vec3 =>
					sub(bodyStateAt(bodies, b.id, t, 'system').r, bodyStateAt(bodies, id, t, 'system').r)
			}))
	};
}

/** Predict the n-body path of `start` for `horizon` seconds (ADR 0122 point 6). */
export function predictNBody(
	bodies: readonly PatchedBody[],
	start: PatchedStart,
	horizon: number,
	options: PatchedOptions = {}
): PatchedSegment[] {
	const byId = new Map(bodies.map((b) => [b.id, b]));
	const need = (id: string): PatchedBody => {
		const b = byId.get(id);
		if (!b) throw new RangeError(`predictNBody: unknown body "${id}"`);
		return b;
	};
	const kids = (id: string): PatchedBody[] =>
		[...bodies].filter((b) => b.parent === id).sort((x, y) => (x.id < y.id ? -1 : 1));
	const stateIn = (b: PatchedBody, t: number): StateVector =>
		bodyStateAt(bodies, b.id, t, 'parent');
	const maxStep = options.maxStep ?? 600;
	const end = start.t + horizon;
	const maxSegments = options.maxSegments ?? Math.ceil(horizon / maxStep) + 64;
	const out: PatchedSegment[] = [];
	let body = need(start.body);
	let field = nBodyFieldOf(bodies, body.id);
	let state: StateVector = { r: start.r, v: start.v };
	let t = start.t;
	let h: number | undefined;
	const advance = (from: StateVector, t0: number, t1: number): StateVector => {
		const r = integrateNBody(field, from, t0, t1, h ? { step: h } : {});
		h = r.h;
		return { r: r.r, v: r.v };
	};

	while (out.length < maxSegments && t < end) {
		const here = body;
		const children = kids(here.id);
		const past = (s: StateVector, tau: number): PatchedBody | 'parent' | undefined => {
			if (here.parent && length(s.r) > here.soi) return 'parent';
			for (const c of children) if (length(sub(s.r, stateIn(c, tau).r)) < c.soi) return c;
			return undefined;
		};
		let d = here.parent ? here.soi - length(state.r) : Infinity;
		let speed = length(state.v);
		for (const c of children) {
			const cs = stateIn(c, t);
			d = Math.min(d, length(sub(state.r, cs.r)) - c.soi);
			speed = Math.max(speed, length(sub(state.v, cs.v)));
		}
		const step = Math.min(maxStep, Math.max(0.5, d / (2 * (speed + 1e-9))), end - t);
		const t1 = t + step;
		const entry = state;
		let next = advance(entry, t, t1);
		let tx = t1;
		let hit = past(next, t1);
		const radius = here.radius ?? 0;
		let impact = radius > 0 && length(next.r) < radius;
		if (hit !== undefined || impact) {
			const t0 = t;
			const crossed = (tau: number): number => {
				const s = integrateNBody(field, entry, t0, tau).r;
				if (impact) return radius - length(s);
				return past({ r: s, v: entry.v }, tau) === undefined ? -1 : 1;
			};
			tx = findCrossing(crossed, t0, t1);
			const s = integrateNBody(field, entry, t0, tx);
			next = { r: s.r, v: s.v };
			if (!impact) hit = past(next, tx);
		}
		let elements: OrbitalElements | undefined;
		try {
			elements = fromStateVector(entry.r, entry.v, here.mu, t);
		} catch (e) {
			if (!(e instanceof KeplerError)) throw e;
		}
		const segment: PatchedSegment = {
			body: here.id,
			t0: t,
			t1: tx,
			entry,
			exit: next,
			bodyOffset: bodyStateAt(bodies, here.id, t, 'system').r,
			end: impact ? 'impact' : hit !== undefined ? 'transition' : tx >= end ? 'horizon' : 'sample'
		};
		if (elements) segment.elements = elements;
		out.push(segment);
		if (impact) break;
		t = tx;
		state = next;
		if (hit !== undefined) {
			const target = hit === 'parent' ? need(here.parent!) : hit;
			segment.next = target.id;
			const child = hit === 'parent' ? here : hit;
			const cs = stateIn(child, t);
			state = hit === 'parent' ? intoParentFrame(state, cs) : intoChildFrame(state, cs);
			body = target;
			field = nBodyFieldOf(bodies, body.id);
			h = undefined;
		}
	}
	return out;
}
