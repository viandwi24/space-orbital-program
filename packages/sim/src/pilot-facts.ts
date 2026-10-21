/**
 * What the sim tells an autopilot's pilot beyond the snapshot (plan 321, ADR 0277): the body of
 * the vessel's sphere of influence, the vessel's mass, and its engines from their descriptors.
 */
import {
	STANDARD_GRAVITY,
	bodyAngularVelocity,
	type EntityId,
	type PilotEngine,
	type PilotFacts
} from '@orbital/core';
import { bodyOfVessel } from './bodies.ts';
import { moduleDefOf, moduleState, partOf, totalMass, vesselOf, type SimCore } from './core.ts';

export function pilotFacts(core: SimCore, id: EntityId): PilotFacts {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const engines: PilotEngine[] = [];
	for (const partId of vessel.parts) {
		if (!core.world.hasEntity(partId)) continue;
		for (const m of partOf(core, partId).modules) {
			const def = moduleDefOf(core, m.id);
			if (!def.describe) continue;
			let engine;
			try {
				engine = def.describe(m.config as never, moduleState(core, partId, m.id) as never).engine;
			} catch {
				continue; // a broken descriptor is the module's problem, not the autopilot's
			}
			const vacuum = engine?.thrust[0]?.thrust;
			if (!engine || !vacuum) continue;
			engines.push({
				part: partId,
				thrustVacuum: vacuum,
				ispVacuum: vacuum / (engine.massFlow * STANDARD_GRAVITY),
				ignited: engine.ignited,
				flameout: engine.flameout
			});
		}
	}
	return {
		body: {
			id: body.def.id,
			mu: body.mu,
			radius: body.def.radius,
			atmosphereHeight: body.def.atmosphere?.height ?? 0,
			angularVelocity: bodyAngularVelocity(body.def, core.t)
		},
		mass: totalMass(core, vessel.parts),
		engines
	};
}
