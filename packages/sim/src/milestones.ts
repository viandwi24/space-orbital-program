/**
 * Milestones in the sim (plan 102, ADR 0147): the firsts of a world, checked after each step and
 * rails chunk for every controlled vessel, `return` at recovery, reputation through the ledger.
 */
import {
	MILESTONE_CAUSE,
	milestoneId,
	milestoneReputation,
	type EntityId,
	type MilestoneKind,
	type MilestoneRecord,
	type SaveMilestones
} from '@orbital/core';
import { length } from '@orbital/kepler';
import { bodyOfVessel } from './bodies.ts';
import { isControlled, vesselIds, vesselOf, type SimCore } from './core.ts';
import { economyOn, record } from './economy.ts';
import { elementsOf, motionOf } from './orbit.ts';

/** A vessel off the ground this high over its body has launched (ADR 0147 point 1), m. */
export const LAUNCH_ALTITUDE = 1_000;

export const freshMilestones = (saved?: SaveMilestones): SaveMilestones =>
	saved
		? {
				records: saved.records.map((r) => ({ ...r })),
				visits: Object.fromEntries(Object.entries(saved.visits).map(([k, v]) => [k, [...v]]))
			}
		: { records: [], visits: {} };

/** The saved form, or undefined while nothing happened. */
export function saveMilestones(core: SimCore): SaveMilestones | undefined {
	const m = core.milestones;
	if (m.records.length === 0 && Object.keys(m.visits).length === 0) return undefined;
	return freshMilestones(m);
}

const crewAboard = (core: SimCore, vessel: EntityId): boolean =>
	core.crew.members.some((m) => m.location !== undefined && m.location.vessel === Number(vessel));

function reach(
	core: SimCore,
	kind: MilestoneKind,
	body: string | undefined,
	vessel: EntityId
): void {
	const crewed = crewAboard(core, vessel);
	for (const c of crewed ? [false, true] : [false]) {
		const id = milestoneId(kind, body, c);
		if (core.milestones.records.some((r) => r.id === id)) continue;
		const rec: MilestoneRecord = {
			id,
			kind,
			...(body === undefined ? {} : { body }),
			crewed: c,
			vessel: Number(vessel),
			time: core.t
		};
		core.milestones.records.push(rec);
		if (economyOn(core)) {
			const amount = milestoneReputation(rec, core.root.def.id);
			if (amount !== 0) record(core, 'reputation', amount, MILESTONE_CAUSE, id);
		}
		core.events.emit('milestone:reached', {
			id,
			kind,
			...(body === undefined ? {} : { body }),
			vessel,
			crewed: c,
			time: core.t
		});
	}
}

function visit(core: SimCore, vessel: EntityId, place: string): void {
	const key = String(vessel);
	const list = (core.milestones.visits[key] ??= []);
	if (!list.includes(place)) list.push(place);
}

/** After each step and rails chunk (ADR 0147 point 2). */
export function collectMilestones(core: SimCore): void {
	const home = core.root.def.id;
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		// an agency's object earns the player nothing (plan 126, ADR 0190 point 3)
		if (vessel.owner !== undefined || !isControlled(core, vessel)) continue;
		const body = bodyOfVessel(core, vessel);
		const b = body.def.id;
		const landed = vessel.rails?.kind === 'surface' || vessel.landed;
		if (b !== home) {
			visit(core, id, `flyby:${b}`);
			reach(core, 'flyby', b, id);
		}
		if (landed) {
			if (b !== home) {
				visit(core, id, `landing:${b}`);
				reach(core, 'landing', b, id);
			}
			continue;
		}
		const motion = motionOf(core, vessel);
		const altitude = length(motion.r) - body.def.radius;
		if (altitude > LAUNCH_ALTITUDE) reach(core, 'launch', undefined, id);
		const el =
			vessel.rails?.kind === 'elements'
				? vessel.rails.elements
				: elementsOf(body.mu, motion.r, motion.v, core.t);
		const clear = body.def.radius + (body.def.atmosphere?.height ?? 0);
		if (el && el.e < 1 && el.a * (1 - el.e) > clear) {
			visit(core, id, `orbit:${b}`);
			reach(core, 'orbit', b, id);
		}
	}
}

/** At `recover-vessel`, before the vessel is removed: a return from every body it has been at. */
export function recoverMilestones(core: SimCore, vessel: EntityId): void {
	collectMilestones(core);
	const places = core.milestones.visits[String(vessel)] ?? [];
	const bodies = [...new Set(places.map((p) => p.slice(p.indexOf(':') + 1)))];
	for (const body of bodies) reach(core, 'return', body, vessel);
}

/** A split vessel keeps where its parent has been; a removed vessel's visits go. Called once at createSim. */
export function listenForMilestones(core: SimCore): void {
	core.events.on('vessel:created', ({ vessel, from }) => {
		if (from === undefined) return;
		const parent = core.milestones.visits[String(from)];
		if (parent) core.milestones.visits[String(vessel)] = [...parent];
	});
	core.events.on('vessel:destroyed', ({ vessel }) => {
		delete core.milestones.visits[String(vessel)];
	});
}

/** The records for the snapshot, or undefined while there are none. */
export const milestonesSnapshot = (core: SimCore): MilestoneRecord[] | undefined =>
	core.milestones.records.length > 0 ? core.milestones.records.map((r) => ({ ...r })) : undefined;

/** Records a first from outside this file (EVA, plan 109). */
export const reachMilestone = (
	core: SimCore,
	kind: MilestoneKind,
	body: string | undefined,
	vessel: EntityId
): void => reach(core, kind, body, vessel);
