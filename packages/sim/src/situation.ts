/** The coarse vessel situation from the sim's own flags (plan 343, ADR 0292 point 2). */
import { classifySituation, type EntityId, type VesselSituation } from '@orbital/core';
import type { OrbitalElements } from '@orbital/kepler';
import { bodyOfVessel } from './bodies.ts';
import { vesselOf, type SimCore } from './core.ts';
import { elementsOf, motionOf } from './orbit.ts';
import { situationView } from './science.ts';

/** The vessel's coarse situation now, from the sim's own flags (ADR 0292 point 2). */
export function vesselSituationNow(core: SimCore, id: EntityId): VesselSituation {
	const v = vesselOf(core, id);
	const body = bodyOfVessel(core, v);
	const view = situationView(core, id);
	const facts = {
		landed: view.landed,
		splashed: view.splashed,
		launched: v.launchedAt !== undefined,
		altitude: view.altitude,
		atmosphereHeight: view.atmosphereHeight,
		radius: body.def.radius,
		soi: body.soi,
		orbit: null as OrbitalElements | null
	};
	if (!view.landed && !(view.atmosphereHeight > 0 && view.altitude < view.atmosphereHeight)) {
		if (v.rails?.kind === 'elements') facts.orbit = v.rails.elements;
		else {
			const m = motionOf(core, v);
			facts.orbit = elementsOf(body.mu, m.r, m.v, core.t) ?? null;
		}
	}
	return classifySituation(facts);
}
