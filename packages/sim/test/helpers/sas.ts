/** Fixtures for the stability assist tests (plan 042): a disturbance torque part and orbit helpers. */
import { partId, type EntityId, type Quat, type Vec3, type VesselDesign } from '@orbital/core';
import { cross, dot, length, normalize, scale } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { defineModule, definePart, definePlugin, kg, z } from '@orbital/sdk';
import { createSim, type Sim } from '../../src/index.ts';
import { rotate } from './attitude.ts';
import { orbitState } from './measure.ts';
import { rapier } from './vessels.ts';

/** Applies a constant torque (part axes, N·m) every step: the disturbance. */
export const ModuleDisturbance = defineModule({
	id: 'test.disturbance',
	config: z.object({ torque: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]) }),
	state: (): { torque: [number, number, number] | null } => ({ torque: null }),
	update({ config, state, vessel }) {
		const t = state.torque ?? config.torque;
		vessel.applyTorque({ x: t[0], y: t[1], z: t[2] });
	},
	actions: {
		/** `(x, y, z)` N·m. */
		set: ({ state }, ...args) => {
			const [x, y, z] = z_tuple.parse(args);
			state.torque = [x, y, z];
		}
	}
});
const z_tuple = z.tuple([z.number(), z.number(), z.number()]);

export const Disturber = definePart({
	id: 'test.disturber',
	title: 'Disturbance torque',
	mass: kg(1),
	shape: { kind: 'cylinder', radius: 0.1, height: 0.1 },
	attach: {
		top: { pos: [0, 0.05, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -0.05, 0], dir: [0, -1, 0] }
	},
	crossfeed: false,
	modules: [[ModuleDisturbance, { torque: [0, 0, 0] }]]
});

const SasTestMod = definePlugin({
	meta: { id: 'sastest', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.modules.register(ModuleDisturbance);
		ctx.parts.register(Disturber);
	}
});

export const DISTURBER_INDEX = 99;

/** The design with a 1 kg disturbance part on top of the root (the pod at index 0). */
export function withDisturber(design: VesselDesign): VesselDesign {
	return {
		...design,
		parts: [
			...design.parts,
			{
				index: DISTURBER_INDEX,
				part: partId('test.disturber'),
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			}
		]
	};
}

export const newSasSim = (): Promise<Sim> =>
	createSim({ plugins: [Stock, SasTestMod], backendFactory: rapier(), seed: 1 });

export const quatAbout = (axis: Vec3, angle: number): Quat => {
	const n = normalize(axis);
	const s = Math.sin(angle / 2);
	return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(angle / 2) };
};

/** Load `design` on a circular 200 km orbit, wake it into flight and return its id. */
export function launchInOrbit(
	sim: Sim,
	design: VesselDesign,
	orientation: Quat = { x: 0, y: 0, z: 0, w: 1 },
	alt = 200_000
): EntityId {
	const res = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', ...orbitState(sim, alt), orientation }
	});
	if (!res.ok) throw new Error(res.reason);
	const id = res.vessel!;
	// A tiny attitude demand wakes the vessel into flight; the next command clears it.
	const woke = sim.dispatch({ type: 'attitude', vessel: id, pitch: 1e-9, yaw: 0, roll: 0 });
	if (!woke.ok) throw new Error(woke.reason);
	sim.step(0.02);
	sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
	return id;
}

export const vesselOf = (sim: Sim, id: EntityId) =>
	sim.snapshot().vessels.find((v) => v.id === id)!;

export const noseOf = (q: Quat): Vec3 => rotate(q, { x: 0, y: 1, z: 0 });

const angle = (a: Vec3, b: Vec3): number => Math.atan2(length(cross(a, b)), dot(a, b));

/** Direction (BCI) of an orbit-reference SAS mode, from the snapshot. */
export function modeDirection(mode: string, position: Vec3, velocity: Vec3): Vec3 {
	const h = normalize(cross(position, velocity));
	const r = normalize(position);
	const v = normalize(velocity);
	const table: Record<string, Vec3> = {
		prograde: v,
		retrograde: scale(v, -1),
		normal: h,
		antinormal: scale(h, -1),
		'radial-out': r,
		'radial-in': scale(r, -1)
	};
	return table[mode]!;
}

/** Angle between the nose and `direction`, rad. */
export const pointingError = (q: Quat, direction: Vec3): number => angle(noseOf(q), direction);

/** Angle of the rotation between two attitudes, rad (well conditioned near zero). */
export function attitudeAngle(a: Quat, b: Quat): number {
	const x = a.w * -b.x + a.x * b.w + a.y * -b.z - a.z * -b.y;
	const y = a.w * -b.y - a.x * -b.z + a.y * b.w + a.z * -b.x;
	const z = a.w * -b.z + a.x * -b.y - a.y * -b.x + a.z * b.w;
	const w = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
	return 2 * Math.atan2(Math.hypot(x, y, z), Math.abs(w));
}
