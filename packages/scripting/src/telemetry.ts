/**
 * Telemetry: the read-only copy of the flight state a script sees as `ship`. Built from a sim
 * `Snapshot` on every tick and handed to the guest as a JSON string, so the guest never holds a
 * reference into host data. Plain JSON-compatible values only.
 */
import {
	GRAVITATIONAL_CONSTANT,
	type BodyDefinition,
	type Epoch,
	type PartDefinition,
	type SasMode,
	type ResourceDefinition,
	type Snapshot,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';

/** Content definitions the telemetry needs (the lists a host reads from `sim.registries`). */
export interface ScriptEnvironment {
	bodies: readonly BodyDefinition[];
	parts: readonly PartDefinition[];
	resources: readonly ResourceDefinition[];
	/** The world's epoch (plan 081): what a host's `date` provider formats from; day 0 when absent. */
	epoch?: Epoch;
	/**
	 * Define the `debug` global (plan 203, ADR 0200 point 9): set orbit, location, resources,
	 * temperature and cheats on the script's vessel. The host sets it only while the world allows
	 * debug tools; the sim refuses the commands otherwise anyway. Default false.
	 */
	debug?: boolean;
}

export interface TelemetryPart {
	/** Part instance id, the `part` argument of `action()`. */
	id: number;
	/** Definition id, e.g. `stock.engine-lv`. */
	definition: string;
	/** Position relative to the vessel root, BCI axes. */
	position: Vec3;
	/** Dry mass from the part definition, kg (resources in tanks come on top). */
	mass: number;
	/** Module state keyed by module id, as produced by the module's `snapshot`. */
	modules: Record<string, unknown>;
}

/**
 * An engine on the vessel: a module whose definition config has the shape
 * `{ thrust, ispVacuum, ispSeaLevel }` (numbers > 0) — the stock engine and any mod engine with
 * the same shape. `thrust` is the vacuum thrust at full throttle, N; Isp in s. The three flags
 * come from the module's snapshot (`false`/`0` when it does not report them).
 */
export interface TelemetryEngine {
	part: number;
	module: string;
	thrust: number;
	ispVacuum: number;
	ispSeaLevel: number;
	ignited: boolean;
	throttle: number;
	flameout: boolean;
}

/**
 * A reaction wheel: a module whose config has `{ torque }` (number > 0) and whose snapshot has a
 * boolean `enabled`. `torque` is the maximum torque per axis, N·m (the `attitude` command scales it).
 */
export interface TelemetryWheel {
	part: number;
	module: string;
	torque: number;
	enabled: boolean;
}

/**
 * A maneuver node (plan 045): `prograde`, `normal` and `radial` are the burn that is left, m/s, in
 * the orbital frame at the node; `dv` its magnitude; `vector` the burn in BCI axes (null when the
 * path never reaches the node). `time` is simulation time, s.
 */
export interface TelemetryNode {
	id: number;
	time: number;
	prograde: number;
	normal: number;
	radial: number;
	dv: number;
	body: string | null;
	vector: Vec3 | null;
}

/**
 * The vessel's target (plan 035, ADR 0064). `position` and `velocity` are the target's minus the
 * ship's, in the shared inertial axes (the same in every body's frame), m and m/s. `approach` is
 * the closest approach of the ship's orbit to the target's within the next orbit (or ten days),
 * `null` when they do not orbit the same body or the ship is not on an orbit that clears the ground.
 */
export interface TelemetryTarget {
	kind: 'body' | 'vessel';
	/** Body definition id, or vessel entity id. */
	id: string | number;
	name: string;
	position: Vec3;
	velocity: Vec3;
	distance: number;
	relativeSpeed: number;
	approach: { time: number; distance: number; relativeSpeed: number } | null;
}

/** One entry of `ship.targets`: something the ship could aim at. */
export interface TelemetryTargetChoice {
	kind: 'body' | 'vessel';
	id: string | number;
	name: string;
}

/**
 * Science aboard (plan 103, ADR 0178): the ship's situation (null when none matches or the ship
 * has no experiments) and each experiment module with its state, reason and progress (0..1).
 */
export interface TelemetryScience {
	situation: string | null;
	experiments: Array<{
		part: number;
		experiment: string;
		state: 'READY' | 'RUNNING' | 'PAUSED' | 'INVALID';
		reason: string | null;
		progress: number;
	}>;
}

/** What `ship.*` returns. SI units, BCI axes (see `units-and-frames.md`). */
export interface Telemetry {
	/** Simulation time, s. */
	t: number;
	mode: 'flight' | 'on-rails';
	/** Id of the body whose sphere of influence the ship is in. */
	body: string;
	/** Radius and gravitational parameter (G·M) of that body, m and m³/s². */
	bodyRadius: number;
	mu: number;
	/** Root part origin relative to the body centre, and velocity relative to the body (BCI). */
	position: Vec3;
	velocity: Vec3;
	/** Distance from the centre minus the body radius, m. */
	altitude: number;
	speed: number;
	/** Unit vector away from the body centre. */
	up: Vec3;
	/** Orientation of the vessel root (x, y, z, w) and its +Y (nose) axis in BCI. */
	orientation: { x: number; y: number; z: number; w: number };
	nose: Vec3;
	/** Mass in kg and an estimate of the transverse moment of inertia in kg·m² (slender stack). */
	mass: number;
	inertia: number;
	/** Orbit of the centre of mass: elements, and apsis altitudes in m; null when not available. */
	orbit: NonNullable<VesselSnapshot['orbit']> | null;
	apoapsis: number | null;
	periapsis: number | null;
	eccentricity: number | null;
	parts: TelemetryPart[];
	/** Engines and reaction wheels read from the part definitions (plan 018); gone with their part. */
	engines: TelemetryEngine[];
	wheels: TelemetryWheel[];
	/** Stability assist mode the sim reports (plan 042); `off` when the sim does not report one. */
	sas: SasMode;
	/** Maneuver nodes in time order (plan 045). */
	nodes: TelemetryNode[];
	/** The ship's target, or null (plan 035). */
	target: TelemetryTarget | null;
	/** Every body and every other vessel (debris included) the ship could target, bodies first. */
	targets: TelemetryTargetChoice[];
	/** Science aboard (plan 103). */
	science: TelemetryScience;
}

const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

/** Rotate `v` by the unit quaternion `q`. */
function rotate(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
	const tx = 2 * (q.y * v.z - q.z * v.y);
	const ty = 2 * (q.z * v.x - q.x * v.z);
	const tz = 2 * (q.x * v.y - q.y * v.x);
	return {
		x: v.x + q.w * tx + (q.y * tz - q.z * ty),
		y: v.y + q.w * ty + (q.z * tx - q.x * tz),
		z: v.z + q.w * tz + (q.x * ty - q.y * tx)
	};
}

/**
 * Mass and transverse inertia of a vessel from its parts: dry mass plus the contents of any
 * module state shaped `{ amounts: { [resource]: number } }` (the resource container's snapshot,
 * ADR 0015) times the resource density. The inertia treats the stack as point masses along the
 * nose axis (plus a small own term), which is what a PD attitude loop needs.
 */
function massProperties(
	v: VesselSnapshot,
	nose: Vec3,
	env: ScriptEnvironment
): { mass: number; inertia: number } {
	const partDefs = new Map(env.parts.map((p) => [String(p.id), p]));
	const density = new Map(env.resources.map((r) => [String(r.id), r.density]));
	const masses = v.parts.map((p) => {
		let m = partDefs.get(String(p.definition))?.mass ?? 0;
		for (const state of Object.values(p.modules)) {
			const amounts = (state as { amounts?: unknown } | null)?.amounts;
			if (typeof amounts !== 'object' || amounts === null) continue;
			for (const [resource, amount] of Object.entries(amounts)) {
				if (typeof amount === 'number') m += amount * (density.get(resource) ?? 0);
			}
		}
		return m;
	});
	const mass = masses.reduce((a, b) => a + b, 0);
	if (mass <= 0) return { mass: 0, inertia: 1 };
	const c = { x: 0, y: 0, z: 0 };
	v.parts.forEach((p, i) => {
		c.x += (p.position.x * masses[i]!) / mass;
		c.y += (p.position.y * masses[i]!) / mass;
		c.z += (p.position.z * masses[i]!) / mass;
	});
	let inertia = 0;
	v.parts.forEach((p, i) => {
		const along =
			(p.position.x - c.x) * nose.x + (p.position.y - c.y) * nose.y + (p.position.z - c.z) * nose.z;
		inertia += masses[i]! * (along * along + 0.1);
	});
	return { mass, inertia: Math.max(inertia, 1) };
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Engines and wheels of `v`, recognised by the shape of their definition config (see the types). */
function equipment(
	v: VesselSnapshot,
	partDefs: Map<string, PartDefinition>
): { engines: TelemetryEngine[]; wheels: TelemetryWheel[] } {
	const engines: TelemetryEngine[] = [];
	const wheels: TelemetryWheel[] = [];
	for (const p of v.parts) {
		for (const [module, config] of partDefs.get(String(p.definition))?.modules ?? []) {
			if (!isRecord(config)) continue;
			const state = isRecord(p.modules[module]) ? p.modules[module] : {};
			if (positive(config.thrust) && positive(config.ispVacuum) && positive(config.ispSeaLevel)) {
				engines.push({
					part: Number(p.id),
					module,
					thrust: config.thrust,
					ispVacuum: config.ispVacuum,
					ispSeaLevel: config.ispSeaLevel,
					ignited: state.ignited === true,
					throttle: typeof state.throttle === 'number' ? state.throttle : 0,
					flameout: state.flameout === true
				});
			} else if (positive(config.torque) && typeof state.enabled === 'boolean') {
				wheels.push({ part: Number(p.id), module, torque: config.torque, enabled: state.enabled });
			}
		}
	}
	return { engines, wheels };
}

/** Telemetry of `vessel` in `snapshot`; throws when the vessel or its body is unknown. */
export function buildTelemetry(
	snapshot: Snapshot,
	vessel: number,
	env: ScriptEnvironment
): Telemetry {
	const v = snapshot.vessels.find((s) => Number(s.id) === vessel);
	if (!v) throw new Error(`script: vessel ${vessel} is not in the snapshot`);
	const body = env.bodies.find((b) => String(b.id) === String(v.soi));
	if (!body) throw new Error(`script: unknown body "${String(v.soi)}"`);
	const r = length(v.position);
	const up =
		r > 0
			? { x: v.position.x / r, y: v.position.y / r, z: v.position.z / r }
			: { x: 0, y: 1, z: 0 };
	const nose = rotate(v.orientation, { x: 0, y: 1, z: 0 });
	const { mass, inertia } = massProperties(v, nose, env);
	const orbit = v.orbit ? { ...v.orbit } : null;
	const partDefs = new Map(env.parts.map((p) => [String(p.id), p]));
	const { engines, wheels } = equipment(v, partDefs);
	return {
		t: snapshot.t,
		mode: v.mode,
		body: String(v.soi),
		bodyRadius: body.radius,
		mu: GRAVITATIONAL_CONSTANT * body.mass,
		position: { ...v.position },
		velocity: { ...v.velocity },
		altitude: r - body.radius,
		speed: length(v.velocity),
		up,
		orientation: { ...v.orientation },
		nose,
		mass,
		inertia,
		orbit,
		apoapsis: orbit ? orbit.a * (1 + orbit.e) - body.radius : null,
		periapsis: orbit ? orbit.a * (1 - orbit.e) - body.radius : null,
		eccentricity: orbit ? orbit.e : null,
		parts: v.parts.map((p) => ({
			id: Number(p.id),
			definition: String(p.definition),
			position: { ...p.position },
			mass: partDefs.get(String(p.definition))?.mass ?? 0,
			modules: JSON.parse(JSON.stringify(p.modules)) as Record<string, unknown>
		})),
		engines,
		wheels,
		sas: v.sas?.mode ?? 'off',
		nodes: (v.nodes ?? []).map((n) => ({
			id: n.id,
			time: n.time,
			prograde: n.prograde,
			normal: n.normal,
			radial: n.radial,
			dv: n.dv,
			body: n.body === undefined ? null : String(n.body),
			vector: n.vector ? { ...n.vector } : null
		})),
		target: v.target
			? {
					kind: v.target.kind,
					id: v.target.id as string | number,
					name: v.target.name,
					position: { ...v.target.position },
					velocity: { ...v.target.velocity },
					distance: v.target.distance,
					relativeSpeed: v.target.relativeSpeed,
					approach: v.target.approach ? { ...v.target.approach } : null
				}
			: null,
		targets: [
			...env.bodies.map((b) => ({ kind: 'body' as const, id: String(b.id), name: String(b.id) })),
			...snapshot.vessels
				.filter((o) => Number(o.id) !== vessel)
				.map((o) => ({
					kind: 'vessel' as const,
					id: Number(o.id),
					name: o.name ?? `vessel ${Number(o.id)}`
				}))
		],
		science: {
			situation: v.science?.situation ?? null,
			experiments: (v.science?.experiments ?? []).map((e) => ({
				part: Number(e.part),
				experiment: e.experiment,
				state: e.state,
				reason: e.reason ?? null,
				progress: e.progress
			}))
		}
	};
}
