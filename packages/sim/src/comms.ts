/**
 * Comms tier 1 (plan 114, ADR 0179): ground stations, direct links with line of sight past bodies
 * and terrain, plasma blackout, the update cadence with bisection under warp, and probe control.
 * Links are derived: they live beside the world, are never saved, and are recomputed on resume.
 */
import {
	BLACKOUT_BADGE_LEVEL,
	BLACKOUT_NOSE_RADIUS,
	blackoutLevelFromFlux,
	COMMS_NODE,
	COMMS_RULES,
	linkRange,
	sitesOf,
	SITE_STATION_RANGES,
	STATION_MAST,
	type ControlState,
	type EntityId,
	type LinkReason,
	type SignalState,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { ambientAt } from './atmosphere.ts';
import { bodyById, systemPosition, type BodyRuntime } from './bodies.ts';
import {
	moduleDefOf,
	moduleState,
	partDefOf,
	partOf,
	vesselIds,
	vesselOf,
	type SimCore
} from './core.ts';
import { ruleOf } from './economy.ts';
import { railsMotion } from './orbit.ts';
import { qAboutY, qRotate } from './math.ts';
import { stagnationFlux } from './thermal.ts';

/** Sim time between network updates at warp 1, s (ADR 0179 point 4). */
export const NETWORK_INTERVAL = 1;
/** Longest gap between samples in a rails chunk, s. */
export const NETWORK_SAMPLE = 10;
/** Bisection stops when the bracket is this narrow, s. */
export const LINK_TIME_TOLERANCE = 0.01;
/** Samples along a segment that runs low over a body with terrain. */
const TERRAIN_SAMPLES = 16;

interface Station {
	id: string;
	label: string;
	body: BodyRuntime;
	/** Unit direction in the body-fixed frame, and distance from the centre, m. */
	dir: Vec3;
	radius: number;
	range: number;
}

export interface VesselLink {
	to: string | null;
	reason: LinkReason | null;
	control: ControlState;
	blackout: number;
}

export interface CommsRuntime {
	/** Last network update time, s; null before the first. */
	last: number | null;
	dirty: boolean;
	links: Map<EntityId, VesselLink>;
	/** Built on first use; reset when buildings or sites change. */
	stations: Station[] | null;
}

export const freshComms = (): CommsRuntime => ({
	last: null,
	dirty: true,
	links: new Map(),
	stations: null
});

export const commsOn = (core: SimCore): boolean => ruleOf(core, COMMS_RULES.enabled) === true;

/** Marks the network for an update after the current step (staging, toggles, SOI, vessels). */
export function listenForComms(core: SimCore): void {
	const dirty = () => {
		core.comms.dirty = true;
	};
	core.events.on('stage:activated', dirty);
	core.events.on('vessel:soi-changed', dirty);
	core.events.on('vessel:created', dirty);
	core.events.on('vessel:destroyed', dirty);
}

/** Forget the stations (a building was placed or removed, a site founded). */
export function resetStations(core: SimCore): void {
	core.comms.stations = null;
	core.comms.dirty = true;
}

const bodyFixedDir = (latitude: number, longitude: number): Vec3 => ({
	x: Math.cos(latitude) * Math.cos(longitude),
	y: Math.sin(latitude),
	z: -Math.cos(latitude) * Math.sin(longitude)
});

function station(
	core: SimCore,
	id: string,
	label: string,
	bodyId: string,
	latitude: number,
	longitude: number,
	mast: number,
	range: number
): Station | undefined {
	if (!core.bodies.has(bodyId)) return undefined;
	const body = bodyById(core, bodyId);
	const dir = bodyFixedDir(latitude, longitude);
	const ground = body.terrain ? body.terrain.heightAt(dir) : 0;
	return { id, label, body, dir, radius: body.def.radius + ground + mast, range };
}

/** Every world site (tier from its active comms-node buildings), then registered stations. */
export function stationsOf(core: SimCore): Station[] {
	if (core.comms.stations) return core.comms.stations;
	const out: Station[] = [];
	for (const site of sitesOf(core.info)) {
		let tier = 1;
		for (const b of site.buildings ?? []) {
			if (b.state !== 'active') continue;
			const level = core.registries.buildings.get(b.kind)?.levels[b.level];
			tier = Math.max(tier, level?.capacity[COMMS_NODE] ?? 0);
		}
		const range = SITE_STATION_RANGES[Math.min(tier, SITE_STATION_RANGES.length) - 1]!;
		const s = station(
			core,
			`site:${site.id}`,
			site.name,
			site.body,
			site.latitude,
			site.longitude,
			STATION_MAST,
			range
		);
		if (s) out.push(s);
	}
	for (const def of core.registries.groundStations.list()) {
		const s = station(
			core,
			def.id,
			def.label,
			def.body,
			def.latitude,
			def.longitude,
			def.altitude ?? STATION_MAST,
			def.range
		);
		if (s) out.push(s);
	}
	core.comms.stations = out;
	return out;
}

/** What a vessel brings to the network: its strongest enabled antenna and its command sources. */
interface Node {
	id: EntityId;
	/** 0 without an enabled antenna; -1 without any antenna. */
	range: number;
	/** Some control source sits on a part with seats. */
	crewed: boolean;
	/** Has a control source, and all of them sit on parts without seats. */
	probe: boolean;
}

function nodeOf(core: SimCore, id: EntityId): Node {
	let range = -1;
	let crewed = false;
	let sources = 0;
	for (const partId of vesselOf(core, id).parts) {
		const part = partOf(core, partId);
		const seats = (partDefOf(core, part).crewCapacity ?? 0) > 0;
		for (const m of part.modules) {
			const def = moduleDefOf(core, m.id);
			if (def.controlSource) {
				sources += 1;
				if (seats) crewed = true;
			}
			if (def.antenna) {
				const a = def.antenna(m.config, moduleState(core, partId, m.id));
				const rating = core.registries.antennas.get(a.antenna)?.range ?? 0;
				range = Math.max(range, a.enabled ? rating : 0);
			}
		}
	}
	return { id, range, crewed, probe: sources > 0 && !crewed };
}

/** The geometry of one sample time: bodies, stations and vessels in the system frame. */
interface Frame {
	t: number;
	bodies: Array<{ body: BodyRuntime; centre: Vec3 }>;
	stations: Vec3[];
	position(id: EntityId): Vec3;
}

function frameAt(core: SimCore, t: number, stations: Station[]): Frame {
	const centres = new Map<string, Vec3>();
	const centre = (body: BodyRuntime): Vec3 => {
		let c = centres.get(body.def.id);
		if (!c) {
			c = systemPosition(body, t);
			centres.set(body.def.id, c);
		}
		return c;
	};
	const bodies = [...core.bodies.values()].map((body) => ({ body, centre: centre(body) }));
	return {
		t,
		bodies,
		stations: stations.map((s) =>
			add(centre(s.body), qRotate(qAboutY(s.body.omega * t), scale(s.dir, s.radius)))
		),
		position(id) {
			const vessel = vesselOf(core, id);
			const body = bodyById(core, vessel.soi);
			const r = vessel.rails ? railsMotion(body, vessel.rails, t).r : vessel.com;
			return add(centre(body), r);
		}
	};
}

/** The first body or terrain the segment a→b runs into, or undefined. */
function blocker(frame: Frame, a: Vec3, b: Vec3): string | undefined {
	const ab = sub(b, a);
	const len2 = dot(ab, ab);
	for (const { body, centre } of frame.bodies) {
		const s = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(centre, a), ab) / len2)) : 0;
		const closest = add(a, scale(ab, s));
		const d = length(sub(closest, centre));
		const R = body.def.radius;
		if (d < R - 1) return `blocked by ${body.def.id}`;
		const terrain = body.terrain;
		if (!terrain || d > R + terrain.maxHeight) continue;
		const turn = qAboutY(-body.omega * frame.t);
		for (let k = 0; k < TERRAIN_SAMPLES; k++) {
			const p = sub(add(a, scale(ab, (k + 0.5) / TERRAIN_SAMPLES)), centre);
			const altitude = length(p) - R;
			if (altitude > terrain.maxHeight) continue;
			if (terrain.heightAt(normalize(qRotate(turn, p))) > altitude + 1) return 'blocked by terrain';
		}
	}
	return undefined;
}

