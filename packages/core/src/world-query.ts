/**
 * The World Query (plan 343, ADR 0292 point 1): one read-only facade over a `Snapshot` that mods
 * read the game through. Systems and autopilots get it as `ctx.world`, panels as `input.world`.
 * Answers in plain types; built from the protocol, never from ECS components, so sim internals
 * can change without breaking mods. Environment-neutral.
 */
import { soiRadius, type OrbitalElements } from '@orbital/kepler';
import type { EntityId } from './ids.ts';
import type { Quat, Vec3 } from './math.ts';
import type { BodyDefinition, ReadonlyRegistry } from './definitions.ts';
import type {
	ResourceSnapshot,
	Snapshot,
	TargetSnapshot,
	VesselMode,
	VesselSnapshot,
	VesselType
} from './protocol.ts';
import { GRAVITATIONAL_CONSTANT } from './units.ts';
import { ambientAt } from './atmosphere.ts';
import { bodyAngularVelocity } from './body-rotation.ts';
import type { Ambient } from './definitions.ts';
import type { OverlayLayer } from './overlays.ts';

/** A vessel's coarse situation (ADR 0292 point 2), KSP's set. */
export const VESSEL_SITUATIONS = [
	'prelaunch',
	'landed',
	'splashed',
	'flying',
	'sub-orbital',
	'orbiting',
	'escaping'
] as const;
export type VesselSituation = (typeof VESSEL_SITUATIONS)[number];

/** A body with its facts and its state now. */
export interface WorldBody {
	id: string;
	/** The body it orbits; null for the root. */
	parent: string | null;
	/** Reference radius, m. */
	radius: number;
	/** Gravitational parameter, m³/s². */
	mu: number;
	/** Top of the atmosphere above `radius`, m; 0 without one. */
	atmosphereHeight: number;
	/** Sphere-of-influence radius, m; Infinity for the root. */
	soi: number;
	star: boolean;
	/** Centre in the root body's inertial frame, m. */
	position: Vec3;
	/** Body-fixed axes relative to the inertial frame. */
	rotation: Quat;
	/** Spin, inertial axes, rad/s (plan 347): the air turns with it. Zero without a definition. */
	angularVelocity: Vec3;
}

export interface WorldVessel {
	id: EntityId;
	name: string;
	type: VesselType;
	/** The agency that owns it (ADR 0190), null for the player's. */
	owner: string | null;
	mode: VesselMode;
	situation: VesselSituation;
	/** Body of its sphere of influence. */
	soi: string;
	/** Root part position relative to `soi`, inertial axes, m. */
	position: Vec3;
	/** Velocity relative to `soi`, m/s. */
	velocity: Vec3;
	/** Position in the root body's inertial frame (comparable across SOIs), m. */
	absolute: Vec3;
	/** Above the body's reference radius, m; null when the body is unknown. */
	altitude: number | null;
	/** Above the ground under it, m; null without terrain or body facts. */
	radarAltitude: number | null;
	/** Speed relative to `soi`, m/s. */
	speed: number;
	parts: number;
	crew: number;
	/** Takes control commands (has a working control source). */
	controlled: boolean;
	orbit: OrbitalElements | null;
	/** Periapsis and apoapsis above the reference radius, m; null without an orbit or body facts (apoapsis null when escaping). */
	periapsis: number | null;
	apoapsis: number | null;
	target: TargetSnapshot | null;
	/** The engaged autopilot's id, or null. */
	autopilot: string | null;
	/** Stages fired so far. */
	stage: number;
	/** Mass, kg, and drag area C_d·A, m² (plan 347, ADR 0296 point 6); null from older hosts. */
	mass: number | null;
	dragArea: number | null;
}

export interface WorldPart {
	id: EntityId;
	vessel: EntityId;
	definition: string;
	/** Index in the vessel's design, or null. */
	index: number | null;
	/** Each module's UI state (its `snapshot` output), by module id. */
	modules: Record<string, unknown>;
	temperature: number | null;
	maxTemperature: number | null;
	resources: ResourceSnapshot[];
	/** Offset from the root part, inertial axes, m. */
	position: Vec3;
}

export interface WorldCrewMember {
	id: string;
	name: string;
	profession: string;
	traits: string[];
	level: number;
	xp: number;
	status: 'available' | 'assigned' | 'missing' | 'lost';
	vessel: EntityId | null;
}

export interface WorldCommsLink {
	/** The hop it links to (station or relay), null without a link. */
	to: string | null;
	control: 'full' | 'partial' | 'none';
	/** Downlink rate, bit/s; null without a budget. */
	rate: number | null;
	/** Light time along the route, s; null without a link. */
	latency: number | null;
	route: string[];
}

