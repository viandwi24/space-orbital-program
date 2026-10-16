/** HUD numbers derived from a snapshot (display only; simulation state stays SI). */
import type { BodyDefinition, EntityId, Snapshot } from '@orbital/core';

export interface Telemetry {
	t: number;
	mode: 'flight' | 'on-rails';
	/** Height above the SOI body's reference sphere, m. */
	altitude: number;
	/** Speed relative to the SOI body centre (inertial), m/s. */
	speed: number;
	/** Apoapsis / periapsis altitude, m; undefined when there is no closed orbit (or no elements). */
	apoapsis?: number;
	periapsis?: number;
	/** True when the elements describe an escape trajectory. */
	escape: boolean;
}

export function computeTelemetry(
	snapshot: Snapshot,
	vessel: EntityId,
	bodies: readonly Pick<BodyDefinition, 'id' | 'radius'>[]
): Telemetry | null {
	const v = snapshot.vessels.find((s) => s.id === vessel);
	if (!v) return null;
	const radius = bodies.find((b) => b.id === v.soi)?.radius ?? 0;
	const { x, y, z } = v.position;
	const out: Telemetry = {
		t: snapshot.t,
		mode: v.mode,
		altitude: Math.hypot(x, y, z) - radius,
		speed: Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z),
		escape: false
	};
	const o = v.orbit;
	if (o) {
		out.periapsis = o.a * (1 - o.e) - radius;
		if (o.e < 1 && o.a > 0) out.apoapsis = o.a * (1 + o.e) - radius;
		else out.escape = true;
	}
	return out;
}
