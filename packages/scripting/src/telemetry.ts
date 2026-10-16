/**
 * Telemetry: the read-only copy of the flight state a script sees as `ship`. Built from a sim
 * `Snapshot` on every tick and handed to the guest as a JSON string, so the guest never holds a
 * reference into host data. Plain JSON-compatible values only.
 */
import {
	GRAVITATIONAL_CONSTANT,
	type BodyDefinition,
	type PartDefinition,
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
}

export interface TelemetryPart {
	/** Part instance id, the `part` argument of `action()`. */
	id: number;
	/** Definition id, e.g. `stock.engine-lv`. */
	definition: string;
	/** Position relative to the vessel root, BCI axes. */
	position: Vec3;
	/** Module state keyed by module id, as produced by the module's `snapshot`. */
	modules: Record<string, unknown>;
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
			modules: JSON.parse(JSON.stringify(p.modules)) as Record<string, unknown>
		}))
	};
}
