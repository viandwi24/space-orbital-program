/** The navball on a tilted home planet (plan 085, ADR 0145): level on the pad, north along the pole. */
import { bodyPole, type BodyDefinition } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { definePatch, definePlugin } from '@orbital/sdk';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import { createHudController } from './hud-controller';
import { localHorizon } from './navball-math';

const DEG = Math.PI / 180;
const TILT = 23.44 * DEG;
const Tilt = definePlugin({
	meta: { id: 'test.tilt', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.patches.register(
			definePatch({
				id: 'test.tilt.home',
				target: 'body',
				select: { id: 'stock.home' },
				ops: [{ op: 'set', path: 'rotation', value: { pole: { ra: 0, dec: Math.PI / 2 - TILT } } }]
			})
		);
	}
});

describe('navball on a planet tilted 23.44 degrees', () => {
	it('on the pad the pitch is 90 degrees, and north points along the pole', async () => {
		const sim = await createSim({
			plugins: [Stock, Tilt],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			seed: 1
		});
		try {
			const design = referenceTwoStage();
			const r = sim.dispatch({ type: 'load-vessel', design });
			if (!r.ok) throw new Error(r.reason);
			const bodies = sim.registries.bodies.list();
			const hud = createHudController({
				design,
				content: sim.registries,
				bodies,
				project: () => null,
				now: () => 0,
				rendezvous: () => ({ approach: null, aids: [] })
			});
			hud.attach(Number(r.vessel));
			sim.step(1);
			const snap = sim.snapshot();
			hud.snapshot(snap);
			const model = hud.model(0, 0)!;
			expect(model.attitude!.pitch / DEG).toBeCloseTo(90, 2);
			// the horizon's north is the tilted pole's direction, not +Y
			const home = bodies.find((b) => b.id === 'stock.home') as BodyDefinition;
			const pole = bodyPole(home);
			const north = localHorizon({ x: 0, y: 0, z: -600_000 }, pole).north;
			expect(north.x).toBeCloseTo(Math.sin(TILT), 6);
			expect(north.y).toBeCloseTo(Math.cos(TILT), 6);
		} finally {
			sim.dispose();
		}
	});
});