export interface WorldSite {
	id: string;
	body: string | null;
	buildings: Array<{ id: string; kind: string; level: number; state: string }>;
	/** Outpost vessels. */
	members: EntityId[];
}

export interface WorldEconomy {
	enabled: boolean;
	funds: number;
	science: number;
	reputation: number;
}

export interface VesselFilter {
	type?: VesselType | readonly VesselType[];
	situation?: VesselSituation | readonly VesselSituation[];
	soi?: string;
	/** `player` for the player's vessels, an agency id for its own; absent: every vessel. */
	owner?: string;
	/** Within `within` metres of a vessel (by id) or of a point in the root frame. */
	near?: { of: EntityId | Vec3; within: number };
	/** Leave out debris (default false). */
	noDebris?: boolean;
	/** Leave these out (the asking vessel). */
	except?: EntityId | readonly EntityId[];
}

export interface WorldQuery {
	/** Sim time, s. */
	readonly time: number;
	readonly paused: boolean;
	/** The world tick's day (ADR 0171), or null. */
	readonly day: number | null;
	/** Every vessel, or those that match. */
	vessels(filter?: VesselFilter): WorldVessel[];
	vessel(id: EntityId): WorldVessel | null;
	/** The first vessel with this name (exact), or null. */
	findVessel(name: string): WorldVessel | null;
	/** The nearest vessel to `of` that matches `filter` (never `of` itself), or null. */
	nearest(of: EntityId, filter?: VesselFilter): WorldVessel | null;
	/** Distance between two vessels, m (across SOIs too), or null when one is gone. */
	distance(a: EntityId, b: EntityId): number | null;
	parts(vessel: EntityId): WorldPart[];
	resources(vessel: EntityId): ResourceSnapshot[];
	/** Amount of `resource` aboard, 0 when none. */
	amount(vessel: EntityId, resource: string): number;
	crewOf(vessel: EntityId): WorldCrewMember[];
	orbit(vessel: EntityId): OrbitalElements | null;
	comms(vessel: EntityId): WorldCommsLink | null;
	bodies(): WorldBody[];
	body(id: string): WorldBody | null;
	sites(): WorldSite[];
	crew(): WorldCrewMember[];
	economy(): WorldEconomy;
	/** A world rule's value, or undefined. */
	rule(id: string): boolean | number | string | undefined;
	/** A mod store's value as the snapshot has it (ADR 0292 point 4), or undefined. */
	store(id: string): unknown;
	/**
	 * The air of `body` at `altitude` above its reference radius (plan 347, ADR 0296 point 6):
	 * pressure, density, temperature and speed of sound as the sim computes them; vacuum when the
	 * body is unknown or has no air.
	 */
	atmosphere(body: string, altitude: number): Ambient;
	/**
	 * Height of the ground above the reference radius under `position` (relative to the body
	 * centre, inertial axes, now), m. The sim answers from its terrain; the page has none: null.
	 */
	groundHeight(body: string, position: Vec3): number | null;
	/** What a sim system published for an overlay (ADR 0296 point 3), or null. */
	overlay(id: string): OverlayLayer | null;
	/** The snapshot behind this query: the protocol, for what the facade does not cover. */
	readonly snapshot: Snapshot;
}

/** What `createWorldQuery` needs to know about bodies: their definitions. */
export interface WorldQueryOptions {
	bodies?: Pick<ReadonlyRegistry<BodyDefinition>, 'list'>;
	/** The ground under a body-relative inertial position, m above the radius (the sim's terrain). */
	ground?: (body: string, position: Vec3) => number;
}

const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const plus = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const many = <T>(v: T | readonly T[] | undefined): readonly T[] | undefined =>
	v === undefined ? undefined : Array.isArray(v) ? (v as readonly T[]) : [v as T];

/** Bodies with their facts: definitions joined with the snapshot's state. */
function bodiesOf(snapshot: Snapshot, defs: readonly BodyDefinition[]): Map<string, WorldBody> {
	const byId = new Map(defs.map((d) => [d.id as string, d]));
	const out = new Map<string, WorldBody>();
	const ids = new Set([...snapshot.bodies.map((b) => b.id as string), ...byId.keys()]);
	for (const id of ids) {
		const def = byId.get(id);
		const state = snapshot.bodies.find((b) => b.id === id);
		const parent = def?.parent !== undefined ? byId.get(def.parent) : undefined;
		// hosts may pass partial definitions (the page's catalogue): without masses there is no SOI
		const soi =
			def?.orbit && parent && def.mass > 0 && parent.mass > 0
				? soiRadius(def.orbit.a, def.mass, parent.mass)
				: Number.POSITIVE_INFINITY;
		out.set(id, {
			id,
			parent: def?.parent ?? null,
			radius: def?.radius ?? 0,
			mu: def?.mass ? GRAVITATIONAL_CONSTANT * def.mass : 0,
			atmosphereHeight: def?.atmosphere?.height ?? 0,
			soi,
			star: def?.star === true,
			position: state?.position ?? ZERO,
			rotation: state?.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
			angularVelocity: def?.rotationPeriod ? bodyAngularVelocity(def, snapshot.t) : ZERO
		});
	}
	return out;
}

