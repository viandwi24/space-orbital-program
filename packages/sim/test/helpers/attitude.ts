/**
 * Attitude controller for scripted flights: a PD loop on the snapshot orientation (rate by finite
 * difference, taken from the previous call) sent as `attitude` commands to the reaction wheel.
 * Shared by the ascent and landing scripts.
 */
import type { EntityId, Quat, Vec3, VesselSnapshot } from '@orbital/core';
import { add, cross, dot, normalize, scale, sub } from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';

export const UP_Y: Vec3 = { x: 0, y: 1, z: 0 };
export const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const mul = (a: Quat, b: Quat): Quat => ({
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});
export const rotate = (q: Quat, v: Vec3): Vec3 => {
	const u = { x: q.x, y: q.y, z: q.z };
	const t = scale(cross(u, v), 2);
	return add(add(v, scale(t, q.w)), cross(u, t));
};
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function createAttitude(sim: Sim, vessel: EntityId, bandwidth = 0.5, torqueMax = 5_000) {
	let prev: { q: Quat; t: number } | null = null;

	/** Mass and transverse moment of inertia of the vessel from its parts, kg and kg·m². */
	function massProperties(v: VesselSnapshot, nose: Vec3): { mass: number; inertia: number } {
		let mass = 0;
		let c: Vec3 = { x: 0, y: 0, z: 0 };
		const masses: number[] = [];
		for (const p of v.parts) {
			const def = sim.registries.parts.get(p.definition)!;
			let m = def.mass;
			const container = p.modules['stock.resource-container'] as
				{ amounts: Record<string, number> } | undefined;
			if (container) {
				for (const [r, amount] of Object.entries(container.amounts)) {
					m += amount * (sim.registries.resources.get(r)?.density ?? 0);
				}
			}
			masses.push(m);
			mass += m;
			c = add(c, scale(p.position, m));
		}
		c = scale(c, 1 / mass);
		let inertia = 0;
		v.parts.forEach((p, i) => {
			const d = sub(p.position, c);
			const along = dot(d, nose);
			// Transverse axis of a slender stack: distance along the nose dominates (plus a small own term).
			inertia += masses[i]! * (along * along + 0.1);
		});
		return { mass, inertia: Math.max(inertia, 1) };
	}

	/** Point the vessel's +Y axis at `target` (any magnitude); call once per control tick. */
	function steer(v: VesselSnapshot, target: Vec3, t: number): void {
		const dt = prev ? t - prev.t : 0;
		const nose = rotate(v.orientation, UP_Y);
		let rate: Vec3 = { x: 0, y: 0, z: 0 };
		if (prev && dt > 0) {
			const dq = mul(v.orientation, conj(prev.q));
			const sign = dq.w < 0 ? -1 : 1;
			rate = rotate(conj(v.orientation), scale({ x: dq.x, y: dq.y, z: dq.z }, (2 * sign) / dt));
		}
		prev = { q: v.orientation, t };
		const err = rotate(conj(v.orientation), cross(nose, normalize(target)));
		const { inertia } = massProperties(v, nose);
		const alpha = torqueMax / inertia;
		const kp = (bandwidth * bandwidth) / alpha;
		const kd = (2 * bandwidth) / alpha;
		const res = sim.dispatch({
			type: 'attitude',
			vessel,
			pitch: clamp(kp * err.x - kd * rate.x, -1, 1),
			yaw: clamp(kp * err.z - kd * rate.z, -1, 1),
			roll: clamp(-kd * rate.y, -1, 1)
		});
		if (!res.ok) throw new Error(`attitude refused: ${res.reason}`);
	}

	return { steer, massProperties };
}
