/** Plan 310, ADR 0271: SAS `direction` and attitude hold, and autopilots that mods define. */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type CommandResult,
	type EntityId,
	type Plugin,
	type Quat,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineAutopilot, definePlugin, rotateByQuat } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

const design = (): VesselDesign =>
	({
		formatVersion: 3,
		name: 'Pilot',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			{
				index: 1,
				part: partId('stock.docking-port'),
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			},
			{
				index: 2,
				part: partId('stock.reaction-wheel'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			}
		],
		stages: []
	}) as VesselDesign;

interface Count {
	n: number;
	limit: number;
	times: number[];
}

/** `test.count` counts steps and finishes at `limit`; `test.throws` fails in its third step. */
const pilots: Plugin = definePlugin({
	meta: { id: 'test', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.autopilots.register(
			defineAutopilot<Count>({
				id: 'test.count',
				title: 'Counter',
				start(ctrl, params) {
					if (ctrl.vessel.name === 'Nope') throw new Error('not this one');
					const limit = (params as { limit?: number } | undefined)?.limit ?? 5;
					return { n: 0, limit, times: [] };
				},
				step(ctrl, memory) {
					memory.n++;
					memory.times.push(ctrl.time);
					if (memory.n === 1) ctrl.rcs(true);
					return {
						phase: 'count',
						status: `step ${memory.n}`,
						readouts: { n: memory.n, bad: Number.NaN },
						done: memory.n >= memory.limit
					};
				}
			})
		);
		ctx.autopilots.register(
			defineAutopilot<{ n: number }>({
				id: 'test.throws',
				title: 'Thrower',
				rate: 20,
				start: () => ({ n: 0 }),
				step(_ctrl, memory) {
					if (++memory.n === 3) throw new Error('boom');
					return { phase: 'ok' };
				}
			})
		);
	}
});

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};

async function setup(name = 'Pilot'): Promise<{ sim: Sim; id: EntityId }> {
	const sim = await createSim({ plugins: [Stock, pilots], backendFactory: rapier(), seed: 9 });
	const s = orbitState(sim, 120_000);
	const id = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: { ...design(), name },
			placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
		})
	);
	return { sim, id };
}
const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const nose = (q: Quat): Vec3 => rotateByQuat(q, { x: 0, y: 1, z: 0 });
const angle = (a: Vec3, b: Vec3): number =>
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

describe('SAS direction and attitude (plan 310)', () => {
	test('direction points the control nose within a degree', async () => {
		const { sim, id } = await setup();
		const want = { x: 0.3, y: -0.2, z: 0.93 };
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'direction' })).toMatchObject({
			ok: false
		});
		expect(
			sim.dispatch({ type: 'sas', vessel: id, mode: 'direction', direction: want })
		).toMatchObject({ ok: true });
		// a stick tap puts it in flight; then the assist turns it
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0.1, yaw: 0, roll: 0 });
		sim.step(0.02);
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		run(sim, 40);
		const v = sim.snapshot().vessels[0]!;
		expect(v.sas?.mode).toBe('direction');
		expect(v.sas?.direction).toBeDefined();
		expect(angle(nose(v.orientation), want)).toBeLessThan(1);
		sim.dispose();
	}, 60_000);

	test('hold with an attitude turns the control part to it', async () => {
		const { sim, id } = await setup();
		const half = Math.PI / 4;
		const q = { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }; // a quarter turn about X
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'hold', attitude: q })).toMatchObject({
			ok: true
		});
		run(sim, 40);
		const v = sim.snapshot().vessels[0]!;
		expect(angle(nose(v.orientation), nose(q))).toBeLessThan(1);
		sim.dispose();
	}, 60_000);
});

describe('autopilots (plan 310)', () => {
	test('an engaged autopilot steps at 10 Hz, sends commands, reports and finishes', async () => {
		const { sim, id } = await setup();
		const ended: unknown[] = [];
		sim.events.on('autopilot:ended', (e) => ended.push(e));
		expect(
			sim.dispatch({
				type: 'autopilot-engage',
				vessel: id,
				autopilot: 'test.count',
				params: { limit: 5 }
			})
		).toMatchObject({ ok: true });
		run(sim, 0.25);
		const mid = sim.snapshot().vessels[0]!;
		expect(mid.autopilot).toMatchObject({ id: 'test.count', title: 'Counter', phase: 'count' });
		expect(mid.autopilot!.readouts).toEqual({ n: mid.autopilot!.readouts.n! });
		expect(mid.rcs).toBe(true); // its command went through the sim's handler
		// a save in the middle keeps the memory
		const resumed = await createSim({
			plugins: [Stock, pilots],
			backendFactory: rapier(),
			resume: JSON.parse(JSON.stringify(sim.save()))
		});
		const endedAgain: unknown[] = [];
		resumed.events.on('autopilot:ended', (e) => endedAgain.push(e));
		run(sim, 1);
		run(resumed, 1);
		expect(ended).toEqual([
			{ vessel: id, autopilot: 'test.count', outcome: 'done', reason: 'step 5' }
		]);
		expect(endedAgain).toEqual(ended);
		expect(sim.snapshot().vessels[0]!.autopilot).toBeUndefined();
		sim.dispose();
		resumed.dispose();
	}, 60_000);

	test('it steps ten times a second of sim time and stops on disengage', async () => {
		const { sim, id } = await setup();
		sim.dispatch({
			type: 'autopilot-engage',
			vessel: id,
			autopilot: 'test.count',
			params: { limit: 50 }
		});
		run(sim, 1);
		expect(
			Math.abs(Number(sim.snapshot().vessels[0]!.autopilot!.readouts.n) - 10)
		).toBeLessThanOrEqual(1);
		expect(sim.dispatch({ type: 'autopilot-disengage', vessel: id })).toMatchObject({ ok: true });
		expect(sim.snapshot().vessels[0]!.autopilot).toBeUndefined();
		sim.dispose();
	}, 60_000);

	test('unknown autopilots and refusing starts are refused; a throwing step aborts', async () => {
		const { sim, id } = await setup('Nope');
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'test.missing' })
		).toMatchObject({ ok: false, reason: expect.stringContaining('unknown autopilot') });
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'test.count' })).toEqual(
			{ ok: false, reason: 'not this one' }
		);
		expect(sim.dispatch({ type: 'autopilot-disengage', vessel: id })).toMatchObject({ ok: false });
		const ended: Array<{ outcome: string; reason: string }> = [];
		sim.events.on('autopilot:ended', (e) => ended.push(e));
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'test.throws' })
		).toMatchObject({ ok: true });
		run(sim, 1);
		expect(ended).toEqual([
			expect.objectContaining({ outcome: 'aborted', reason: 'Thrower failed: boom' })
		]);
		sim.dispose();
	}, 60_000);
});