/** 0..1 plasma blackout of a vessel in flight in an atmosphere, now. */
function blackoutOf(core: SimCore, id: EntityId): number {
	const vessel = vesselOf(core, id);
	if (vessel.rails) return 0;
	const body = bodyById(core, vessel.soi);
	if (!body.def.atmosphere) return 0;
	const air = sub(vessel.velocity, cross({ x: 0, y: body.omega, z: 0 }, vessel.com));
	const { density } = ambientAt(body.def, length(vessel.com) - body.def.radius);
	return blackoutLevelFromFlux(stagnationFlux(density, BLACKOUT_NOSE_RADIUS, length(air)));
}

interface Evaluation {
	to: string | null;
	reason: LinkReason | null;
}

/** The link of `node` at `frame` (ADR 0179 point 3). */
function linkOf(
	core: SimCore,
	frame: Frame,
	node: Node,
	points: Node[],
	stations: Station[],
	blackout: number
): Evaluation {
	if (node.range < 0) return { to: null, reason: 'no antenna' };
	if (node.range === 0) return { to: null, reason: 'antennas off' };
	if (blackout >= BLACKOUT_BADGE_LEVEL) return { to: null, reason: 'plasma blackout' };
	const scaleRule = ruleOf(core, COMMS_RULES.scale);
	const factor = typeof scaleRule === 'number' ? scaleRule : 1;
	const here = frame.position(node.id);
	const candidates: Array<{ id: string; at: Vec3; range: number; d: number }> = [];
	stations.forEach((s, i) => {
		const at = frame.stations[i]!;
		candidates.push({ id: s.id, at, range: s.range, d: length(sub(at, here)) });
	});
	for (const p of points) {
		if (p.id === node.id || p.range <= 0) continue;
		const at = frame.position(p.id);
		candidates.push({ id: `vessel:${p.id}`, at, range: p.range, d: length(sub(at, here)) });
	}
	candidates.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
	let first: LinkReason = 'out of range';
	let inRange = false;
	for (const c of candidates) {
		if (c.d > linkRange(node.range, c.range, factor)) continue;
		const blocked = blocker(frame, here, c.at) as LinkReason | undefined;
		if (!blocked) return { to: c.id, reason: null };
		if (!inRange) first = blocked;
		inRange = true;
	}
	return { to: null, reason: first };
}

