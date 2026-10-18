/**
 * Comms tier 1 (plan 114, ADR 0179): ground stations, direct links with line of sight past bodies
 * and terrain, plasma blackout, the update cadence with bisection under warp, and probe control.
 * Tier 2 (plan 116, ADR 0185): each link's Friis budget and rate on the best common band.
 * Links are derived: they live beside the world, are never saved, and are recomputed on resume.
 */
import { isFailed } from './reliability.ts';
import { queuesSnapshot, stepTransmissions } from './transmission.ts';
import { routable } from './agencies.ts';
import {
	BLACKOUT_BADGE_LEVEL,
	BLACKOUT_NOSE_RADIUS,
	blackoutLevelFromFlux,
	COMMS_NODE,
	COMMS_RULES,
	antennaGain,
	beamWidthOf,
	CAPACITY_ROUNDS,
	ENCRYPTION_OVERHEAD,
	INTERFERENCE_CAP_DB,
	INTERFERENCE_DB,
	dishGain,
	SPEED_OF_LIGHT,
	linkBudget,
	linkRange,
	rateForMargin,
	sitesOf,
	SITE_STATION_APERTURES,
	SITE_STATION_RANGES,
	STATION_MAST,
	type AntennaDefinition,
	type ControlState,
	type EntityId,
	type LinkBudget,
	type LinkReason,
	type RouteMode,
	type CommandResult,
	CONTACT_SCAN_STEP,
	DEFAULT_CHANNELS,
	DEFAULT_LICENCE,
	LICENCE_CAUSE,
	licensed,
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
import { economyOn, record, ruleOf } from './economy.ts';
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
	/** Dish diameter, m: receives on every band (ADR 0185 point 3). */
	aperture: number;
}

export interface VesselLink {
	/** The first hop (plan 117): a station id or `vessel:<id>`; null without a link. */
	to: string | null;
	reason: LinkReason | null;
	control: ControlState;
	blackout: number;
	/** The first hop's downlink budget (ADR 0185); null without a link or a common known band. */
	budget: LinkBudget | null;
	/** Hop ids to the control point (ADR 0188); empty without a link. */
	route: string[];
	/** Light time along the route, s; null without a link. */
	latency: number | null;
	/** The shared rate along the route, bit/s (ADR 0188 point 4); null without a budget. */
	rate: number | null;
	/** Without a route: vessels it still reaches and those edges' rates (ADR 0189 point 4). */
	neighbors: Array<{ vessel: EntityId; rate: number }>;
}

export interface CommsRuntime {
	/** Last network update time, s; null before the first. */
	last: number | null;
	dirty: boolean;
	links: Map<EntityId, VesselLink>;
	/** Built on first use; reset when buildings or sites change. */
	stations: Station[] | null;
	/** The vessel whose full budget the snapshot carries (`comms-inspect`; view state, not saved). */
	inspect: EntityId | null;
}

