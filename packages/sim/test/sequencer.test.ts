/** Plan 282 (ADR 0348): a sequencer plays keyframe tracks over robotic joints; the new robotic parts move. */
import { describe, expect, test } from 'bun:test';
import type { VesselDesign } from '@orbital/core';
import { newSim, stack } from './helpers/vessels.ts';

const R = 600_000;
const PLACE = {
	kind: 'state',
	body: 'stock.home',
	position: { x: 0, y: R + 2_000_000, z: 0 },
	velocity: { x: 0, y: 0, z: 0 }
} as const;

/** pod 0, sequencer 1, `joint` 2, tank 3: the sequencer drives part 2. */
async function rig(joint: string, tracks: unknown[], mode: 'once' | 'loop' | 'pingpong' = 'once') {
	const sim = await newSim();
	const design = stack(
		'Rig',
		['stock.command-pod', 'stock.sequencer', joint, 'stock.tank-small'],
		[]
	);
	const withSettings: VesselDesign = {
		...design,
		parts: design.parts.map((p) =>
			p.index === 1 ? { ...p, settings: { 'stock.sequencer': { tracks, mode } } } : p
		)
	};
	const r = sim.dispatch({ type: 'load-vessel', design: withSettings, placement: PLACE } as never);
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	const parts = () => sim.snapshot().vessels.find((v) => v.id === id)!.parts;
	const seq = () => parts()[1]!.modules['stock.sequencer'] as { playing: boolean; time: number };
	const robot = () => parts()[2]!.modules['stock.robotic'] as { value: number; target: number };
	const play = (on = true) =>
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: parts()[1]!.id,
			module: 'stock.sequencer',
			action: 'setPlaying',
			args: [on]
		} as never);
	const run = (s: number) => {
		for (let i = 0; i < s / 0.02; i++) sim.step(0.02);
	};
	return { sim, id, parts, seq, robot, play, run };
}

const swing = [
	{
		part: 2,
		action: 'setTarget',
		keys: [
			{ t: 0, value: 0 },
			{ t: 2, value: 90 },
			{ t: 4, value: 0 }
		]
	}
];

describe('the sequencer (plan 282)', () => {
	test('a two-keyframe track moves a hinge to 90° and back within its timing, in a looped play', async () => {
		const { sim, seq, robot, play, run } = await rig('stock.hinge-s', swing, 'loop');
		expect(play().ok).toBe(true);
		run(2);
		// the target followed the keys to the 90° key; the joint (30°/s) is on its way
		expect(robot().target).toBeGreaterThan(87);
		expect(robot().value).toBeGreaterThan(30);
		run(2.1); // t = 4.1 s: the loop has wrapped and the target is near 0 again
		expect(seq().playing).toBe(true);
		expect(seq().time).toBeLessThan(0.5);
		expect(robot().target).toBeLessThan(10);
		sim.dispose();
	}, 60_000);

	test('once plays to the end and stops; the last value is where the joint ends up', async () => {
		const { sim, seq, robot, play, run } = await rig(
			'stock.hinge-s',
			[
				{
					part: 2,
					action: 'setTarget',
					keys: [
						{ t: 0, value: 0 },
						{ t: 1, value: 60 }
					]
				}
			],
			'once'
		);
		play();
		run(1.5);
		expect(seq().playing).toBe(false);
		expect(seq().time).toBe(1);
		run(3);
		expect(robot().target).toBe(60);
		expect(robot().value).toBeCloseTo(60, 3);
		sim.dispose();
	}, 60_000);

	test('two runs give identical states', async () => {
		const a = await rig('stock.hinge-s', swing, 'loop');
		const b = await rig('stock.hinge-s', swing, 'loop');
		for (const r of [a, b]) {
			r.play();
			r.run(5);
		}
		expect(a.robot()).toEqual(b.robot());
		expect(a.seq()).toEqual(b.seq());
		a.sim.dispose();
		b.sim.dispose();
	}, 60_000);

	test('a track that names no joint, or one that is locked, is skipped without harm', async () => {
		const { sim, play, run, seq } = await rig(
			'stock.hinge-s',
			[
				{ part: 9, action: 'setTarget', keys: [{ t: 0, value: 10 }] },
				{ part: 3, action: 'setTarget', keys: [{ t: 0, value: 10 }] }
			],
			'loop'
		);
		play();
		run(1);
		expect(seq().playing).toBe(true);
		sim.dispose();
	}, 60_000);
});

describe('the new robotic parts (plan 282)', () => {
	test('the telescoping piston extends to its full length', async () => {
		const { sim, id, parts, run } = await rig('stock.piston-t', [], 'once');
		const gap = () => {
			const p = parts();
			return Math.hypot(
				p[3]!.position.x - p[0]!.position.x,
				p[3]!.position.y - p[0]!.position.y,
				p[3]!.position.z - p[0]!.position.z
			);
		};
		const before = gap();
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: parts()[2]!.id,
			module: 'stock.robotic',
			action: 'setTarget',
			args: [10]
		} as never);
		run(8);
		const robot = parts()[2]!.modules['stock.robotic'] as { value: number };
		expect(robot.value).toBeCloseTo(1.35, 6);
		expect(gap() - before).toBeCloseTo(1.35, 2);
		sim.dispose();
	}, 60_000);

	test('the alligator hinge folds to its limit', async () => {
		const { sim, id, parts, run } = await rig('stock.hinge-alligator', [], 'once');
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: parts()[2]!.id,
			module: 'stock.robotic',
			action: 'setTarget',
			args: [200]
		} as never);
		run(8);
		const robot = parts()[2]!.modules['stock.robotic'] as { value: number };
		expect(robot.value).toBeCloseTo(150, 6);
		// the tank swung over the top: it is no longer above the hinge
		const p = parts();
		expect(p[3]!.position.y).toBeLessThan(p[2]!.position.y + 0.5);
		sim.dispose();
	}, 60_000);
});

describe('an axis on a joint (plan 282)', () => {
	test('setAxis puts the target at its place in the travel: -1 the near end, 0 the middle, 1 the far end', async () => {
		const { sim, id, parts, run } = await rig('stock.hinge-s', [], 'once');
		const set = (axis: number) =>
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: parts()[2]!.id,
				module: 'stock.robotic',
				action: 'setAxis',
				args: [axis]
			} as never);
		const robot = () => parts()[2]!.modules['stock.robotic'] as { value: number; target: number };
		set(1);
		expect(robot().target).toBe(90);
		set(-1);
		expect(robot().target).toBe(-90);
		set(0.5);
		run(8);
		expect(robot().value).toBeCloseTo(45, 4);
		expect(set(2).ok).toBe(false);
		sim.dispose();
	}, 60_000);
});
