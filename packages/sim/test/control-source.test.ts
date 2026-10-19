/** Plan 200 / ADR 0109 point 1: a pod controls only with crew in its seats; probes follow the comms rule. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const pod = () => stack('Pod', ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'], [[2]]);
const make = (preset: string) =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(16),
		world: { ...legacyWorldInfo(3), id: `control-${preset}`, preset } as WorldInfo
	});

describe('control source', () => {
	test('an empty pod with no probe is uncontrolled and ignores throttle and stage (Career, nobody hired)', async () => {
		const sim = await make('stock.career');
		const r = sim.dispatch({ type: 'load-vessel', design: pod() });
		if (!r.ok) throw new Error(r.reason);
		const v = sim.snapshot().vessels[0]!;
		expect(v.uncontrolled).toBe('no-crew');
		const reason = `vessel ${r.vessel} ("Pod") has no crew in its command part`;
		expect(sim.dispatch({ type: 'throttle', vessel: r.vessel!, value: 1 })).toEqual({
			ok: false,
			reason
		});
		expect(sim.dispatch({ type: 'stage', vessel: r.vessel! })).toEqual({ ok: false, reason });
		sim.dispose();
	});

	test('the same pod with one crew member is controlled', async () => {
		const sim = await make('stock.career');
		expect(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }).ok).toBe(true);
		const member = sim.snapshot().crew![0]!.id;
		const r = sim.dispatch({ type: 'load-vessel', design: pod(), crew: [{ member, part: 0 }] });
		if (!r.ok) throw new Error(r.reason);
		expect(sim.snapshot().vessels[0]!.uncontrolled).toBeUndefined();
		expect(sim.dispatch({ type: 'throttle', vessel: r.vessel!, value: 1 }).ok).toBe(true);
		expect(sim.dispatch({ type: 'stage', vessel: r.vessel! }).ok).toBe(true);
		sim.dispose();
	});

	test('without an economy the launch seats a hired pilot in the empty pod (ADR 0216)', async () => {
		const sim = await make('stock.sandbox');
		const r = sim.dispatch({ type: 'load-vessel', design: pod() });
		if (!r.ok) throw new Error(r.reason);
		const s = sim.snapshot();
		expect(s.vessels[0]!.uncontrolled).toBeUndefined();
		expect(s.crew).toHaveLength(1);
		expect(s.crew![0]!.status).toBe('assigned');
		// an explicit empty crew list keeps the pod empty
		const empty = sim.dispatch({ type: 'load-vessel', design: pod(), crew: [] });
		const e = sim.snapshot().vessels.find((v) => v.id === (empty.ok && empty.vessel))!;
		expect(e.uncontrolled).toBe('no-crew');
		sim.dispose();
	});

	test('a probe without signal follows the world comms rule', async () => {
		const probe = stack(
			'Probe',
			['stock.probe-core', 'stock.battery-small', 'stock.tank-small', 'stock.engine-lv'],
			[[3]]
		);
		// a probe far behind the home body: no ground station sees it
		const placement = {
			kind: 'state' as const,
			position: { x: -800_000, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: Math.sqrt(3.5316e12 / 800_000) }
		};
		for (const [preset, ok] of [
			['stock.sandbox', true],
			['stock.career', false]
		] as const) {
			const sim = await make(preset);
			sim.dispatch({ type: 'set-rule', rule: 'stock.comms', value: true });
			sim.dispatch({ type: 'set-rule', rule: 'stock.tech-tree', value: false });
			const r = sim.dispatch({ type: 'load-vessel', design: probe, placement });
			if (!r.ok) throw new Error(r.reason);
			sim.step(0.1);
			const t = sim.dispatch({ type: 'throttle', vessel: r.vessel!, value: 1 });
			expect(t.ok, preset).toBe(ok);
			sim.dispose();
		}
	});
});
