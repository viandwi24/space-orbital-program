/** Plan 306 (ADR 0269): robotic joints re-pose the parts on their moving side inside the one body. */
import { describe, expect, test } from 'bun:test';
import type { Vec3 } from '@orbital/core';
import { dot, length, normalize, sub } from '@orbital/kepler';
import { partMassCentres, partMasses } from './helpers/measure.ts';
import { newSim, stack } from './helpers/vessels.ts';

const R = 600_000;
const EC = 'stock.electric-charge';

async function hingedVessel(middle: string) {
	const sim = await newSim();
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Arm', ['stock.command-pod', middle, 'stock.tank-small'], []),
		placement: {
			kind: 'state',
			body: 'stock.home',
			position: { x: 0, y: R + 2_000_000, z: 0 },
			velocity: { x: 0, y: 0, z: 0 }
		}
	} as never);
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	const parts = () => sim.snapshot().vessels.find((v) => v.id === id)!.parts;
	const joint = parts()[1]!.id;
	return { sim, id, joint, parts };
}

const angleAt = (pivot: Vec3, a: Vec3, b: Vec3): number =>
	(Math.acos(Math.max(-1, Math.min(1, dot(normalize(sub(a, pivot)), normalize(sub(b, pivot)))))) *
		180) /
	Math.PI;

describe('robotic joints (plan 306)', () => {
	test('a hinge swung to 90° folds the tank against the pod, the root stays put', async () => {
		const { sim, id, joint, parts } = await hingedVessel('stock.hinge-s');
		const before = parts();
		expect(angleAt(before[1]!.position, before[0]!.position, before[2]!.position)).toBeCloseTo(
			180,
			3
		);
		const ok = sim.dispatch({
			type: 'action',
			vessel: id,
			part: joint,
			module: 'stock.robotic',
			action: 'setTarget',
			args: [90]
		} as never);
		expect(ok.ok).toBe(true);
		for (let i = 0; i < 5 / 0.02; i++) sim.step(0.02);
		const after = parts();
		const robot = after[1]!.modules['stock.robotic'] as { value: number; pose: number };
		expect(robot.value).toBeCloseTo(90, 6);
		expect(robot.pose).toBeCloseTo(Math.PI / 2, 6);
		// the pod-hinge and hinge-tank arms now meet at a right angle
		const hingeCentre = after[1]!.position;
		expect(angleAt(hingeCentre, after[0]!.position, after[2]!.position)).toBeCloseTo(90, 1);
		// rigid on each side: the distances to the hinge are kept
		expect(length(sub(after[2]!.position, hingeCentre))).toBeCloseTo(
			length(sub(before[2]!.position, before[1]!.position)),
			3
		);
		sim.dispose();
	}, 60_000);

	test('a piston slides the far part out by its extension and draws charge', async () => {
		const { sim, id, joint, parts } = await hingedVessel('stock.piston-s');
		const gap0 = length(sub(parts()[2]!.position, parts()[0]!.position));
		const charge = () =>
			sim
				.snapshot()
				.vessels.find((v) => v.id === id)!
				.resources!.find((r) => r.resource === EC)!.amount;
		const charge0 = charge();
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: joint,
			module: 'stock.robotic',
			action: 'setTarget',
			args: [0.5]
		} as never);
		for (let i = 0; i < 4 / 0.02; i++) sim.step(0.02);
		const gap1 = length(sub(parts()[2]!.position, parts()[0]!.position));
		expect(gap1 - gap0).toBeCloseTo(0.5, 3);
		expect(charge()).toBeLessThan(charge0);
		sim.dispose();
	}, 60_000);
});

describe('a swinging arm does not push the vessel (plan 390, ADR 0334)', () => {
	const centreAt = async (swing: boolean) => {
		const { sim, id, joint, parts } = await hingedVessel('stock.hinge-s');
		const vessel = () => sim.snapshot().vessels.find((v) => v.id === id)!;
		const centre = () => {
			const v = vessel();
			const masses = partMasses(sim, v);
			const total = masses.reduce((a, b) => a + b, 0);
			const at = partMassCentres(sim, v);
			let c = { x: 0, y: 0, z: 0 };
			at.forEach((p, i) => {
				c = {
					x: c.x + ((v.position.x + p.x) * masses[i]!) / total,
					y: c.y + ((v.position.y + p.y) * masses[i]!) / total,
					z: c.z + ((v.position.z + p.z) * masses[i]!) / total
				};
			});
			return c;
		};
		for (let i = 0; i < 50; i++) sim.step(0.02);
		if (swing)
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: joint,
				module: 'stock.robotic',
				action: 'setTarget',
				args: [90]
			} as never);
		const track: Array<{ x: number; y: number; z: number }> = [];
		const started = vessel().orientation;
		let late = started;
		for (let i = 0; i < 400; i++) {
			sim.step(0.02);
			if (i === 349) late = vessel().orientation;
			track.push(centre());
		}
		const end = vessel().orientation;
		const turned = (a: typeof end, b: typeof end) =>
			(2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w))) * 180) /
			Math.PI;
		sim.dispose();
		return { track, spinAfter: turned(late, end), turnedOver: turned(started, end), parts };
	};

	test('the centre of mass of a 90° swing stays with the one of a vessel that did not swing', async () => {
		const still = await centreAt(false);
		const swung = await centreAt(true);
		let worst = 0;
		still.track.forEach((c, i) => {
			const d = swung.track[i]!;
			worst = Math.max(worst, Math.hypot(c.x - d.x, c.y - d.y, c.z - d.z));
		});
		// before the rebuild kept the centre in place it jumped by about 1.5 m over the swing
		expect(worst).toBeLessThan(0.01);
	}, 120_000);

	test('the rest turns the other way while the arm swings, and no spin is left when it stops', async () => {
		const still = await centreAt(false);
		const swung = await centreAt(true);
		expect(still.turnedOver).toBeLessThan(0.01);
		// the vessel's attitude changed (it counter-rotated) ...
		expect(swung.turnedOver).toBeGreaterThan(5);
		// ... and in the last second after the arm stopped it turns by less than 0.5° (0.01 rad/s)
		expect(swung.spinAfter).toBeLessThan(0.5);
	}, 120_000);
});