export const freshComms = (): CommsRuntime => ({
	last: null,
	dirty: true,
	links: new Map(),
	stations: null,
	inspect: null
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
	range: number,
	aperture: number
): Station | undefined {
	if (!core.bodies.has(bodyId)) return undefined;
	const body = bodyById(core, bodyId);
	const dir = bodyFixedDir(latitude, longitude);
	const ground = body.terrain ? body.terrain.heightAt(dir) : 0;
	return { id, label, body, dir, radius: body.def.radius + ground + mast, range, aperture };
}

/** Every world site (tier from its active comms-node buildings), then registered stations. */
export function stationsOf(core: SimCore): Station[] {
	if (core.comms.stations) return core.comms.stations;
	const out: Station[] = [];
	for (const site of sitesOf(core.info)) {
		let tier = 1;
		for (const b of site.buildings ?? []) {
			// an upgrading dish works at its level (plan 096, ADR 0123 point 2)
			if (b.state !== 'active' && b.state !== 'upgrading') continue;
			const level = core.registries.buildings.get(b.kind)?.levels[b.level];
			tier = Math.max(tier, level?.capacity[COMMS_NODE] ?? 0);
		}
		const index = Math.min(tier, SITE_STATION_RANGES.length) - 1;
		const range = SITE_STATION_RANGES[index]!;
		const s = station(
			core,
			`site:${site.id}`,
			site.name,
			site.body,
			site.latitude,
			site.longitude,
			STATION_MAST,
			range,
			SITE_STATION_APERTURES[index]!
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
			def.range,
			def.aperture ?? SITE_STATION_APERTURES[0]
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
	/** Its enabled, working antennas (for the link budget). */
	antennas: AntennaDefinition[];
	/** The same antennas with where each points (plan 117, ADR 0188 point 2; null: Auto). */
	pointing: Array<{
		antenna: AntennaDefinition;
		target: string | null;
		/** Its channel and encryption (plan 120, ADR 0191 point 1). */
		channel: number;
		encrypted: boolean;
	}>;
}

function nodeOf(core: SimCore, id: EntityId): Node {
	let range = -1;
	let crewed = false;
	let sources = 0;
	const antennas: AntennaDefinition[] = [];
	const pointing: Node['pointing'] = [];
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
				const antenna = core.registries.antennas.get(a.antenna);
				// a failed antenna is dead (plan 130, ADR 0156 point 2)
				const on = a.enabled && !isFailed(core, partId, m.id);
				range = Math.max(range, on ? (antenna?.range ?? 0) : 0);
				if (on && antenna) {
					antennas.push(antenna);
					pointing.push({
						antenna,
						target: a.target ?? null,
						channel: a.channel ?? 0,
						encrypted: a.encrypted === true
					});
				}
			}
		}
	}
	return { id, range, crewed, probe: sources > 0 && !crewed, antennas, pointing };
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
	budget: LinkBudget | null;
}

/** The budget's receiving end: a station's dish, or a control point's antennas. */
type Receiver = { aperture: number } | { antennas: AntennaDefinition[] };

/**
 * The best downlink budget from `node` to `rx` over `distance` m (ADR 0185 point 5): every pair
 * of a transmitter with a known band and a receiver on that band; the highest margin wins.
 */
export function bestBudget(
	core: SimCore,
	node: Pick<Node, 'antennas'> & Partial<Pick<Node, 'pointing'>>,
	rx: Receiver,
	distance: number,
	scale: number
): LinkBudget | null {
	let best: LinkBudget | null = null;
	const radios =
		node.pointing ?? node.antennas.map((antenna) => ({ antenna, channel: 0, encrypted: false }));
	for (const { antenna: tx, channel, encrypted } of radios) {
		const band = tx.band === undefined ? undefined : core.registries.bands.get(tx.band);
		if (!band) continue;
		const gains =
			'aperture' in rx
				? [dishGain(rx.aperture, band.frequency)]
				: rx.antennas.filter((a) => a.band === band.id).map((a) => antennaGain(a, band));
		for (const rxGain of gains) {
			const b = linkBudget({
				power: tx.power,
				txGain: antennaGain(tx, band),
				rxGain,
				distance,
				scale,
				band
			});
			if (!best || b.margin > best.margin) best = { ...b, channel, encrypted };
		}
	}
	return best;
}

/** The link of `node` at `frame` (ADR 0179 point 3). */
function linkOf(
	core: SimCore,
	frame: Frame,
	node: Node,
	points: Node[],
	stations: Station[],
	blackout: number,
	withBudget = true
): Evaluation {
	if (node.range < 0) return { to: null, reason: 'no antenna', budget: null };
	if (node.range === 0) return { to: null, reason: 'antennas off', budget: null };
	if (blackout >= BLACKOUT_BADGE_LEVEL)
		return { to: null, reason: 'plasma blackout', budget: null };
	const scaleRule = ruleOf(core, COMMS_RULES.scale);
	const factor = typeof scaleRule === 'number' ? scaleRule : 1;
	const here = frame.position(node.id);
	const candidates: Array<{ id: string; at: Vec3; range: number; d: number; rx: Receiver }> = [];
	stations.forEach((s, i) => {
		const at = frame.stations[i]!;
		const rx = { aperture: s.aperture };
		candidates.push({ id: s.id, at, range: s.range, d: length(sub(at, here)), rx });
	});
	for (const p of points) {
		if (p.id === node.id || p.range <= 0) continue;
		const at = frame.position(p.id);
		const rx = { antennas: p.antennas };
		candidates.push({ id: `vessel:${p.id}`, at, range: p.range, d: length(sub(at, here)), rx });
	}
	candidates.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
	let first: LinkReason = 'out of range';
	let inRange = false;
	for (const c of candidates) {
		if (c.d > linkRange(node.range, c.range, factor)) continue;
		const blocked = blocker(frame, here, c.at) as LinkReason | undefined;
		if (!blocked) {
			const budget = withBudget ? bestBudget(core, node, c.rx, c.d, factor) : null;
			return { to: c.id, reason: null, budget };
		}
		if (!inRange) first = blocked;
		inRange = true;
	}
	return { to: null, reason: first, budget: null };
}