function controlFor(core: SimCore, node: Node, linked: boolean): ControlState {
	if (!node.probe || linked) return 'full';
	const rule = ruleOf(core, COMMS_RULES.controlWithoutSignal);
	return rule === 'partial' || rule === 'none' ? rule : 'full';
}

/**
 * Updates the network after a step or rails chunk that ended at `core.t` (ADR 0179 point 4):
 * when due or dirty, samples from the last update (at most `NETWORK_SAMPLE` apart), dates each
 * change by bisection when the vessel is on rails, and emits the events. The first update after
 * creation or resume is silent.
 */
export function updateNetwork(core: SimCore): void {
	const comms = core.comms;
	if (!commsOn(core)) {
		comms.links.clear();
		comms.last = null;
		return;
	}
	const due = comms.last === null || core.t - comms.last >= NETWORK_INTERVAL - 1e-9;
	if (!due && !comms.dirty) return;
	const silent = comms.last === null;
	const from = comms.last ?? core.t;
	comms.dirty = false;
	comms.last = core.t;
	const stations = stationsOf(core);
	const nodes = vesselIds(core).map((id) => nodeOf(core, id));
	const points = nodes.filter((n) => n.crewed);
	const blackout = new Map(nodes.map((n) => [n.id, blackoutOf(core, n.id)]));
	// Sample times: every NETWORK_SAMPLE seconds after `from`, then now.
	const times: number[] = [];
	for (let t = from + NETWORK_SAMPLE; t < core.t - 1e-9; t += NETWORK_SAMPLE) times.push(t);
	times.push(core.t);
	const seen = new Set<EntityId>();
	let prevT = from;
	for (const t of times) {
		const frame = frameAt(core, t, stations);
		for (const node of nodes) {
			seen.add(node.id);
			const now = linkOf(core, frame, node, points, stations, blackout.get(node.id)!);
			const before = comms.links.get(node.id);
			const control = controlFor(core, node, now.to !== null);
			const next: VesselLink = { ...now, control, blackout: blackout.get(node.id)! };
			comms.links.set(node.id, next);
			if (silent || !before) continue;
			if ((before.to === null) !== (now.to === null)) {
				const when = vesselOf(core, node.id).rails
					? bisect(core, node, points, stations, prevT, t, before.to !== null)
					: t;
				if (now.to !== null)
					core.events.emit('comms:link-up', { vessel: node.id, to: now.to, time: when });
				else
					core.events.emit('comms:link-down', { vessel: node.id, reason: now.reason!, time: when });
			}
			if (before.control !== control) {
				core.events.emit('comms:control-changed', { vessel: node.id, control });
			}
		}
		prevT = t;
	}
	for (const id of [...comms.links.keys()]) if (!seen.has(id)) comms.links.delete(id);
}

