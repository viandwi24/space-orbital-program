/**
 * Fleet management (plan 223, ADR 0208): vessel types (the player's, else a guess from the parts),
 * rename, terminate, and the debris cap. Debris is every uncontrolled vessel of the player that is
 * not kept (a flag); it stays in the world until it re-enters or the cap removes the oldest.
 */
import {
	DEFAULT_DEBRIS_CAP,
	PAD_CLEAR_HEIGHT,
	sitesOf,
	uniqueVesselName,
	type Site,
	type Vec3,
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
	vesselNames,
	vesselOf,
	type SimCore
} from './core.ts';
import { VESSEL, type VesselState } from './state.ts';
import { destroyVessel } from './vessel.ts';
import { bodyOfVessel, rotationAt } from './bodies.ts';
import { qConj, qRotate } from './math.ts';
import { motionOf } from './orbit.ts';
import { terrainBelow } from './terrain.ts';

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

/** A launched vessel's name differs from every other vessel's: "Moon shot 2" (ADR 0252). */
export function nameLaunched(core: SimCore, id: EntityId): void {
	const v = vesselOf(core, id);
	v.name = uniqueVesselName(v.name, vesselNames(core, id));
}

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

/** A latitude and longitude as a body-fixed unit vector (+Y north, longitude 0 on +X). */
const unitAt = (latitude: number, longitude: number): Vec3 => ({
	x: Math.cos(latitude) * Math.cos(longitude),
	y: Math.sin(latitude),
	z: -Math.cos(latitude) * Math.sin(longitude)
});

/** The vessel's centre of mass in its body's fixed frame, and that body's id. */
function bodyFixed(core: SimCore, vessel: VesselState): { body: string; r: Vec3 } {
	const body = bodyOfVessel(core, vessel);
	const r = motionOf(core, vessel).r;
	return { body: body.def.id, r: qRotate(qConj(rotationAt(body, core.t)), r) };
}

/** Metres along the ground from the body-fixed point `r` to the unit direction `at`, on a body of `radius`. */
function arcTo(r: Vec3, at: Vec3, radius: number): number {
	const n = Math.hypot(r.x, r.y, r.z);
	const c = (r.x * at.x + r.y * at.y + r.z * at.z) / n;
	return Math.acos(Math.max(-1, Math.min(1, c))) * radius;
}

/**
 * Where a vessel stands at a site (plan 318, ADR 0274): metres east and north of the site centre
 * (the inverse of `padLatLon`), while its centre of mass is within the site's flat radius and below
 * `PAD_CLEAR_HEIGHT` above the ground.
 */
export function siteSpotOf(
	core: SimCore,
	id: EntityId
): { site: string; east: number; north: number } | undefined {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const sites = sitesOf(core.info).filter((s) => s.body === body.def.id);
	if (sites.length === 0) return undefined;
	const { r } = bodyFixed(core, vessel);
	const radius = body.def.radius;
	const n = Math.hypot(r.x, r.y, r.z);
	const ground = terrainBelow(core, body, motionOf(core, vessel).r) ?? 0;
	if (n - radius - ground > PAD_CLEAR_HEIGHT) return undefined;
	const site = sites.find((s) => arcTo(r, unitAt(s.latitude, s.longitude), radius) < s.flatRadius);
	if (!site) return undefined;
	const latitude = Math.asin(Math.max(-1, Math.min(1, r.y / n)));
	let dLon = Math.atan2(-r.z, r.x) - site.longitude;
	dLon = Math.atan2(Math.sin(dLon), Math.cos(dLon));
	return {
		site: site.id,
		east: dLon * radius * Math.max(Math.cos(site.latitude), 1e-6),
		north: (latitude - site.latitude) * radius
	};
}

/** Whether the vessel is on the site's body within the site's flat radius of its centre. */
function nearSite(core: SimCore, vessel: VesselState, site: Site): boolean {
	const { body, r } = bodyFixed(core, vessel);
	if (body !== site.body) return false;
	const radius = bodyOfVessel(core, vessel).def.radius;
	return arcTo(r, unitAt(site.latitude, site.longitude), radius) < site.flatRadius;
}

/**
 * `clear-debris` (plan 318, ADR 0274): terminate every debris vessel of the player, or with `site`
 * only those near it. Refused for an unknown site; nothing to clear is not a refusal.
 */
export function clearDebris(core: SimCore, siteId?: string): CommandResult {
	const site = siteId === undefined ? undefined : sitesOf(core.info).find((s) => s.id === siteId);
	if (siteId !== undefined && !site) return refuse(`unknown site "${siteId}"`);
	for (const id of vesselIds(core)) {
		const v = vesselOf(core, id);
		if (!isDebris(core, v)) continue;
		if (site && !nearSite(core, v, site)) continue;
		destroyVessel(core, id, 'terminated');
	}
	return { ok: true };
}
