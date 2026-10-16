/** HUD numbers derived from a snapshot (display only; simulation state stays SI). */
import type { BodyDefinition, EntityId, Snapshot } from '@orbital/core';

/**
 * What the vessel is doing, for the HUD. `landed` is surface rails (ADR 0024: fixed to the ground,
 * no orbit); `orbit` is on rails with a periapsis above the surface (or an escape); `suborbital` is
 * on rails and ballistic; `flight` is physics-stepped (thrusting, in the atmosphere, on the ground
 * before it settles). A display label, not a gameplay rule.
 */
export type FlightPhase = 'landed' | 'orbit' | 'suborbital' | 'flight';

export interface Telemetry {
	t: number;
	mode: 'flight' | 'on-rails';
	phase: FlightPhase;
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
		phase: v.surface ? 'landed' : v.mode === 'flight' ? 'flight' : 'suborbital',
		altitude: Math.hypot(x, y, z) - radius,
		speed: Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z),
		escape: false
	};
	const o = v.orbit;
	if (o) {
		out.periapsis = o.a * (1 - o.e) - radius;
		if (o.e < 1 && o.a > 0) out.apoapsis = o.a * (1 + o.e) - radius;
		else out.escape = true;
		if (!v.surface && v.mode === 'on-rails' && (out.escape || out.periapsis > 0))
			out.phase = 'orbit';
	}
	return out;
}

/**
 * Time warp needs every vessel on rails (sim rule); lowering it stays possible whatever the mode.
 * While a script runs the sim host puts the vessel on rails for the player and waits for it
 * (ADR 0039), so the buttons stay usable and a refusal comes back as a toast.
 */
export const canWarp = (
	telemetry: Pick<Telemetry, 'mode'> | null,
	warp: number,
	scriptRunning = false
): boolean => telemetry?.mode === 'on-rails' || warp > 1 || (scriptRunning && telemetry !== null);
