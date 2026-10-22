/** Plan 347, ADR 0296: overlays published by sim systems, and the facts a prediction needs. */
import { describe, expect, test } from 'bun:test';
import type { EntityId, Plugin, SystemContext } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineOverlay, definePlugin, defineSystem } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { probe, rapier } from './helpers/vessels.ts';

let ctx: SystemContext | undefined;

const mod: Plugin = definePlugin({
	meta: { id: 'ovl', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(c) {
		c.overlays.register(defineOverlay({ id: 'ovl.path', title: 'Path', defaultOn: true }));
		c.systems.register(
			defineSystem({
				id: 'ovl.grab',
				phase: 'post-physics',
				update: (_w, _dt, x) => void (ctx = x)
			})
		);
	}
});
const other: Plugin = definePlugin({
	meta: { id: 'other', version: '1.0.0', api: '^0.1' },
	depends: ['ovl'],
	setup(c) {
		c.overlays.register(defineOverlay({ id: 'other.thing', title: 'Thing', defaultOn: false }));
	}
});

const make = () => createSim({ plugins: [Stock, mod, other], backendFactory: rapier(16), seed: 2 });
const load = (sim: Sim, alt: number, speed = 1): EntityId => {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: probe(),
		placement: {
			kind: 'state',
			...orbitState(sim, alt, speed),
			orientation: { x: 0, y: 0, z: 0, w: 1 }
		}
	});
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};

describe('published overlays (plan 347)', () => {
	test('reach the snapshot clamped, are the plugin own, and are not saved', async () => {
		const sim = await make();
		load(sim, 120_000);
		run(sim, 0.04);
		const c = ctx!;
		const r = c.overlays.set(
			'ovl.path',
			[
				{
					kind: 'polyline',
					body: 'stock.home',
					frame: 'inertial',
					color: '#00ff00',
					points: [
						{ x: 0, y: 0, z: 0 },
						{ x: 1, y: 0, z: 0 }
					]
				},
				{
					kind: 'label',
					body: 'stock.home',
					frame: 'inertial',
					color: 'nope',
					position: { x: 0, y: 0, z: 0 },
					text: 'x'
				} as never
			],
			{ seconds: 12, bad: Number.NaN }
		);
		expect(r.dropped).toHaveLength(1);
		const layer = sim.snapshot().overlays?.['ovl.path'];
		expect(layer?.shapes).toHaveLength(1);
		expect(layer?.meta).toEqual({ seconds: 12 });
		expect(c.world.overlay('ovl.path')?.meta).toEqual({ seconds: 12 });
		expect(() => c.overlays.set('other.thing', [])).toThrow(/belongs to "other"/);
		expect(() => c.overlays.set('ovl.nope', [])).toThrow(/not registered/);
		expect(JSON.stringify(sim.save())).not.toContain('ovl.path');
		c.overlays.clear('ovl.path');
		expect(sim.snapshot().overlays).toBeUndefined();
		sim.dispose();
	}, 60_000);

	test('aero facts: mass, an estimate in vacuum, a measurement in air; ground height and air from the query', async () => {
		const sim = await make();
		const id = load(sim, 120_000);
		run(sim, 0.04);
		const vac = sim.snapshot().vessels[0]!.aero!;
		expect(vac.mass).toBeGreaterThan(100);
		expect(vac.dragArea).toBeGreaterThan(0);
		// into the air: a slow vessel at 20 km falls through it
		const low = load(sim, 20_000, 0.2);
		run(sim, 2);
		const air = sim.snapshot().vessels.find((v) => v.id === low)!.aero!;
		expect(air.dragArea).toBeGreaterThan(0.05);
		expect(air.dragArea).toBeLessThan(10);
		const w = ctx!.world;
		expect(w.vessel(id)?.mass).toBe(vac.mass);
		expect(w.atmosphere('stock.home', 0).density).toBeCloseTo(1.225, 2);
		expect(w.atmosphere('stock.home', 200_000).density).toBe(0);
		expect(w.groundHeight('stock.home', { x: 600_000, y: 0, z: 0 })).toBeGreaterThanOrEqual(0);
		expect(w.body('stock.home')!.angularVelocity.y).not.toBe(0);
		sim.dispose();
	}, 60_000);
});
