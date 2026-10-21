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
	let mix: readonly { resource: string; ratio: number }[] | undefined;
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
			if (!mix && engine.ignited && !engine.flameout) mix = engine.propellants;
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
		engines,
		propellantMass: mix ? mixMass(core, vessel.parts, mix) : 0
	};
}

/**
 * Mass of a propellant mix over the parts (ADR 0286 point 4): the mix in its volume ratios,
 * limited by its scarcest resource, kg.
 */
function mixMass(
	core: SimCore,
	parts: readonly EntityId[],
	mix: readonly { resource: string; ratio: number }[]
): number {
	const amounts = new Map<string, number>(mix.map((p) => [p.resource, 0]));
	for (const partId of parts) {
		if (!core.world.hasEntity(partId)) continue;
		for (const m of partOf(core, partId).modules) {
			const store = moduleDefOf(core, m.id).store;
			if (!store) continue;
			const state = moduleState(core, partId, m.id);
			for (const resource of store.resources(m.config, state)) {
				if (amounts.has(resource))
					amounts.set(resource, amounts.get(resource)! + store.amount(m.config, state, resource));
			}
		}
	}
	let units = Infinity;
	let perUnit = 0;
	for (const p of mix) {
		units = Math.min(units, amounts.get(p.resource)! / p.ratio);
		perUnit += p.ratio * (core.registries.resources.get(p.resource)?.density ?? 0);
	}
	return Number.isFinite(units) ? Math.max(0, units * perUnit) : 0;
}