function controlFor(core: SimCore, node: Node, linked: boolean): ControlState {
	if (!node.probe || linked) return 'full';
	const rule = ruleOf(core, COMMS_RULES.controlWithoutSignal);
	return rule === 'partial' || rule === 'none' ? rule : 'full';
}

// ---- routing (plan 117, ADR 0188) ----

/** A vertex of the routing graph: a station or a vessel with a working antenna. */
interface Vertex {
	id: string;
	at: Vec3;
	/** A station, or a vessel with a crewed command part. */
	control: boolean;
	/** The vessel's node; undefined for a station. */
	node?: Node;
	station?: Station;
}

interface Edge {
	to: number;
	d: number;
}

export interface Routed {
	to: string | null;
	reason: LinkReason | null;
	budget: LinkBudget | null;
	route: string[];
	latency: number | null;
	rate: number | null;
	/** Without a route: the vessels it still has an edge to, and that edge's rate (ADR 0189 point 4). */
	neighbors: Array<{ vessel: EntityId; rate: number }>;
}

/** The direction a pointing target names, from `here`; null for an unknown target. */
function targetPosition(
	core: SimCore,
	frame: Frame,
	stations: Station[],
	target: string
): Vec3 | null {
	const i = stations.findIndex((s) => s.id === target);
	if (i >= 0) return frame.stations[i]!;
	if (target.startsWith('vessel:')) {
		const id = Number(target.slice(7)) as EntityId;
		return vesselIds(core).includes(id) ? frame.position(id) : null;
	}
	const body = frame.bodies.find((b) => b.body.def.id === target);
	return body ? body.centre : null;
}

const angleBetween = (a: Vec3, b: Vec3): number => {
	const la = length(a);
	const lb = length(b);
	if (la === 0 || lb === 0) return 0;
	return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb))));
};

/** The strongest range rating of `node`'s antennas that may reach `other` (ADR 0188 point 2). */
function rangeToward(
	core: SimCore,
	frame: Frame,
	stations: Station[],
	node: Node,
	here: Vec3,
	other: Vec3
): number {
	let best = 0;
	for (const { antenna, target } of node.pointing) {
		if (antenna.range <= best) continue;
		if (antenna.kind === 'dish' && target !== null) {
			const aim = targetPosition(core, frame, stations, target);
			if (!aim) continue;
			const band = antenna.band === undefined ? undefined : core.registries.bands.get(antenna.band);
			if (angleBetween(sub(aim, here), sub(other, here)) > beamWidthOf(antenna, band) / 2) continue;
		}
		best = antenna.range;
	}
	return best;
}

const routeKey = (width: number, hops: number, dist: number) => ({ width, hops, dist });
type Key = ReturnType<typeof routeKey>;
/** Wider first, then fewer hops, then shorter. */
const better = (a: Key, b: Key): boolean =>
	a.width !== b.width ? a.width > b.width : a.hops !== b.hops ? a.hops < b.hops : a.dist < b.dist;

/** A binary heap; `first(a, b)` is true when `a` comes out before `b`. */
class Heap<T> {
	private readonly items: T[] = [];
	constructor(private readonly first: (a: T, b: T) => boolean) {}
	push(x: T): void {
		const a = this.items;
		a.push(x);
		for (let i = a.length - 1; i > 0;) {
			const p = (i - 1) >> 1;
			if (!this.first(a[i]!, a[p]!)) break;
			[a[i], a[p]] = [a[p]!, a[i]!];
			i = p;
		}
	}
	pop(): T | undefined {
		const a = this.items;
		if (a.length === 0) return undefined;
		const top = a[0]!;
		const last = a.pop()!;
		if (a.length === 0) return top;
		a[0] = last;
		for (let i = 0; ;) {
			const l = 2 * i + 1;
			const r = l + 1;
			let m = i;
			if (l < a.length && this.first(a[l]!, a[m]!)) m = l;
			if (r < a.length && this.first(a[r]!, a[m]!)) m = r;
			if (m === i) break;
			[a[i], a[m]] = [a[m]!, a[i]!];
			i = m;
		}
		return top;
	}
}

