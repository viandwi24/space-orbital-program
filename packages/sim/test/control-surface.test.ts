/** Plan 033 / ADR 0045: control surfaces steer by the same attitude demand as the wheel and the gimbal. */
import { describe, expect, test } from 'bun:test';
import { partId, type Quat, type VesselDesign } from '@orbital/core';
import { cross, dot, normalize } from '@orbital/kepler';
import { UP_Y } from './helpers/attitude.ts';
import { newTestSim } from './helpers/test-mod.ts';
import { stack } from './helpers/vessels.ts';

const OMEGA = (2 * Math.PI) / 21_600;

/** Pod, two tanks and an engine (never lit) with four control surfaces round the lower tank. */
function surfaces(): VesselDesign {
	const base = stack(
		'Control surfaces',
		['stock.command-pod', 'stock.tank-small', 'stock.tank-small', 'stock.engine-lv'],
		[[3]]
	);
	return {
		formatVersion: 2,
		name: base.name,
		stages: base.stages,
		parts: [
			...base.parts,
			...[0, 1, 2, 3].map((k) => ({
				index: 10 + k,
				part: partId('stock.control-surface'),
				parent: {
					index: 2,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle: (k * Math.PI) / 2, y: -0.7 }
				},
				symmetry: 1
			}))
		]
	} as VesselDesign;
}

const angleAbout = (q: Quat, axis: 'x' | 'y' | 'z'): number => 2 * Math.atan2(q[axis], q.w);

/** Coast with the nose along the air velocity at `speed`, 20 km up, and demand `control`; return the angles after `seconds`. */
async function steer(control: { pitch: number; yaw: number; roll: number }, seconds = 1.5) {
	const sim = await newTestSim();
	const r = 620_000;
	const heading = { x: 1, y: 0, z: 0 };
	const axis = normalize(cross(UP_Y, heading));
	const half = Math.acos(dot(UP_Y, heading)) / 2;
	const orientation: Quat = {
		x: axis.x * Math.sin(half),
		y: axis.y * Math.sin(half),
		z: axis.z * Math.sin(half),
		w: Math.cos(half)
	};
	const loaded = sim.dispatch({
		type: 'load-vessel',
		design: surfaces(),
		placement: {
			kind: 'state',
			position: { x: r, y: 0, z: 0 },
			velocity: { x: 1_000, y: 0, z: -OMEGA * r },
			orientation
		}
	});
	if (!loaded.ok) throw new Error(loaded.reason);
	sim.dispatch({ type: 'attitude', vessel: loaded.vessel!, ...control });
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
	const v = sim.snapshot().vessels[0]!;
	// Body-relative rotation: undo the initial orientation.
	const rel = relative(orientation, v.orientation);
	const deflections = v.parts
		.map((p) => p.modules['stock.control-surface'] as { deflection: number } | undefined)
		.filter((m) => m !== undefined)
		.map((m) => m!.deflection);
	sim.dispose();
	return { rel, deflections, v };
}

const relative = (a: Quat, b: Quat): Quat => {
	const c = { x: -a.x, y: -a.y, z: -a.z, w: a.w };
	return {
		x: c.w * b.x + c.x * b.w + c.y * b.z - c.z * b.y,
		y: c.w * b.y - c.x * b.z + c.y * b.w + c.z * b.x,
		z: c.w * b.z + c.x * b.y - c.y * b.x + c.z * b.w,
		w: c.w * b.w - c.x * b.x - c.y * b.y - c.z * b.z
	};
};

describe('control surfaces in flight', () => {
	test('a pitch demand turns the rocket about +X, the opposite demand the other way, none leaves it alone', async () => {
		const up = await steer({ pitch: 1, yaw: 0, roll: 0 });
		const down = await steer({ pitch: -1, yaw: 0, roll: 0 });
		const none = await steer({ pitch: 0, yaw: 0, roll: 0 });
		console.log(
			`pitch +1: ${angleAbout(up.rel, 'x').toFixed(4)} rad, -1: ${angleAbout(down.rel, 'x').toFixed(4)}, 0: ${angleAbout(none.rel, 'x').toExponential(2)}`
		);
		expect(angleAbout(up.rel, 'x')).toBeGreaterThan(0.01);
		expect(angleAbout(down.rel, 'x')).toBeLessThan(-0.01);
		expect(Math.abs(angleAbout(none.rel, 'x'))).toBeLessThan(1e-3);
		// Symmetric demand, symmetric response.
		expect(angleAbout(up.rel, 'x') / -angleAbout(down.rel, 'x')).toBeGreaterThan(0.9);
		expect(angleAbout(up.rel, 'x') / -angleAbout(down.rel, 'x')).toBeLessThan(1.1);
	}, 30_000);

	test('yaw turns it about +Z and roll about +Y', async () => {
		const yaw = await steer({ pitch: 0, yaw: 1, roll: 0 });
		const roll = await steer({ pitch: 0, yaw: 0, roll: 1 });
		expect(angleAbout(yaw.rel, 'z')).toBeGreaterThan(0.01);
		expect(angleAbout(roll.rel, 'y')).toBeGreaterThan(0.01);
		// A roll demand turns all four surfaces the same way round the axis (their lever is the
		// radius), by the share of the range that points that way (the mixer projects onto it).
		expect(roll.deflections).toHaveLength(4);
		for (const d of roll.deflections) expect(d).toBeCloseTo(roll.deflections[0]!, 6);
		expect(Math.abs(roll.deflections[0]!)).toBeGreaterThan(0.05);
	}, 30_000);

	test('two identical flights give identical snapshots (determinism)', async () => {
		const a = await steer({ pitch: 0.6, yaw: -0.3, roll: 0.2 }, 1);
		const b = await steer({ pitch: 0.6, yaw: -0.3, roll: 0.2 }, 1);
		expect(JSON.stringify(a.v)).toEqual(JSON.stringify(b.v));
	}, 30_000);
});
