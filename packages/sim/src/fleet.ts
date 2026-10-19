/**
 * Fleet management (plan 223, ADR 0208): vessel types (the player's, else a guess from the parts),
 * rename, terminate, and the debris cap. Debris is every uncontrolled vessel of the player that is
 * not kept (a flag); it stays in the world until it re-enters or the cap removes the oldest.
 */
import {
	DEFAULT_DEBRIS_CAP,
	type CommandResult,
	type EntityId,
	type VesselType
} from '@orbital/core';
import {
	isControlled,
	isKept,
	partDefOf,
	partOf,
	vesselIds,
	vesselOf,
	type SimCore
} from './core.ts';
import { VESSEL, type VesselState } from './state.ts';
import { destroyVessel } from './vessel.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** Module and part ids that read as a wing, a landing leg or a wheel (the guess only). */
const WING = /wing|control-surface|elevon/;
const LEG = /leg/;
const WHEEL = /\.wheel\b/; // a rover wheel, not a reaction wheel

/**
 * A vessel's type when the player has not set one: a flag (a kept part), a suit (a part that walks),
 * debris (no control source), then from the parts: wings make a plane, wheels a rover, legs a
 * lander, seats a ship; anything else is a probe.
 */
export function guessVesselType(core: SimCore, vessel: VesselState): VesselType {
	if (isKept(core, vessel)) return 'flag';
	let wings = false;
	let wheels = false;
	let legs = false;
	let seats = false;
	for (const id of vessel.parts) {
		const part = partOf(core, id);
		const def = partDefOf(core, part);
		if (def.walk !== undefined) return 'eva';
		if (WHEEL.test(def.id)) wheels = true;
		if ((def.crewCapacity ?? 0) > 0) seats = true;
		if (LEG.test(def.id)) legs = true;
		for (const m of part.modules) {
			if (WING.test(m.id)) wings = true;
			if (WHEEL.test(m.id)) wheels = true;
		}
	}
	if (vessel.owner === undefined && !isControlled(core, vessel)) return 'debris';
	if (wings) return 'plane';
	if (wheels) return 'rover';
	if (legs) return 'lander';
	return seats ? 'ship' : 'probe';
}

export const vesselTypeOf = (core: SimCore, vessel: VesselState): VesselType =>
	vessel.type ?? guessVesselType(core, vessel);

const ownVessel = (core: SimCore, id: EntityId): VesselState | string => {
	if (!core.world.hasEntity(id)) return `no vessel ${id}`;
	const v = core.world.get(id, VESSEL);
	if (!v) return `no vessel ${id}`;
	if (v.owner !== undefined) return 'that vessel belongs to another agency';
	return v;
};

export function renameVessel(core: SimCore, id: EntityId, name: string): CommandResult {
	const v = ownVessel(core, id);
	if (typeof v === 'string') return refuse(v);
	const trimmed = name.trim();
	if (trimmed === '') return refuse('a vessel needs a name');
	v.name = trimmed.slice(0, 60);
	return { ok: true };
}

export function setVesselType(core: SimCore, id: EntityId, type: VesselType): CommandResult {
	const v = ownVessel(core, id);
	if (typeof v === 'string') return refuse(v);
	v.type = type;
	return { ok: true };
}

/** End a vessel (Terminate): removed like a crash, its crew under the `stock.crew-death` rule. */
export function terminateVessel(core: SimCore, id: EntityId): CommandResult {
	const v = ownVessel(core, id);
	if (typeof v === 'string') return refuse(v);
	destroyVessel(core, id, 'terminated');
	return { ok: true };
}

export function setDebrisCap(core: SimCore, cap: number): CommandResult {
	core.debrisCap = Math.max(0, Math.floor(cap));
	enforceDebrisCap(core);
	return { ok: true };
}

/** Whether a vessel counts as debris for the cap: the player's, uncontrolled, not kept, not retyped. */
export const isDebris = (core: SimCore, vessel: VesselState): boolean =>
	vessel.owner === undefined &&
	(vessel.type === undefined || vessel.type === 'debris') &&
	!isKept(core, vessel) &&
	!isControlled(core, vessel);

/** Over the cap the oldest debris goes first (the lowest entity id is the oldest). */
export function enforceDebrisCap(core: SimCore): void {
	const cap = core.debrisCap ?? DEFAULT_DEBRIS_CAP;
	const all = vesselIds(core);
	if (all.length <= cap) return; // cheap: runs after every step's debris pass
	const debris = all.filter((id) => isDebris(core, vesselOf(core, id))).sort((a, b) => a - b);
	for (const id of debris.slice(0, Math.max(0, debris.length - cap))) {
		destroyVessel(core, id, 'debris over the cap');
	}
}