/**
 * Links of every vessel at `frame` through the routing graph (ADR 0188 points 1 to 5): the edges,
 * each vessel's route by its mode, the shared capacity and the latency. `withBudget` computes the
 * budgets and capacities (the last sample of an update); without it every edge counts as 1.
 */
function routeNetwork(
	core: SimCore,
	frame: Frame,
	nodes: Node[],
	stations: Station[],
	blackout: ReadonlyMap<EntityId, number>,
	withBudget: boolean
): Map<EntityId, Routed> {
	// no vessel, no route: warping an empty sky costs nothing more than tier 1 did
	if (nodes.length === 0) return new Map();
	const scaleRule = ruleOf(core, COMMS_RULES.scale);
	const factor = typeof scaleRule === 'number' ? scaleRule : 1;
	const vertices: Vertex[] = stations.map((s, i) => ({
		id: s.id,
		at: frame.stations[i]!,
		control: true,
		station: s
	}));
	for (const node of nodes) {
		if (node.range <= 0 || blackout.get(node.id)! >= BLACKOUT_BADGE_LEVEL) continue;
		vertices.push({
			id: `vessel:${node.id}`,
			at: frame.position(node.id),
			control: node.crewed,
			node
		});
	}
	const index = new Map(vertices.map((v, i) => [v.id, i]));
	const edges: Edge[][] = vertices.map(() => []);
	/** Edge length by neighbour, for O(1) lookups along a route. */
	const across: Array<Map<number, number>> = vertices.map(() => new Map());
	// the largest rating of each vertex, and whether a pointed dish may narrow it
	const maxRange = vertices.map((v) => (v.station ? v.station.range : v.node!.range));
	const pointed = vertices.map(
		(v) => !!v.node?.pointing.some((p) => p.antenna.kind === 'dish' && p.target !== null)
	);
	const f2 = factor * factor;
	const tryPair = (i: number, j: number): void => {
		const a = vertices[i]!;
		const b = vertices[j]!;
		const dx = b.at.x - a.at.x;
		const dy = b.at.y - a.at.y;
		const dz = b.at.z - a.at.z;
		const d2 = dx * dx + dy * dy + dz * dz;
		// a cheap reject before the pointing and line-of-sight checks
		if (d2 > maxRange[i]! * maxRange[j]! * f2) return;
		const d = Math.sqrt(d2);
		const ra = pointed[i] ? rangeToward(core, frame, stations, a.node!, a.at, b.at) : maxRange[i]!;
		const rb = pointed[j] ? rangeToward(core, frame, stations, b.node!, b.at, a.at) : maxRange[j]!;
		if (ra <= 0 || rb <= 0 || d > linkRange(ra, rb, factor)) return;
		if (blocker(frame, a.at, b.at)) return;
		edges[i]!.push({ to: j, d });
		edges[j]!.push({ to: i, d });
		across[i]!.set(j, d);
		across[j]!.set(i, d);
	};
	// stations with every vessel; vessels with each other by sweep and prune along x: two vessels
	// never link farther apart than the largest vessel rating times the scale
	const ns = stations.length;
	for (let i = 0; i < ns; i++) for (let j = ns; j < vertices.length; j++) tryPair(i, j);
	const sweep = vertices
		.map((_, i) => i)
		.slice(ns)
		.sort((p, q) => vertices[p]!.at.x - vertices[q]!.at.x || p - q);
	let reach = 0;
	for (let i = ns; i < vertices.length; i++) reach = Math.max(reach, maxRange[i]! * factor);
	for (let a = 0; a < sweep.length; a++) {
		const i = sweep[a]!;
		for (let b = a + 1; b < sweep.length; b++) {
			const j = sweep[b]!;
			if (vertices[j]!.at.x - vertices[i]!.at.x > reach) break;
			tryPair(Math.min(i, j), Math.max(i, j));
		}
	}
	// capacity of u transmitting to v, memoized (tier-2 budget; 0 is commands only)
	const budgets = new Map<string, LinkBudget | null>();
	const budgetOf = (u: number, v: number, d: number): LinkBudget | null => {
		const k = `${u}>${v}`;
		if (!budgets.has(k)) {
			const from = vertices[u]!;
			const to = vertices[v]!;
			const rx: Receiver = to.station
				? { aperture: to.station.aperture }
				: { antennas: to.node!.antennas };
			budgets.set(k, from.node ? bestBudget(core, from.node, rx, d, factor) : null);
		}
		return budgets.get(k)!;
	};
	// The margin falls by 20·log10(d) from its value at 1 m (effective), so one budget per pair of
	// antenna sets is enough for every edge's capacity; the full budget is only for first hops.
	const signature = (v: Vertex): string =>
		v.station ? `aperture:${v.station.aperture}` : v.node!.antennas.map((a) => a.id).join(',');
	const reference = new Map<string, number | null>();
	const capacity = (u: number, v: number, d: number): number => {
		if (!withBudget) return 1;
		const from = vertices[u]!;
		const to = vertices[v]!;
		if (!from.node) return 0;
		const k = `${signature(from)}>${signature(to)}`;
		if (!reference.has(k)) {
			const rx: Receiver = to.station
				? { aperture: to.station.aperture }
				: { antennas: to.node!.antennas };
			reference.set(k, bestBudget(core, from.node, rx, factor, factor)?.margin ?? null);
		}
		const m1 = reference.get(k)!;
		return m1 === null ? 0 : rateForMargin(m1 - 20 * Math.log10(d / factor));
	};
	// the widest-path tree towards the control points (multi-source, O(V²))
	const n = vertices.length;
	const key: Array<Key | null> = vertices.map((v) => (v.control ? routeKey(Infinity, 0, 0) : null));
	const next: Array<number | null> = vertices.map(() => null);
	const done = new Array<boolean>(n).fill(false);
	// each entry keeps the key it was pushed with: a later, better key pushes a new entry
	const heap = new Heap<{ v: number; k: Key }>(
		(a, b) => better(a.k, b.k) || (!better(b.k, a.k) && vertices[a.v]!.id < vertices[b.v]!.id)
	);
	for (let v = 0; v < n; v++) if (key[v]) heap.push({ v, k: key[v]! });
	for (;;) {
		const entry = heap.pop();
		if (entry === undefined) break;
		const pick = entry.v;
		if (done[pick]) continue; // a stale entry: settled already with a better key
		done[pick] = true;
		const kp = key[pick]!;
		for (const e of edges[pick]!) {
			const u = e.to; // u transmits towards pick
			if (done[u] || vertices[u]!.control) continue;
			const k = routeKey(Math.min(kp.width, capacity(u, pick, e.d)), kp.hops + 1, kp.dist + e.d);
			const cur = key[u];
			if (
				!cur ||
				better(k, cur) ||
				(!better(cur, k) && next[u] !== null && vertices[pick]!.id < vertices[next[u]!]!.id)
			) {
				key[u] = k;
				next[u] = pick;
				heap.push({ v: u, k });
			}
		}
	}
	const pathFrom = (i: number): number[] | null => {
		if (vertices[i]!.control) return [];
		const out: number[] = [];
		for (let c: number | null = next[i] ?? null; c !== null; c = next[c] ?? null) {
			out.push(c);
			if (vertices[c]!.control) return out;
			if (out.length > n) return null;
		}
		return null;
	};
	interface Choice {
		hops: number[];
		width: number;
		dist: number;
	}
	/** The best route through each neighbour, not coming back through `i`. */
	const candidates = (i: number): Choice[] => {
		const out: Choice[] = [];
		for (const e of edges[i]!) {
			const rest = pathFrom(e.to);
			if (!rest || rest.includes(i)) continue;
			const hops = [e.to, ...rest];
			const k = key[e.to]!;
			out.push({ hops, width: Math.min(capacity(i, e.to, e.d), k.width), dist: e.d + k.dist });
		}
		return out.sort((a, b) =>
			better(routeKey(a.width, a.hops.length, a.dist), routeKey(b.width, b.hops.length, b.dist))
				? -1
				: better(routeKey(b.width, b.hops.length, b.dist), routeKey(a.width, a.hops.length, a.dist))
					? 1
					: vertices[a.hops[0]!]!.id < vertices[b.hops[0]!]!.id
						? -1
						: 1
		);
	};
	const modes = new Map(core.commsState.routes.map((r) => [r.vessel, r.mode]));
	const out = new Map<EntityId, Routed>();
	const flows: Array<{ vessel: EntityId; edges: Array<[number, number, number]>; share: number }> =
		[];
	for (const node of nodes) {
		const i = index.get(`vessel:${node.id}`);
		const neighbours = (): Routed['neighbors'] =>
			i === undefined
				? []
				: edges[i]!.filter((e) => vertices[e.to]!.node).map((e) => ({
						vessel: vertices[e.to]!.node!.id,
						rate: capacity(i, e.to, e.d)
					}));
		const unlinked = (reason: LinkReason | null): Routed => ({
			to: null,
			reason:
				reason ??
				linkOf(
					core,
					frame,
					node,
					nodes.filter((p) => p.crewed),
					stations,
					blackout.get(node.id)!,
					false
				).reason,
			budget: null,
			route: [],
			latency: null,
			rate: null,
			neighbors: neighbours()
		});
		if (i === undefined) {
			out.set(node.id, unlinked(null));
			continue;
		}
		const mode = modes.get(Number(node.id)) ?? { kind: 'auto' as const };
		let choice: Choice | null = null;
		let broken: LinkReason | null = null;
		if (mode.kind === 'manual') {
			const hops: number[] = [];
			let from = i;
			let dist = 0;
			let width = Infinity;
			for (const id of mode.via) {
				const to = index.get(id);
				const d = to === undefined ? undefined : across[from]!.get(to);
				if (to === undefined || d === undefined) {
					broken = `route broken at ${id}`;
					break;
				}
				hops.push(to);
				width = Math.min(width, capacity(from, to, d));
				dist += d;
				from = to;
			}
			if (!broken && !vertices[from]!.control) broken = `route broken at ${mode.via.at(-1)!}`;
			if (!broken) choice = { hops, width, dist };
		} else if (mode.kind === 'auto' && !vertices[i]!.control) {
			// a probe's Auto route is its branch of the widest-path tree
			const hops = pathFrom(i);
			if (hops && hops.length > 0) choice = { hops, width: key[i]!.width, dist: key[i]!.dist };
		} else {
			const list = candidates(i);
			if (list.length > 0) {
				choice = list[0]!;
				const policy =
					mode.kind === 'policy' ? core.registries.routePolicies.get(mode.policy) : undefined;
				if (policy) {
					const k = policy.choose(
						list.map((c) => ({
							hops: c.hops.map((h) => vertices[h]!.id),
							width: c.width,
							latency: c.dist / SPEED_OF_LIGHT
						}))
					);
					choice = list[Math.max(0, Math.min(list.length - 1, Math.floor(k)))] ?? choice;
				}
			}
		}
		if (!choice) {
			out.set(node.id, unlinked(broken));
			continue;
		}
		const first = choice.hops[0]!;
		const firstD = across[i]!.get(first)!;
		const path: Array<[number, number, number]> = [];
		let from = i;
		for (const h of choice.hops) {
			path.push([from, h, across[from]!.get(h)!]);
			from = h;
		}
		flows.push({ vessel: node.id, edges: path, share: choice.width });
		out.set(node.id, {
			to: vertices[first]!.id,
			reason: null,
			budget: withBudget ? budgetOf(i, first, firstD) : null,
			route: choice.hops.map((h) => vertices[h]!.id),
			latency: choice.dist / SPEED_OF_LIGHT,
			rate: null,
			neighbors: []
		});
	}
	if (withBudget) {
		// interference between first hops on one band and channel that reach each other's
		// receiver, then encryption's overhead (plan 120, ADR 0191 points 3 and 4)
		const firsts = flows.map((f) => ({
			f,
			tx: f.edges[0]![0],
			rx: f.edges[0]![1],
			b: out.get(f.vessel)!.budget
		}));
		const interfere = ruleOf(core, COMMS_RULES.interference) !== false;
		for (const a of firsts) {
			if (!a.b) continue;
			let n = 0;
			if (interfere) {
				for (const o of firsts) {
					if (o === a || !o.b || o.b.band !== a.b.band || o.b.channel !== a.b.channel) continue;
					if (o.tx === a.rx || across[o.tx]!.has(a.rx)) n += 1;
				}
			}
			const loss = Math.min(INTERFERENCE_CAP_DB, INTERFERENCE_DB * n);
			const margin = a.b.margin - loss;
			const rate = rateForMargin(margin) * (a.b.encrypted ? ENCRYPTION_OVERHEAD : 1);
			const b = { ...a.b, margin, interference: loss, rate };
			out.get(a.f.vessel)!.budget = b;
			a.f.share = Math.min(a.f.share, rate);
		}
		// shared capacity: bounded proportional rounds (ADR 0188 point 4)
		const keyOf = (e: [number, number, number]) => `${e[0]}>${e[1]}`;
		const onEdge = new Map<string, { cap: number; flows: typeof flows }>();
		for (const f of flows)
			for (const e of f.edges) {
				const k = keyOf(e);
				const entry = onEdge.get(k) ?? { cap: capacity(e[0], e[1], e[2]), flows: [] };
				entry.flows.push(f);
				onEdge.set(k, entry);
			}
		const order = [...onEdge.keys()].sort();
		for (let round = 0; round < CAPACITY_ROUNDS; round++) {
			for (const k of order) {
				const { cap, flows: fs } = onEdge.get(k)!;
				const total = fs.reduce((sum, f) => sum + f.share, 0);
				if (total > cap && total > 0) for (const f of fs) f.share *= cap / total;
			}
		}
		for (const f of flows) {
			const r = out.get(f.vessel)!;
			r.rate = r.budget ? f.share : null;
		}
	}
	return out;
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
	const nodes = networkVessels(core).map((id) => nodeOf(core, id));
	// nothing on the network: no links and no events, so the samples need not run (plan 126)
	if (nodes.length === 0) {
		comms.links.clear();
		return;
	}
	const stations = stationsOf(core);
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
		const last = t === times[times.length - 1];
		// the budget only at the update's last sample (ADR 0185 point 8), or at every one while data
		// is being sent (ADR 0189 point 3); routes at every sample
		const sending = core.commsState.transmissions.length > 0;
		const routed = routeNetwork(core, frame, nodes, stations, blackout, last || sending);
		for (const node of nodes) {
			seen.add(node.id);
			const now = routed.get(node.id)!;
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
		// the data moves for the time since the last sample (ADR 0189 point 3)
		if (sending && !silent) stepTransmissions(core, routed, t - prevT, t);
		prevT = t;
	}
	for (const id of [...comms.links.keys()]) if (!seen.has(id)) comms.links.delete(id);
}

