/**
 * N-body worlds in the sim (plan 125, ADR 0122): the field of a body's frame (every other body on
 * its path, positioned relative to it), numeric rails advanced by the kepler integrator, the
 * third-body pull on the flight bubble, and the warp budget.
 */
import type { Vec3 } from '@orbital/core';
import {
	hermiteState,
	integrateNBody,
	nBodyAcceleration,
	nBodyStep,
	thirdBodyAcceleration,
	type NBodyField
} from '@orbital/kepler';
import { systemPosition, type BodyRuntime } from './bodies.ts';
import type { SimCore } from './core.ts';

/** Highest warp an n-body world allows (ADR 0122 point 5); the budget may hold it lower. */
export const NBODY_MAX_WARP = 1e5;
/** Integrator work per real frame on the M5, ms (ADR 0122 point 5). */
export const NBODY_BUDGET_MS = 2;
/**
 * The same budget in acceleration evaluations per real frame (`Sim.step`), so the warp a world
 * reaches does not depend on the machine (a replay verifies, plan 131): an evaluation with the
 * stock bodies costs about 0.4 µs on the M5 (journal 125).
 */
export const NBODY_FRAME_EVALUATIONS = 5_000;

export const nBodyOn = (core: Pick<SimCore, 'info'>): boolean =>
	core.info.gravityModel === 'n-body';

const fields = new WeakMap<BodyRuntime, NBodyField>();

/** Every body of the tree `body` belongs to, in id order. */
function treeOf(body: BodyRuntime): BodyRuntime[] {
	let root = body;
	while (root.parent) root = root.parent;
	const out: BodyRuntime[] = [];
	const walk = (b: BodyRuntime): void => {
		out.push(b);
		for (const c of b.children) walk(c);
	};
	walk(root);
	return out.sort((a, b) => (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0));
}

/** The n-body field of `body`'s frame (cached per body). */
export function fieldOf(body: BodyRuntime): NBodyField {
	let field = fields.get(body);
	if (!field) {
		const others = treeOf(body).filter((b) => b !== body && !(b.def.star && b.mu === 0));
		field = {
			mu: body.mu,
			perturbers: others.map((b) => ({
				mu: b.mu,
				at: (t: number): Vec3 => {
					const p = systemPosition(b, t);
					const q = systemPosition(body, t);
					return { x: p.x - q.x, y: p.y - q.y, z: p.z - q.z };
				}
			}))
		};
		fields.set(body, field);
	}
	return field;
}

/** Numeric rails (ADR 0122 point 8): the state, its time and the integrator's next step. */
export interface NumericRails {
	kind: 'numeric';
	r: Vec3;
	v: Vec3;
	t0: number;
	h: number;
}

/** Evaluations spent by numeric rails since the counter was read (the warp budget's measure). */
let spent = 0;
/** Every evaluation since the sim started (diagnostics and the journal's numbers). */
export let totalEvaluations = 0;
export const takeEvaluations = (): number => {
	const n = spent;
	spent = 0;
	return n;
};

/**
 * The step the rails take next from their anchor (ADR 0122 point 3, dense output): one accepted
 * Bulirsch–Stoer step, cached per rails record. Recomputed from the anchor after a resume, to the
 * bit, so the save carries the anchor and the step size only.
 */
interface NextStep {
	t1: number;
	r: Vec3;
	v: Vec3;
	acc0: Vec3;
	acc1: Vec3;
	next: number;
}
const steps = new WeakMap<NumericRails, NextStep>();

function nextStep(body: BodyRuntime, rails: NumericRails): NextStep {
	let s = steps.get(rails);
	if (!s) {
		const field = fieldOf(body);
		const out = nBodyStep(field, rails, rails.t0, rails.h);
		spent += out.evaluations + 2;
		totalEvaluations += out.evaluations + 2;
		const t1 = rails.t0 + out.step;
		s = {
			t1,
			r: out.r,
			v: out.v,
			acc0: nBodyAcceleration(field, rails.t0, rails.r),
			acc1: nBodyAcceleration(field, t1, out.r),
			next: out.next
		};
		steps.set(rails, s);
	}
	return s;
}

/** Advance numeric rails to the last step boundary at or before `t` (the trajectory is these steps). */
export function advanceNumeric(body: BodyRuntime, rails: NumericRails, t: number): NumericRails {
	let cur = rails;
	for (let guard = 0; guard < 1e5; guard++) {
		const s = nextStep(body, cur);
		if (s.t1 > t) return cur;
		cur = { kind: 'numeric', r: s.r, v: s.v, t0: s.t1, h: s.next };
	}
	return cur;
}

/** The numeric rails' state at `t`: the anchor, the dense output of its step, or further steps. */
export function numericMotion(
	body: BodyRuntime,
	rails: NumericRails,
	t: number
): { r: Vec3; v: Vec3 } {
	if (t === rails.t0) return { r: rails.r, v: rails.v };
	if (t < rails.t0) {
		// before the anchor (an SOI bisection never asks this; a read of the past might)
		const out = integrateNBody(fieldOf(body), rails, rails.t0, t);
		spent += out.evaluations;
		totalEvaluations += out.evaluations;
		return { r: out.r, v: out.v };
	}
	const anchor = advanceNumeric(body, rails, t);
	const s = nextStep(body, anchor);
	return hermiteState(
		{ r: anchor.r, v: anchor.v, acc: s.acc0, t: anchor.t0 },
		{ r: s.r, v: s.v, acc: s.acc1, t: s.t1 },
		t
	);
}

/** The other bodies' pull at a point of `body`'s frame (the flight bubble, ADR 0122 point 4). */
export const thirdBody = (body: BodyRuntime, t: number, r: Vec3): Vec3 =>
	thirdBodyAcceleration(fieldOf(body), t, r);
