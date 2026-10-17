/**
 * Scripted landing from orbit, through `dispatch` and `snapshot` only (what a host or the plan 010
 * scripting API has): point retrograde and burn with a throttle that follows the required
 * deceleration (constant-deceleration profile to the ground, gravity included), switch to a
 * vertical hover-descent law near the ground, deploy the legs, cut the engine on touchdown.
 * Crude on purpose: the point is that ground contact, legs and damage make a landing possible.
 */
import { GRAVITATIONAL_CONSTANT, type EntityId, type Vec3 } from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';
import { clamp, createAttitude, rotate, UP_Y } from './attitude.ts';

export interface LandingOptions {
	/** Distance from the root part's origin down to the foot soles with the legs deployed, m. */
	rootToFoot: number;
	/** Id of the body to land on (default: the root body). */
	body?: string;
	/** Tilt per m/s of horizontal speed in the final descent, rad (default 0.03; capped at 0.3 times the same ratio). */
	leanGain?: number;
	/** Share of the available deceleration the final descent plans on (default 1; less leaves margin for a strong engine). */
	margin?: number;
	/** Usable fraction of the vacuum thrust used in the guidance law. */
	thrust: number;
	/** Height at which the legs are deployed, m. */
	legsAt: number;
	/** Speed below which the final vertical law takes over, m/s. */
	finalSpeed: number;
}

export const defaultLanding: LandingOptions = {
	rootToFoot: 10.8,
	thrust: 200_000,
	legsAt: 400,
	finalSpeed: 100
};

export type LandingPhase = 'brake' | 'final' | 'touchdown' | 'done';

export function createLanding(sim: Sim, vessel: EntityId, opts: LandingOptions = defaultLanding) {
	const home = opts.body
		? sim.registries.bodies.get(opts.body)!
		: sim.registries.bodies.get(sim.home)!;
	const mu = GRAVITATIONAL_CONSTANT * home.mass;
	const omega = (2 * Math.PI) / home.rotationPeriod;
	const attitude = createAttitude(sim, vessel);
	let phase: LandingPhase = 'brake';
	let legsOut = false;
	let touchedAt = 0;
	const log: Array<{ t: number; note: string }> = [];
	const mark = (t: number, note: string): void => {
		log.push({ t, note });
	};

	/** One control tick; call after every `sim.step`. */
	function update(): LandingPhase {
		if (phase === 'done') return phase;
		const snap = sim.snapshot();
		const v = snap.vessels.find((s) => s.id === vessel);
		if (!v) throw new Error('landing: the vessel is gone');
		const t = snap.t;
		const r = length(v.position);
		const up = scale(v.position, 1 / r);
		const height = r - home.radius - opts.rootToFoot;
		const groundVel: Vec3 = { x: omega * v.position.z, y: 0, z: -omega * v.position.x };
		const rel = sub(v.velocity, groundVel);
		const speed = length(rel);
		const vv = dot(rel, up);
		const vh = sub(rel, scale(up, vv));
		const g = mu / (r * r);
		const { mass } = attitude.massProperties(v, rotate(v.orientation, UP_Y));
		const aMax = opts.thrust / mass;
		const nose = rotate(v.orientation, UP_Y);

		if (!legsOut && height < opts.legsAt) {
			const leg = v.parts.find((p) => p.definition === 'stock.landing-legs');
			if (leg) {
				const res = sim.dispatch({
					type: 'action',
					vessel,
					part: leg.id,
					module: 'stock.landing-leg',
					action: 'deploy'
				});
				if (!res.ok) throw new Error(res.reason);
			}
			legsOut = true;
			mark(t, `legs out at ${height.toFixed(0)} m, ${speed.toFixed(0)} m/s`);
		}

		let throttle = 0;
		let heading: Vec3 = up;
		if (phase === 'brake') {
			heading = speed > 1 ? scale(rel, -1 / speed) : up;
			// Deceleration needed to stop at the ground along the current velocity, plus the part of
			// gravity along it.
			const aReq = (speed * speed) / (2 * Math.max(height, 20));
			const gAlong = (g * -vv) / Math.max(speed, 1);
			const aligned = dot(nose, heading) > Math.cos((15 * Math.PI) / 180);
			throttle = aligned ? clamp((aReq + gAlong) / aMax, 0, 1) : 0;
			if (speed < opts.finalSpeed) {
				phase = 'final';
				mark(
					t,
					`final: ${height.toFixed(0)} m up, ${speed.toFixed(1)} m/s, mass ${mass.toFixed(0)}`
				);
			}
		}
		if (phase === 'final') {
			// Follow a stopping profile: the speed from which half the net deceleration still brings
			// the vessel to rest at the ground. Above it the engine is off (free fall); hold the
			// vertical, damp the horizontal.
			const net = Math.max((aMax - g) * (opts.margin ?? 1), 1);
			const target = -clamp(Math.sqrt(net * Math.max(height - 1, 0)), 1, 400);
			const aCmd = g + 3 * (target - vv);
			const gain = opts.leanGain ?? 0.03;
			const lean = Math.min(10 * gain, gain * length(vh));
			heading = normalize(add(up, length(vh) > 1e-6 ? scale(vh, -lean / length(vh)) : up));
			const tilt = dot(heading, up);
			throttle = clamp(aCmd / (aMax * Math.max(tilt, 0.5)), 0, 1);
			if (height < 0.5 && Math.abs(vv) < 1) {
				phase = 'touchdown';
				touchedAt = t;
				mark(t, `touchdown: ${speed.toFixed(2)} m/s`);
			}
		}
		if (phase === 'touchdown') {
			throttle = 0;
			heading = up;
			if (t - touchedAt > 10) {
				phase = 'done';
				sim.dispatch({ type: 'attitude', vessel, pitch: 0, yaw: 0, roll: 0 });
				mark(t, 'done');
			}
		}
		if (phase !== 'done') attitude.steer(v, heading, t);
		sim.dispatch({ type: 'throttle', vessel, value: throttle });
		return phase;
	}

	return {
		update,
		get phase() {
			return phase;
		},
		log
	};
}

export { cross };