/**
 * The next time `vessel` links directly (tier-1 rule) to a station or a crewed vessel, scanning its
 * rails motion every `CONTACT_SCAN_STEP` s up to one home day; null without one (ADR 0189 point 6).
 */
export function nextDirectContact(core: SimCore, vessel: EntityId): number | null {
	if (!commsOn(core)) return null;
	const stations = stationsOf(core);
	const node = nodeOf(core, vessel);
	const points = vesselIds(core)
		.map((id) => nodeOf(core, id))
		.filter((n) => n.crewed);
	const horizon = core.root.def.rotationPeriod;
	for (let dt = CONTACT_SCAN_STEP; dt <= horizon; dt += CONTACT_SCAN_STEP) {
		const t = core.t + dt;
		if (linkOf(core, frameAt(core, t, stations), node, points, stations, 0, false).to !== null)
			return t;
	}
	return null;
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
			linkOf(core, frameAt(core, mid, stations), node, points, stations, 0, false).to !== null;
		if (linked === wasLinked) lo = mid;
		else hi = mid;
	}
	return hi;
}

/** The vessel's signal for modules (`ctx.vessel.signal()`), as of the last update. */
export function signalOf(core: SimCore, id: EntityId): SignalState {
	const link = core.comms.links.get(id);
	if (!link)
		return {
			connected: commsOn(core) ? false : true,
			to: null,
			reason: null,
			control: 'full',
			rate: null,
			latency: null
		};
	return {
		connected: link.to !== null,
		to: link.to,
		reason: link.reason,
		control: link.control,
		rate: link.rate,
		latency: link.latency
	};
}

