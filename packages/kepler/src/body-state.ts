/**
 * State of a body over time (plan 035, ADR 0064): position and velocity at time `t` from its orbit
 * around its parent, relative to the parent or to the root body's centre. Pure function of the body
 * list, so a script reading it gets what the sim's bodies do.
 */
import type { StateVector } from './convert.ts';
import { propagate } from './propagate.ts';
import type { PatchedBody } from './patched.ts';
import { add, type Vec3 } from './vec3.ts';

export type BodyFrame = 'parent' | 'system';

/**
 * Throws `RangeError` for an unknown body, a time that is not finite or an unknown frame. The root
 * body rests at the origin. `system` adds up the orbits along the parent chain (their velocities
 * too: the frame of the root body is not moving).
 */
export function bodyStateAt(
	bodies: readonly PatchedBody[],
	id: string,
	t: number,
	frame: BodyFrame = 'parent'
): StateVector {
	if (frame !== 'parent' && frame !== 'system') {
		throw new RangeError(`bodyStateAt: frame must be 'parent' or 'system', got "${String(frame)}"`);
	}
	if (typeof t !== 'number' || !Number.isFinite(t)) {
		throw new RangeError(`bodyStateAt: t must be a finite number, got ${String(t)}`);
	}
	const byId = new Map(bodies.map((b) => [b.id, b]));
	let body = byId.get(id);
	if (!body) {
		throw new RangeError(
			`bodyStateAt: unknown body "${id}"; known: ${[...byId.keys()].map((b) => `"${b}"`).join(', ')}`
		);
	}
	let r: Vec3 = { x: 0, y: 0, z: 0 };
	let v: Vec3 = { x: 0, y: 0, z: 0 };
	// The tree is finite and acyclic by construction; the counter guards a malformed list.
	for (let hops = 0; body.parent !== undefined && body.orbit && hops < byId.size; hops++) {
		const parent: PatchedBody | undefined = byId.get(body.parent);
		if (!parent) {
			throw new RangeError(`bodyStateAt: body "${body.id}" has unknown parent "${body.parent}"`);
		}
		const s = propagate(body.orbit, parent.mu, t);
		r = add(r, s.r);
		v = add(v, s.v);
		if (frame === 'parent') break;
		body = parent;
	}
	return { r, v };
}
