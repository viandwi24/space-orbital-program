/**
 * What the sim tells an autopilot's pilot beyond the snapshot (plan 321, ADR 0277): the body of
 * the vessel's sphere of influence, the vessel's mass, and its engines from their descriptors.
 */
import {
	STANDARD_GRAVITY,
	ambientAt,
	bodyAngularVelocity,
	type EntityId,
	type PilotEngine,
	type PilotFacts,
	type PilotStage
} from '@orbital/core';
import { bodyOfVessel, rotationAt } from './bodies.ts';
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
			...(body.def.atmosphere
				? {
						air: {
							surfaceDensity: ambientAt(body.def, 0).density,
							scaleHeight: body.def.atmosphere.scaleHeight
						}
					}
				: {}),
			angularVelocity: bodyAngularVelocity(body.def, core.t),
			rotation: rotationAt(body, core.t)
		},
		mass: totalMass(core, vessel.parts),
		engines,
		propellantMass: mix ? mixMass(core, vessel.parts, mix) : 0,
		nextStage: nextStageOf(core, id)
	};
}

/**
 * What the vessel's next stage would do (plan 360): the parts its separators would cut away (the
 * side without the root, unless only the other side is controlled, as `splitVessel` keeps them)
 * and the engines it would light. Null when no stage is left.
 */
function nextStageOf(core: SimCore, id: EntityId): PilotStage | null {
	const vessel = vesselOf(core, id);
	const stage = vessel.stages[vessel.nextStage];
	if (!stage) return null;
	const drops = new Set<EntityId>();
	const ignites: EntityId[] = [];
	const here = (p: EntityId) => core.world.hasEntity(p) && partOf(core, p).vessel === id;
	const controlled = (side: readonly EntityId[]) =>
		side.some((p) =>
			partOf(core, p).modules.some((m) => moduleDefOf(core, m.id).controlSource === true)
		);
	/** Parts reachable from `start` without the edge `a`–`b`. */
	const side = (start: EntityId, a: EntityId, b: EntityId): EntityId[] => {
		const seen = new Set([start]);
		const order = [start];
		for (let k = 0; k < order.length; k++) {
			const at = order[k]!;
			for (const att of partOf(core, at).attachments) {
				if ((at === a && att.peer === b) || (at === b && att.peer === a)) continue;
				if (!seen.has(att.peer)) {
					seen.add(att.peer);
					order.push(att.peer);
				}
			}
		}
		return order;
	};
	for (const partId of stage) {
		if (!here(partId)) continue;
		for (const m of partOf(core, partId).modules) {
			const def = moduleDefOf(core, m.id);
			if (!def.describe) continue;
			let info;
			try {
				info = def.describe(m.config as never, moduleState(core, partId, m.id) as never);
			} catch {
				continue;
			}
			if (info.engine && !info.engine.ignited) ignites.push(partId);
			const sep = info.separator;
			// a separator that staging does not fire (plan 241) cuts nothing
			if (
				!sep ||
				sep.done ||
				(moduleState(core, partId, m.id) as { staged?: boolean }).staged === false
			)
				continue;
			for (const att of partOf(core, partId).attachments.filter((a) => a.node === sep.node)) {
				const p = side(partId, partId, att.peer);
				const q = side(att.peer, partId, att.peer);
				const rootSide = p.includes(vessel.root) ? p : q;
				const other = rootSide === p ? q : p;
				const away = !controlled(rootSide) && controlled(other) ? rootSide : other;
				for (const x of away) drops.add(x);
			}
		}
	}
	return { drops: [...drops].sort((a, b) => a - b), ignites };
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
