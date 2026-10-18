/**
 * Debug tools in the sim (plan 203, ADRs 0200 and 0213): who may use them, the cheat switches the
 * other files read, and the set-state commands. Every change is a command, so it saves and replays
 * like any other; the state lives in `WorldInfo.debug`.
 */
import {
	bodyId,
	padLatLon,
	resolveVesselDesign,
	sitesOf,
	type CommandResult,
	type DebugAccess,
	type DebugCheat,
	type DebugLocation,
	type DebugOrbit,
	type DebugSnapshot,
	type EntityId,
	type Vec3,
	type VesselDesign,
	type WorldDebug
} from '@orbital/core';
import { add, cross, normalize, scale, toStateVector } from '@orbital/kepler';
import { rotationAt, spinAt, type BodyRuntime } from './bodies.ts';
import { moduleDefOf, moduleState, partOf, vesselOf, type SimCore } from './core.ts';
import { record, ruleOf } from './economy.ts';
import { acquireFrame, enterFlight, leaveFlight } from './frames.ts';
import { qFromBasis, qRotate } from './math.ts';
import { computeRails } from './orbit.ts';
import { VESSEL, PART } from './state.ts';
import { hasBackground } from './tick.ts';
import { placeOnSurface, spawnVessel } from './vessel.ts';

/** The rule that says who may use the debug tools (ADR 0213 point 1). */
export const DEBUG_RULE = 'stock.debug-tools';

/** More than any store holds: depositing it fills a store to capacity. */
const FILL = 1e15;

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

export function debugAccess(core: SimCore): DebugAccess {
	const value = ruleOf(core, DEBUG_RULE);
	return value === 'opt-in' || value === 'locked' ? value : 'always';
}

const stateOf = (core: SimCore): WorldDebug =>
	core.info.debug ?? { mode: false, usedCheats: false, cheats: [] };

/** Write the debug state; the frozen `Sim.worldInfo` is rebuilt on its next read. */
function writeState(core: SimCore, next: WorldDebug): void {
	core.info.debug = next;
	core.rulesView = null;
}

/** Whether a debug command is accepted now (ADR 0200 point 8). */
export function debugAllowed(core: SimCore): boolean {
	const access = debugAccess(core);
	return access === 'always' || (access === 'opt-in' && stateOf(core).mode);
}

/** Why debug commands are refused, or undefined when they are accepted. */
export function debugRefusal(core: SimCore): string | undefined {
	switch (debugAccess(core)) {
		case 'locked':
			return 'debug tools are locked in this world (stock.debug-tools)';
		case 'opt-in':
			return stateOf(core).mode
				? undefined
				: 'debug tools need Debug mode, which is off in this world';
		default:
			return undefined;
	}
}

/** A debug tool was used: the world is marked for good (ADR 0213 point 4). */
function markUsed(core: SimCore): void {
	const state = stateOf(core);
	if (!state.usedCheats) writeState(core, { ...state, usedCheats: true });
}

export function debugSnapshot(core: SimCore): DebugSnapshot {
	const state = stateOf(core);
	const access = debugAccess(core);
	return {
		access,
		mode: access === 'always' || (access === 'opt-in' && state.mode),
		allowed: debugAllowed(core),
		usedCheats: state.usedCheats,
		cheats: [...state.cheats] as DebugCheat[]
	};
}

/** `debug-mode` (ADR 0213 point 5): meaningful in an `opt-in` world; turning it on marks the world. */
export function setDebugMode(core: SimCore, on: boolean): CommandResult {
	const access = debugAccess(core);
	if (access === 'locked') return refuse(debugRefusal(core)!);
	const state = stateOf(core);
	if (access === 'always') {
		return refuse('debug tools are always on in this world; there is no Debug mode to switch');
	}
	writeState(core, { ...state, mode: on, usedCheats: state.usedCheats || on });
	if (!on && state.cheats.length > 0) writeState(core, { ...stateOf(core), cheats: [] });
	return { ok: true };
}

/** `debug-cheat`. */
export function setCheat(core: SimCore, cheat: DebugCheat, on: boolean): CommandResult {
	const state = stateOf(core);
	const cheats = state.cheats.filter((c) => c !== cheat);
	if (on) cheats.push(cheat);
	writeState(core, { ...state, usedCheats: true, cheats: cheats.sort() });
	return { ok: true };
}

/** `debug-grant`: currencies through the ledger (cause `debug.grant`), and the whole tech tree. */
export function grant(
	core: SimCore,
	command: { funds?: number; science?: number; reputation?: number; tech?: boolean }
): CommandResult {
	if (command.funds) record(core, 'funds', command.funds, 'debug.grant');
	if (command.science) record(core, 'science', command.science, 'debug.grant');
	if (command.reputation) record(core, 'reputation', command.reputation, 'debug.grant');
	if (command.tech) {
		for (const node of core.registries.techNodes.list()) {
			if (!core.tech.researched.includes(node.id)) core.tech.researched.push(node.id);
		}
	}
	markUsed(core);
	return { ok: true };
}

