/** Plan 201: the planet samples the shadow map with this frame's shadow matrix, not last frame's. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot } from '@orbital/core';
import { Matrix4 } from 'three';
import { SceneModel } from '../src/scene.ts';
import { stockMaps } from './stock-fixture.ts';

const R = 600_000;
const BODY = 'stock.home' as BodyId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };

describe('shadow matrix (plan 201)', () => {
	test('after a frame the planet uniform holds the matrix the shadow pass computes for that frame', () => {
		const maps = stockMaps();
		const model = new SceneModel({
			bodies: [
				{
					id: BODY,
					radius: R,
					atmosphere: { scaleHeight: 5600, surfacePressure: 101_325, height: 70_000 }
				}
			],
			partShapes: maps.shapes,
			partVisuals: maps.visuals,
			partAttach: maps.attach,
			preset: 'high',
			launchSite: { latitude: 0, longitude: 0 }
		});
		const at = (t: number, height: number): Snapshot => ({
			t,
			bodies: [{ id: BODY, position: { x: 0, y: 0, z: 0 }, rotation: q0 }],
			vessels: [
				{
					id: 1 as EntityId,
					mode: 'flight',
					soi: BODY,
					position: { x: R + height, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: 0 },
					orientation: q0,
					parts: [
						{
							id: 1 as EntityId,
							definition: 'stock.tank-small' as PartId,
							position: { x: 0, y: 0, z: 0 },
							orientation: q0,
							modules: {}
						}
					]
				}
			]
		});
		const env = model.environment;
		const shadow = env.sunLight.shadow;
		const uniform = env.planet.material.uniforms.uShadowMatrix!.value as Matrix4;
		let checked = 0;
		// a climbing vessel through a day: the light and its shadow camera move every frame
		for (let i = 0; i < 48; i++) {
			model.sync(at(i * 1800, 2 + i * 40));
			model.prepareFrame(1 / 60);
			if (!env.state.shadowActive) continue;
			// what the shadow pass of this frame computes from the same light
			const expected = new Matrix4().copy(shadow.matrix);
			shadow.updateMatrices(env.sunLight);
			expect(shadow.matrix.equals(expected)).toBe(true);
			expect(uniform.equals(shadow.matrix)).toBe(true);
			checked += 1;
		}
		expect(checked).toBeGreaterThan(3);
		model.dispose();
	});
});