/** What the coarse situation is decided from (the sim's flags, or a snapshot's). */
export interface SituationFacts {
	landed: boolean;
	splashed: boolean;
	/** It has lifted off once (else a landed vessel is `prelaunch`). */
	launched: boolean;
	/** Above the reference radius, m. */
	altitude: number;
	/** 0 without air. */
	atmosphereHeight: number;
	radius: number;
	/** The SOI radius, m (Infinity for the root). */
	soi: number;
	orbit: OrbitalElements | null;
}

/**
 * The coarse situation (ADR 0292 point 2): on the ground from the flags; in the air below the top
 * of the atmosphere; else from the orbit: escaping (open, or apoapsis beyond the SOI), sub-orbital
 * (periapsis under the air, or under the surface on an airless body), orbiting.
 */
export function classifySituation(f: SituationFacts): VesselSituation {
	if (f.splashed) return 'splashed';
	if (f.landed) return f.launched ? 'landed' : 'prelaunch';
	if (f.atmosphereHeight > 0 && f.altitude < f.atmosphereHeight) return 'flying';
	const o = f.orbit;
	if (!o) return f.altitude < 0.02 * f.radius ? 'flying' : 'sub-orbital';
	if (o.e >= 1 || o.a <= 0) return 'escaping';
	if (o.a * (1 + o.e) > f.soi) return 'escaping';
	return o.a * (1 - o.e) - f.radius > f.atmosphereHeight ? 'orbiting' : 'sub-orbital';
}

/**
 * A snapshot vessel's situation: the sim's own (`VesselSnapshot.situation`) when present, else
 * derived from the snapshot's flags and the body. Without the body's facts a vessel off the
 * ground is `flying` until it has an orbit.
 */
export function situationOfVessel(v: VesselSnapshot, body: WorldBody | undefined): VesselSituation {
	if (v.situation) return v.situation;
	const landed = v.surface === true || v.recovery !== undefined;
	if (!body || body.radius === 0) {
		if (v.splashed) return 'splashed';
		if (landed) return v.launchedAt === undefined ? 'prelaunch' : 'landed';
		return v.orbit ? 'orbiting' : 'flying';
	}
	return classifySituation({
		landed,
		splashed: v.splashed === true,
		launched: v.launchedAt !== undefined,
		altitude: len(v.position) - body.radius,
		atmosphereHeight: body.atmosphereHeight,
		radius: body.radius,
		soi: body.soi,
		orbit: v.orbit ?? null
	});
}

