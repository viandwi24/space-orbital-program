/**
 * `bodies[id].state(t, frame)` for scripts (plan 035, ADR 0064): the orbital mechanics live in
 * `kepler`, which the scripting package may not import (boundaries.md), so the host that builds
 * the runner passes this provider in.
 */
import { GRAVITATIONAL_CONSTANT, type BodyDefinition } from '@orbital/core';
import { bodyStateAt, type PatchedBody } from '@orbital/kepler';
import type { BodyStateProvider } from '@orbital/scripting';

export function scriptBodyState(bodies: readonly BodyDefinition[]): BodyStateProvider {
	// Only `mu`, `parent` and `orbit` matter to `bodyStateAt`; the sphere of influence does not.
	const list: PatchedBody[] = bodies.map((b) => ({
		id: String(b.id),
		mu: GRAVITATIONAL_CONSTANT * b.mass,
		soi: Number.POSITIVE_INFINITY,
		...(b.parent !== undefined && b.orbit ? { parent: String(b.parent), orbit: b.orbit } : {})
	}));
	return (id, t, frame) => {
		const s = bodyStateAt(list, id, t, frame);
		return { position: s.r, velocity: s.v };
	};
}