/** The time in (lo, hi] at which the link of `node` stops being `wasLinked`. */
function bisect(
	core: SimCore,
	node: Node,
	points: Node[],
	stations: Station[],
	lo: number,
	hi: number,
	wasLinked: boolean
): number {
	while (hi - lo > LINK_TIME_TOLERANCE) {
		const mid = (lo + hi) / 2;
		const linked =
			linkOf(core, frameAt(core, mid, stations), node, points, stations, 0).to !== null;
		if (linked === wasLinked) lo = mid;
		else hi = mid;
	}
	return hi;
}

/** The vessel's signal for modules (`ctx.vessel.signal()`), as of the last update. */
export function signalOf(core: SimCore, id: EntityId): SignalState {
	const link = core.comms.links.get(id);
	if (!link)
		return { connected: commsOn(core) ? false : true, to: null, reason: null, control: 'full' };
	return { connected: link.to !== null, to: link.to, reason: link.reason, control: link.control };
}

/** Commands each control state refuses (ADR 0179 point 5). */
const REFUSED: Record<ControlState, ReadonlySet<string>> = {
	full: new Set(),
	partial: new Set(['throttle', 'attitude']),
	none: new Set(['throttle', 'attitude', 'sas', 'stage', 'action', 'action-group'])
};

/**
 * Why `command` is refused for vessel `id` for lack of signal, or undefined. Brings the network
 * up to date first when it is dirty (a command is an input, so this stays deterministic).
 */
export function signalRefusal(core: SimCore, id: EntityId, command: string): string | undefined {
	if (!commsOn(core)) return undefined;
	if (core.comms.dirty || core.comms.last === null) updateNetwork(core);
	const link = core.comms.links.get(id);
	if (!link || !REFUSED[link.control].has(command)) return undefined;
	return `no signal (${link.reason}): probe control is ${link.control} (stock.control-without-signal)`;
}

/** `Snapshot.network`: computed fresh (without storing) when the network is dirty. */
export function networkSnapshot(core: SimCore): Snapshot['network'] | undefined {
	if (!commsOn(core)) return undefined;
	const stations = stationsOf(core);
	const frame = frameAt(core, core.t, stations);
	let links = core.comms.links;
	if (core.comms.dirty || core.comms.last === null) {
		links = new Map();
		const nodes = vesselIds(core).map((id) => nodeOf(core, id));
		const points = nodes.filter((n) => n.crewed);
		for (const node of nodes) {
			const b = blackoutOf(core, node.id);
			const now = linkOf(core, frame, node, points, stations, b);
			links.set(node.id, { ...now, control: controlFor(core, node, now.to !== null), blackout: b });
		}
	}
	return {
		stations: stations.map((s, i) => ({
			id: s.id,
			label: s.label,
			body: s.body.def.id,
			position: frame.stations[i]!,
			range: s.range
		})),
		vessels: [...links.entries()]
			.sort(([a], [b]) => a - b)
			.map(([vessel, l]) => ({
				vessel,
				to: l.to,
				reason: l.reason,
				control: l.control,
				blackout: l.blackout
			}))
	};
}
