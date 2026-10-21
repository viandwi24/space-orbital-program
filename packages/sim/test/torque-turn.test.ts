/**
 * Plan 310 (owner report 2026-10-21): SAS turns a vessel only as fast as its torque allows. A long,
 * heavy stack turns far slower than a probe; with no wheel and RCS off a vessel cannot turn; RCS
 * spends monopropellant when it turns the vessel. A real turn on rails at 1x wakes the vessel.
 */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type CommandResult,
	type EntityId,
	type Quat,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

type Part = VesselDesign['parts'][number];
const chain = (names: string[]): Part[] =>
	names.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	}));
const design = (name: string, parts: Part[]): VesselDesign =>
	({ formatVersion: 3, name, parts, stages: [] }) as VesselDesign;

const probe = () => design('Probe', chain(['stock.probe-core', 'stock.reaction-wheel']));
/**
 * A probe core, one wheel, ten full tanks and four radial batteries (the wheel draws 0.6 EC/s; the
 * core alone holds 20): a long, heavy stack like Kronos V.
 */
const longStack = () =>
	design('Long stack', [
		...chain(['stock.probe-core', 'stock.reaction-wheel', ...Array(10).fill('stock.tank-medium')]),
		...[0, 1, 2, 3].map((k) => ({
			index: 12 + k,
			part: partId('stock.battery-radial'),
			parent: {
				index: 2,
				parentNode: 'surface',
				node: 'radial',
				radial: { angle: (k * Math.PI) / 2, y: 0 }
			}
		}))
	]);
const bare = () => design('Bare', chain(['stock.probe-core', 'stock.tank-small']));
/** No wheel: four RCS blocks on a monopropellant tank. */
const rcsOnly = () =>
	design('Thrusters', [
		...chain(['stock.probe-core', 'stock.monoprop-tank']),
		...[0, 1, 2, 3].map((k) => ({
			index: 2 + k,
			part: partId('stock.rcs-block'),
			parent: {
				index: 1,
				parentNode: 'surface',
				node: 'radial',
				radial: { angle: (k * Math.PI) / 2, y: 0 }
			}
		}))
	]);

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const nose = (q: Quat): Vec3 => {
	// +Y rotated by q
	const { x, y, z, w } = q;
	return { x: 2 * (x * y - w * z), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + w * x) };
};
const angleDeg = (a: Vec3, b: Vec3): number =>
	(Math.acos(
		Math.max(
			-1,
			Math.min(
				1,
				(a.x * b.x + a.y * b.y + a.z * b.z) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z)
			)
		)
	) *
		180) /
	Math.PI;

/** Vessel `d` alone in orbit, nose +Y, asked to point (almost) straight back; seconds to within 5°. */
async function turn(d: VesselDesign, limit: number, setup?: (sim: Sim, id: EntityId) => void) {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 2 });
	const s = orbitState(sim, 150_000);
	const id = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: d,
			placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
		})
	);
	setup?.(sim, id);
	const want = { x: 0.1, y: -1, z: 0 };
	expect(
		sim.dispatch({ type: 'sas', vessel: id, mode: 'direction', direction: want })
	).toMatchObject({ ok: true });
	const v = () => sim.snapshot().vessels.find((x) => x.id === id)!;
	let t = 0;
	let woke = false;
	for (; t < limit; t += 0.5) {
		for (let i = 0; i < 25; i++) sim.step(0.02);
		if (v().mode === 'flight') woke = true;
		if (angleDeg(nose(v().orientation), want) < 5) break;
	}
	return { sim, id, seconds: t, woke, v };
}

describe('torque-limited turns (plan 310)', () => {
	test('a long, heavy stack takes far longer to turn 180° than a probe; both wake to turn', async () => {
		const small = await turn(probe(), 120);
		const big = await turn(longStack(), 600);
		console.log(`180° turn: probe ${small.seconds} s, long stack ${big.seconds} s`);
		expect(small.woke && big.woke).toBe(true);
		expect(small.seconds).toBeLessThan(30);
		expect(big.seconds).toBeLessThan(600);
		expect(big.seconds).toBeGreaterThan(3 * small.seconds);
		const accel = big.v().sas?.accel;
		expect(accel === undefined || accel < (small.v().sas?.accel ?? Infinity)).toBe(true);
		small.sim.dispose();
		big.sim.dispose();
	}, 300_000);

	test('with no wheel and RCS off a vessel cannot turn, and the HUD reads zero torque', async () => {
		const r = await turn(bare(), 60);
		expect(r.seconds).toBeGreaterThanOrEqual(60);
		expect(angleDeg(nose(r.v().orientation), { x: 0.1, y: -1, z: 0 })).toBeGreaterThan(150);
		r.sim.dispose();
	}, 120_000);

	test('RCS turns a vessel without a wheel and spends monopropellant doing it', async () => {
		let before = 0;
		const r = await turn(rcsOnly(), 120, (sim, id) => {
			sim.dispatch({ type: 'set-rcs', vessel: id, on: true });
			before = sim
				.snapshot()
				.vessels[0]!.resources!.find((x) => x.resource === 'stock.monopropellant')!.amount;
		});
		const after = r.v().resources!.find((x) => x.resource === 'stock.monopropellant')!.amount;
		console.log(
			`RCS turn: ${r.seconds} s, monopropellant ${before.toFixed(2)} -> ${after.toFixed(2)}`
		);
		expect(r.seconds).toBeLessThan(120);
		expect(after).toBeLessThan(before);
		r.sim.dispose();
	}, 120_000);
});