/** Take the vessel out of flight, if it is in it; it is placed again right after. */
function lift(core: SimCore, id: EntityId): void {
	const vessel = vesselOf(core, id);
	if (vessel.mode === 'flight') leaveFlight(core, id);
	vessel.rails = null;
	vessel.idle = 0;
	vessel.rest = 0;
	vessel.landed = false;
	delete vessel.backgroundAt;
}

/** On rails at a state vector relative to `body` (the normal unpack path wakes it later). */
function railsAt(core: SimCore, id: EntityId, body: BodyRuntime, r: Vec3, v: Vec3): void {
	const vessel = vesselOf(core, id);
	vessel.soi = body.def.id;
	vessel.com = { ...r };
	vessel.velocity = { ...v };
	vessel.rails = computeRails(body.mu, r, v, core.t, core.info.gravityModel);
	vessel.mode = 'on-rails';
	if (hasBackground(core, id)) vessel.backgroundAt = core.t;
	core.events.emit('vessel:mode-changed', { vessel: id, mode: 'on-rails', reason: 'debug' });
}

/** In flight where it stands; warp drops to 1 as a load into flight needs. */
function flightAt(core: SimCore, id: EntityId): string | undefined {
	const vessel = vesselOf(core, id);
	core.warp = 1;
	core.warpTarget = null;
	const frame = acquireFrame(core, vessel.soi, vessel.com, vessel.velocity);
	if (!frame) return 'no free physics frame (another vessel is in flight far away)';
	enterFlight(core, id, frame);
	core.events.emit('vessel:mode-changed', { vessel: id, mode: 'flight', reason: 'debug' });
	return undefined;
}

function bodyNamed(core: SimCore, id: string | undefined, fallback: string): BodyRuntime | string {
	const name = id ?? fallback;
	const body = core.bodies.get(name);
	if (body) return body;
	const known = [...core.bodies.keys()].map((b) => `"${b}"`).join(', ');
	return `unknown body "${name}"; this sim has ${known}`;
}

const playerVessel = (core: SimCore, id: EntityId): string | undefined => {
	const vessel = core.world.get(id, VESSEL);
	if (!vessel) return `unknown vessel ${id}`;
	return vessel.owner === undefined ? undefined : `vessel ${id} belongs to an agency`;
};

/** `debug-set-orbit`: the vessel (or a new one from `design`) on rails at the elements, epoch now. */
export function setOrbit(
	core: SimCore,
	command: { vessel?: EntityId; design?: VesselDesign; orbit: DebugOrbit }
): CommandResult {
	const body = bodyNamed(core, command.orbit.body, core.root.def.id);
	if (typeof body === 'string') return refuse(body);
	const { a, e } = command.orbit;
	if (e >= 1 ? a >= 0 : a <= 0)
		return refuse('a must be positive below e = 1 and negative above it');
	if (Math.abs(e - 1) < 1e-6) return refuse('a parabolic orbit (e = 1) has no elements');
	const periapsis = a * (1 - e);
	if (periapsis <= body.def.radius) {
		return refuse(`periapsis ${Math.round(periapsis - body.def.radius)} m is below the surface`);
	}
	let state;
	try {
		state = toStateVector({ ...command.orbit, epoch: core.t }, body.mu, core.t);
	} catch (error) {
		return refuse(`invalid orbit: ${error instanceof Error ? error.message : String(error)}`);
	}
	let id = command.vessel;
	if (id === undefined) {
		const resolved = resolveVesselDesign(command.design!, core.registries.parts);
		if (!resolved.ok) return refuse(`invalid design: ${resolved.errors.join('; ')}`);
		id = spawnVessel(core, command.design!, resolved);
	} else {
		const why = playerVessel(core, id);
		if (why) return refuse(why);
		lift(core, id);
	}
	railsAt(core, id, body, state.r, state.v);
	markUsed(core);
	return { ok: true, vessel: id };
}

/** `debug-set-location`: landed at a site or coordinates, or in the air with a ground-relative velocity. */
export function setLocation(
	core: SimCore,
	command: { vessel: EntityId; location: DebugLocation }
): CommandResult {
	const id = command.vessel;
	const why = playerVessel(core, id);
	if (why) return refuse(why);
	const vessel = vesselOf(core, id);
	const at = command.location;
	let body: BodyRuntime | string;
	let latitude: number;
	let longitude: number;
	if (at.kind === 'site') {
		const site = sitesOf(core.info).find((s) => s.id === at.site);
		if (!site) return refuse(`unknown site "${at.site}"`);
		const pad = site.pads[at.pad ?? 0];
		if (!pad) return refuse(`site "${site.id}" has no pad ${at.pad}`);
		body = bodyNamed(core, bodyId(site.body), core.root.def.id);
		if (typeof body === 'string') return refuse(body);
		[latitude, longitude] = padLatLon(site, pad, body.def.radius);
	} else {
		body = bodyNamed(core, at.body, vessel.soi);
		if (typeof body === 'string') return refuse(body);
		latitude = at.latitude;
		longitude = at.longitude;
	}
	const before = { soi: vessel.soi, com: vessel.com, velocity: vessel.velocity };
	lift(core, id);
	vessel.soi = body.def.id;
	if (at.kind === 'air') {
		const place = airState(body, core.t, latitude, longitude, at);
		vessel.com = place.r;
		vessel.velocity = place.v;
		vessel.orientation = place.orientation;
	} else {
		placeOnSurface(core, id, latitude, longitude);
	}
	const blocked = flightAt(core, id);
	if (blocked) {
		const old = bodyNamed(core, before.soi, core.root.def.id) as BodyRuntime;
		railsAt(core, id, old, before.com, before.velocity);
		return refuse(blocked);
	}
	markUsed(core);
	return { ok: true };
}