export function createWorldQuery(snapshot: Snapshot, options: WorldQueryOptions = {}): WorldQuery {
	const defs = options.bodies?.list() ?? [];
	const bodies = bodiesOf(snapshot, defs);
	const raw = new Map(snapshot.vessels.map((v) => [v.id as number, v]));
	let views: WorldVessel[] | null = null;
	const roster = (): WorldCrewMember[] =>
		(snapshot.crew ?? []).map((c) => ({
			id: c.id,
			name: c.name,
			profession: c.profession,
			traits: [...c.traits],
			level: c.level,
			xp: c.xp,
			status: c.status,
			vessel: c.vessel ?? null
		}));

	const view = (v: VesselSnapshot): WorldVessel => {
		const body = bodies.get(v.soi);
		const centre = body?.position ?? ZERO;
		const r = len(v.position);
		const known = body !== undefined && body.radius > 0;
		const o = v.orbit ?? null;
		const bound = o !== null && o.e < 1 && o.a > 0;
		return {
			id: v.id,
			name: v.name ?? `Vessel ${v.id}`,
			type: v.type ?? 'ship',
			owner: v.owner ?? null,
			mode: v.mode,
			situation: situationOfVessel(v, body),
			soi: v.soi,
			position: v.position,
			velocity: v.velocity,
			absolute: plus(centre, v.position),
			altitude: known ? r - body.radius : null,
			radarAltitude:
				known && v.terrainHeight !== undefined ? r - body.radius - v.terrainHeight : null,
			speed: len(v.velocity),
			parts: v.parts.length,
			crew: v.crew?.length ?? 0,
			controlled: v.uncontrolled === undefined,
			orbit: o,
			periapsis: o && known ? o.a * (1 - o.e) - body.radius : null,
			apoapsis: bound && known ? o.a * (1 + o.e) - body.radius : null,
			target: v.target ?? null,
			autopilot: v.autopilot?.id ?? null,
			stage: v.nextStage ?? 0,
			mass: v.aero?.mass ?? null,
			dragArea: v.aero?.dragArea ?? null
		};
	};
	const all = (): WorldVessel[] => (views ??= snapshot.vessels.map(view));
	const byId = (id: EntityId): WorldVessel | null => all().find((v) => v.id === id) ?? null;

	const pointOf = (of: EntityId | Vec3): Vec3 | null =>
		typeof of === 'object' ? of : (byId(of)?.absolute ?? null);
	const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

	const matches = (v: WorldVessel, f: VesselFilter): boolean => {
		const types = many(f.type);
		if (types && !types.includes(v.type)) return false;
		const situations = many(f.situation);
		if (situations && !situations.includes(v.situation)) return false;
		if (f.soi !== undefined && v.soi !== f.soi) return false;
		if (f.owner !== undefined && (v.owner ?? 'player') !== f.owner) return false;
		if (f.noDebris && v.type === 'debris') return false;
		const except = many(f.except);
		if (except && except.includes(v.id)) return false;
		if (f.near) {
			const p = pointOf(f.near.of);
			if (!p || dist(p, v.absolute) > f.near.within) return false;
		}
		return true;
	};

	return {
		time: snapshot.t,
		paused: snapshot.paused === true,
		day: snapshot.day ?? null,
		vessels: (filter) => (filter ? all().filter((v) => matches(v, filter)) : [...all()]),
		vessel: byId,
		findVessel: (name) => all().find((v) => v.name === name) ?? null,
		nearest(of, filter = {}) {
			const p = pointOf(of);
			if (!p) return null;
			let best: WorldVessel | null = null;
			let bestD = Number.POSITIVE_INFINITY;
			for (const v of all()) {
				if (v.id === of || !matches(v, filter)) continue;
				const d = dist(p, v.absolute);
				if (d < bestD) [best, bestD] = [v, d];
			}
			return best;
		},
		distance(a, b) {
			const pa = byId(a)?.absolute;
			const pb = byId(b)?.absolute;
			return pa && pb ? dist(pa, pb) : null;
		},
		parts: (vessel) =>
			(raw.get(vessel)?.parts ?? []).map((p) => ({
				id: p.id,
				vessel,
				definition: p.definition,
				index: p.index ?? null,
				modules: p.modules,
				temperature: p.temperature ?? null,
				maxTemperature: p.maxTemperature ?? null,
				resources: p.resources ?? [],
				position: p.position
			})),
		resources: (vessel) => raw.get(vessel)?.resources ?? [],
		amount: (vessel, resource) =>
			raw.get(vessel)?.resources?.find((r) => r.resource === resource)?.amount ?? 0,
		crewOf(vessel) {
			const aboard = new Set((raw.get(vessel)?.crew ?? []).map((c) => c.member));
			return roster().filter((c) => aboard.has(c.id) || c.vessel === vessel);
		},
		orbit: (vessel) => raw.get(vessel)?.orbit ?? null,
		comms(vessel) {
			const link = snapshot.network?.vessels.find((l) => l.vessel === vessel);
			return link
				? {
						to: link.to,
						control: link.control,
						rate: link.rate,
						latency: link.latency,
						route: [...link.route]
					}
				: null;
		},
		bodies: () => [...bodies.values()],
		body: (id) => bodies.get(id) ?? null,
		sites: () =>
			(snapshot.sites ?? []).map((s) => ({
				id: s.id,
				body: s.body ?? null,
				buildings: s.buildings.map((b) => ({
					id: b.id,
					kind: b.kind,
					level: b.level,
					state: b.state
				})),
				members: [...(s.members ?? [])]
			})),
		crew: roster,
		economy: () => ({
			enabled: snapshot.economy?.enabled ?? false,
			funds: snapshot.economy?.funds ?? 0,
			science: snapshot.economy?.science ?? 0,
			reputation: snapshot.economy?.reputation ?? 0
		}),
		rule: (id) => snapshot.rules?.[id],
		store: (id) => snapshot.stores?.[id],
		atmosphere(body, altitude) {
			const def = defs.find((d) => d.id === body);
			return def ? ambientAt(def, altitude) : { pressure: 0, density: 0, altitude };
		},
		groundHeight: (body, position) => (options.ground ? options.ground(body, position) : null),
		overlay: (id) => snapshot.overlays?.[id] ?? null,
		snapshot
	};
}