/** Whether a vessel has an antenna at all, on or off (plan 119). */
export const hasAntenna = (core: SimCore, id: EntityId): boolean => nodeOf(core, id).range >= 0;
/** The vessels on the network: the player's and rented relays, not other agencies' (ADR 0190). */
const networkVessels = (core: SimCore): EntityId[] =>
	vesselIds(core).filter((id) => routable(core, id));

/** A vessel whose control sources all sit on parts without seats (ADR 0179 point 5). */
export const isProbe = (core: SimCore, id: EntityId): boolean => nodeOf(core, id).probe;

/**
 * `licence-buy` (ADR 0191 point 2): a band's channel for this world, at the band's price with the
 * economy on.
 */
export function buyLicence(core: SimCore, bandId: string, channel: number): CommandResult {
	const band = core.registries.bands.get(bandId);
	if (!band) return { ok: false, reason: `no band "${bandId}"` };
	const channels = band.channels ?? DEFAULT_CHANNELS;
	if (channel >= channels)
		return { ok: false, reason: `${band.label} has channels 0 to ${channels - 1}` };
	const s = core.commsState;
	if (licensed(s.licences, bandId, channel))
		return { ok: false, reason: `${band.label} channel ${channel} is licensed already` };
	const price = band.licence ?? DEFAULT_LICENCE;
	if (economyOn(core)) {
		if (core.economy.balances.funds < price)
			return { ok: false, reason: `Not enough funds: the licence costs ${price}` };
		record(core, 'funds', -price, LICENCE_CAUSE, `${bandId}:${channel}`);
	}
	s.licences = [...(s.licences ?? []), { band: bandId, channel }];
	return { ok: true };
}