/**
 * Centre of mass, velocity and an upright attitude for a vessel in the air: `altitude` above the
 * reference sphere over (lat, lon), moving `speed` relative to the turning ground towards
 * `heading` (rad from north) at `climb` (rad above the horizon).
 */
export function airState(
	body: BodyRuntime,
	t: number,
	latitude: number,
	longitude: number,
	at: { altitude: number; speed: number; heading?: number; climb?: number }
): { r: Vec3; v: Vec3; orientation: ReturnType<typeof qFromBasis> } {
	const turn = rotationAt(body, t);
	const up = qRotate(turn, {
		x: Math.cos(latitude) * Math.cos(longitude),
		y: Math.sin(latitude),
		z: -Math.cos(latitude) * Math.sin(longitude)
	});
	const axis = qRotate(turn, { x: 0, y: 1, z: 0 });
	const eastRaw = cross(axis, up);
	const east =
		Math.hypot(eastRaw.x, eastRaw.y, eastRaw.z) > 1e-9 ? normalize(eastRaw) : { x: 0, y: 0, z: -1 };
	const north = cross(up, east);
	const heading = at.heading ?? 0;
	const climb = at.climb ?? 0;
	const horizontal = add(scale(north, Math.cos(heading)), scale(east, Math.sin(heading)));
	const direction = add(scale(horizontal, Math.cos(climb)), scale(up, Math.sin(climb)));
	const r = scale(up, body.def.radius + at.altitude);
	const v = add(cross(spinAt(body, t), r), scale(direction, at.speed));
	return { r, v, orientation: qFromBasis(east, up, cross(east, up)) };
}

/** The part ids a command names: one part of the vessel, or all of them. */
function partsNamed(core: SimCore, vesselId: EntityId, part?: EntityId): EntityId[] | string {
	const why = playerVessel(core, vesselId);
	if (why) return why;
	const parts = vesselOf(core, vesselId).parts;
	if (part === undefined) return parts;
	return parts.includes(part) ? [part] : `part ${part} is not on vessel ${vesselId}`;
}

/** `debug-set-resource`: each matching store set to `fraction` of its capacity, or to `amount`. */
export function setResource(
	core: SimCore,
	command: {
		vessel: EntityId;
		part?: EntityId;
		resource?: string;
		fraction?: number;
		amount?: number;
	}
): CommandResult {
	const parts = partsNamed(core, command.vessel, command.part);
	if (typeof parts === 'string') return refuse(parts);
	let stores = 0;
	for (const id of parts) {
		for (const m of partOf(core, id).modules) {
			const store = moduleDefOf(core, m.id).store;
			if (!store) continue;
			const state = moduleState(core, id, m.id);
			for (const resource of store.resources(m.config, state)) {
				if (command.resource !== undefined && resource !== command.resource) continue;
				store.deposit(m.config, state, resource, FILL);
				const capacity = store.amount(m.config, state, resource);
				const want =
					command.fraction !== undefined
						? capacity * command.fraction
						: Math.min(capacity, command.amount!);
				if (capacity > want) store.withdraw(m.config, state, resource, capacity - want);
				stores += 1;
			}
		}
	}
	if (stores === 0) {
		return refuse(
			command.resource === undefined
				? 'no store aboard holds a resource'
				: `no store aboard holds "${command.resource}"`
		);
	}
	markUsed(core);
	return { ok: true };
}

/** `debug-set-temperature`. */
export function setTemperature(
	core: SimCore,
	command: { vessel: EntityId; part?: EntityId; temperature: number }
): CommandResult {
	const parts = partsNamed(core, command.vessel, command.part);
	if (typeof parts === 'string') return refuse(parts);
	for (const id of parts) {
		const part = core.world.get(id, PART);
		if (part) part.temperature = command.temperature;
	}
	markUsed(core);
	return { ok: true };
}

/** `debug-set-crew-level`. */
export function setCrewLevel(core: SimCore, member: string, level: number): CommandResult {
	const m = core.crew.members.find((c) => c.id === member);
	if (!m) return refuse(`no crew member "${member}"`);
	m.level = level;
	markUsed(core);
	return { ok: true };
}
