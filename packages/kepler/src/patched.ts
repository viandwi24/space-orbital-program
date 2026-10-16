/**
 * Patched-conic prediction (plan 044, for the map view and plan 045): the path of a vessel from a
 * state, as a list of conic segments, one per sphere of influence it passes through. Uses the same
 * switching rule as the sim (ADR 0051): leave a body for its parent when `|r| > soi`, enter a child
 * when the distance to it is below its `soi`; the crossing time is bisected, the state is translated
 * by the child's state at that time. Pure functions of the inputs, so a prediction made with the sim's
 * body data agrees with what the sim then does.
 */
import { KeplerError, type OrbitalElements } from './elements.ts';
import { fromStateVector } from './convert.ts';
import { propagate, propagateUniversal } from './propagate.ts';
import type { StateVector } from './convert.ts';
import { intoChildFrame, intoParentFrame, findCrossing } from './soi.ts';
import { add, length, sub, type Vec3 } from './vec3.ts';

/** What the prediction needs to know about a body. */
export interface PatchedBody {
	id: string;
	/** Gravitational parameter, m³/s². */
	mu: number;
	/** Radius of the sphere of influence around the parent, m (Infinity for the root). */
	soi: number;
	/** Surface radius, m; a path that falls below it ends the prediction ('impact'). */
	radius?: number;
	parent?: string;
	/** Orbit around the parent (absent for the root). */
	orbit?: OrbitalElements;
}

export interface PatchedStart {
	body: string;
	/** State relative to `body`, m and m/s. */
	r: Vec3;
	v: Vec3;
	t: number;
}

export interface PatchedSegment {
	body: string;
	t0: number;
	t1: number;
	/** State relative to `body` at `t0` and `t1`. */
	entry: StateVector;
	exit: StateVector;
	/** Elements of the conic at `t0`; absent for near-parabolic and radial states. */
	elements?: OrbitalElements;
	/** Position of the body's centre in the system frame at `t0` (the root's centre). */
	bodyOffset: Vec3;
	/** Why the segment ends: a change of sphere (`next` names it), the horizon, or an impact. */
	end: 'transition' | 'horizon' | 'impact';
	next?: string;
}

export interface PatchedOptions {
	/** Segments at most (default 8). */
	maxSegments?: number;
	/** Longest sample step, s (default 600). */
	maxStep?: number;
}

const ORIGIN: StateVector = { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } };

/** Predict the path of `start` for `horizon` seconds through the spheres of influence of `bodies`. */
export function predictPatchedConics(
	bodies: readonly PatchedBody[],
	start: PatchedStart,
	horizon: number,
	options: PatchedOptions = {}
): PatchedSegment[] {
	const byId = new Map(bodies.map((b) => [b.id, b]));
	const children = new Map<string, PatchedBody[]>();
	for (const b of [...bodies].sort((x, y) => (x.id < y.id ? -1 : 1))) {
		if (b.parent === undefined) continue;
		children.set(b.parent, [...(children.get(b.parent) ?? []), b]);
	}
	const need = (id: string): PatchedBody => {
		const b = byId.get(id);
		if (!b) throw new RangeError(`predictPatchedConics: unknown body "${id}"`);
		return b;
	};
	/** State of `body` relative to its parent at `t`. */
	const stateIn = (body: PatchedBody, t: number): StateVector => {
		if (!body.parent || !body.orbit) return ORIGIN;
		return propagate(body.orbit, need(body.parent).mu, t);
	};
	const offsetOf = (body: PatchedBody, t: number): Vec3 => {
		let r: Vec3 = { x: 0, y: 0, z: 0 };
		for (let b: PatchedBody | undefined = body; b?.parent; b = byId.get(b.parent)) {
			r = add(r, stateIn(b, t).r);
		}
		return r;
	};

	const maxSegments = options.maxSegments ?? 8;
	const maxStep = options.maxStep ?? 600;
	const end = start.t + horizon;
	const out: PatchedSegment[] = [];
	let body = need(start.body);
	let entry: StateVector = { r: start.r, v: start.v };
	let t0 = start.t;

	while (out.length < maxSegments && t0 < end) {
		const here = body;
		const kids = children.get(here.id) ?? [];
		const at = (t: number): StateVector => propagateUniversal(entry.r, entry.v, here.mu, t - t0);
		/** Which boundary the state `s` at `t` is past: a child to enter, the parent to exit to, or none. */
		const past = (s: StateVector, t: number): PatchedBody | 'parent' | undefined => {
			if (here.parent && length(s.r) > here.soi) return 'parent';
			for (const c of kids) {
				if (length(sub(s.r, stateIn(c, t).r)) < c.soi) return c;
			}
			return undefined;
		};
		/** Distance to the nearest boundary, and the fastest relative speed that could close it. */
		const clearance = (s: StateVector, t: number): [number, number] => {
			let d = here.parent ? here.soi - length(s.r) : Infinity;
			let speed = length(s.v);
			for (const c of kids) {
				const cs = stateIn(c, t);
				d = Math.min(d, length(sub(s.r, cs.r)) - c.soi);
				speed = Math.max(speed, length(sub(s.v, cs.v)));
			}
			return [d, speed + 1e-9];
		};

		let t = t0;
		let state = entry;
		let hit: PatchedBody | 'parent' | undefined = past(state, t);
		let impact = false;
		const radius = here.radius ?? 0;
		while (t < end && hit === undefined && !impact) {
			const [d, speed] = clearance(state, t);
			const h = Math.min(maxStep, Math.max(0.5, d / (2 * speed)), end - t);
			const tNext = t + h;
			let next: StateVector;
			try {
				next = at(tNext);
			} catch (e) {
				if (e instanceof KeplerError) break;
				throw e;
			}
			hit = past(next, tNext);
			if (radius > 0 && length(next.r) < radius) impact = true;
			if (hit !== undefined || impact) {
				const crossed = (tau: number): number => {
					const s = at(tau);
					if (impact) return radius - length(s.r);
					const target = past(s, tau);
					return target === undefined ? -1 : 1;
				};
				const tx = findCrossing(crossed, t, tNext);
				t = tx;
				state = at(tx);
				if (!impact) hit = past(state, tx);
			} else {
				t = tNext;
				state = next;
			}
		}

		let elements: OrbitalElements | undefined;
		try {
			elements = fromStateVector(entry.r, entry.v, here.mu, t0);
		} catch (e) {
			if (!(e instanceof KeplerError)) throw e;
		}
		const segment: PatchedSegment = {
			body: here.id,
			t0,
			t1: t,
			entry,
			exit: state,
			bodyOffset: offsetOf(here, t0),
			end: impact ? 'impact' : hit !== undefined ? 'transition' : 'horizon'
		};
		if (elements) segment.elements = elements;
		if (hit !== undefined) {
			const target = hit === 'parent' ? need(here.parent!) : hit;
			segment.next = target.id;
			out.push(segment);
			const child = hit === 'parent' ? here : hit;
			const childState = stateIn(child, t);
			const converted =
				hit === 'parent' ? intoParentFrame(state, childState) : intoChildFrame(state, childState);
			body = target;
			entry = converted;
			t0 = t;
			continue;
		}
		out.push(segment);
		break;
	}
	return out;
}