/**
 * Why `vessel` may not send data now (ADR 0191 point 2): its transmitting antenna's channel has no
 * licence. The transmitter is the one its link uses, else its first antenna on a known band.
 */
export function licenceRefusal(core: SimCore, vessel: EntityId): string | undefined {
	const link = core.comms.links.get(vessel);
	let band = link?.budget?.band;
	let channel = link?.budget?.channel;
	if (band === undefined) {
		const radio = nodeOf(core, vessel).pointing.find(
			(p) => p.antenna.band !== undefined && core.registries.bands.has(p.antenna.band)
		);
		band = radio?.antenna.band;
		channel = radio?.channel;
	}
	if (band === undefined || channel === undefined) return undefined;
	if (licensed(core.commsState.licences, band, channel)) return undefined;
	const label = core.registries.bands.get(band)?.label ?? band;
	return `no licence for ${label} channel ${channel}: buy one first`;
}

/** A vessel's route mode (ADR 0188 point 3): Auto unless one was set. */
export function modeOf(core: SimCore, vessel: EntityId): RouteMode {
	return core.commsState.routes.find((r) => r.vessel === Number(vessel))?.mode ?? { kind: 'auto' };
}

/** `comms-route`: Auto drops the entry. The network updates after the step. */
export function setRouteMode(core: SimCore, vessel: EntityId, mode: RouteMode): void {
	const routes = core.commsState.routes.filter((r) => r.vessel !== Number(vessel));
	if (mode.kind !== 'auto') routes.push({ vessel: Number(vessel), mode });
	core.commsState.routes = routes.sort((a, b) => a.vessel - b.vessel);
	core.comms.dirty = true;
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
		const nodes = networkVessels(core).map((id) => nodeOf(core, id));
		const blackout = new Map(nodes.map((n) => [n.id, blackoutOf(core, n.id)]));
		const routed = routeNetwork(core, frame, nodes, stations, blackout, true);
		for (const node of nodes) {
			const now = routed.get(node.id)!;
			links.set(node.id, {
				...now,
				control: controlFor(core, node, now.to !== null),
				blackout: blackout.get(node.id)!
			});
		}
	}
	const inspected = core.comms.inspect === null ? undefined : links.get(core.comms.inspect);
	const queues = queuesSnapshot(core);
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
				blackout: l.blackout,
				rate: l.rate,
				margin: l.budget?.margin ?? null,
				route: [...l.route],
				latency: l.latency,
				mode: modeOf(core, vessel),
				channel: l.budget?.channel ?? null,
				encrypted: l.budget?.encrypted ?? false,
				interference: l.budget?.interference ?? 0
			})),
		licences: (core.commsState.licences ?? []).map((x) => ({ ...x })),
		...(queues ? { queues } : {}),
		...(inspected
			? {
					inspector: {
						vessel: core.comms.inspect!,
						to: inspected.to,
						budget: inspected.budget && { ...inspected.budget }
					}
				}
			: {})
	};
}
