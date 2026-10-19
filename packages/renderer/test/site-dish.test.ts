/** Plan 234: the deep-space dish's geometry stays on its footprint; tracking keeps its slew limits. */
import { describe, expect, test } from 'bun:test';
import { Box3, Mesh, Vector3 } from 'three';
import { merge } from '../src/site-geo.ts';
import {
	DISH,
	DISH_MIN_ELEVATION,
	DISH_RATES,
	DISH_STOW,
	aimOf,
	buildDishParts,
	dishObject,
	trackStep
} from '../src/site-dish.ts';

const DEG = Math.PI / 180;
const objectOf = (detail: 'high' | 'low') =>
	dishObject(buildDishParts(detail), (geos) => new Mesh(merge(geos)));

describe('deep-space dish model', () => {
	test('stays within its 8 × 8 cell footprint and above the ground at every aim', () => {
		const dish = objectOf('high');
		for (const az of [0, 45, 90, 180, 270]) {
			for (const el of [6, 20, 45, 90]) {
				dish.setAim({ azimuth: az * DEG, elevation: el * DEG });
				dish.root.updateMatrixWorld(true);
				// every vertex within a circle that fits in the footprint, and none under the ground
				let reach = 0;
				let low = Infinity;
				const v = new Vector3();
				dish.root.traverse((o) => {
					if (!(o instanceof Mesh)) return;
					const pos = o.geometry.getAttribute('position');
					for (let i = 0; i < pos.count; i++) {
						v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
						reach = Math.max(reach, Math.hypot(v.x, v.z));
						low = Math.min(low, v.y);
					}
				});
				expect(reach).toBeLessThanOrEqual(DISH.halfWidth);
				expect(low).toBeGreaterThanOrEqual(-0.01);
			}
		}
		// the reflector is the stated size: its rim spans the diameter when it looks at the zenith
		dish.setAim({ azimuth: 0, elevation: DISH_STOW });
		dish.root.updateMatrixWorld(true);
		const size = new Box3().setFromObject(dish.elevation).getSize(new Vector3());
		expect(size.x).toBeGreaterThan(DISH.diameter - 1);
		expect(size.x).toBeLessThan(DISH.diameter + 2);
	});

	test('the far model is lighter: fewer vertices, the same three moving levels', () => {
		const count = (detail: 'high' | 'low') => {
			let n = 0;
			let meshes = 0;
			objectOf(detail).root.traverse((o) => {
				if (o instanceof Mesh) {
					meshes++;
					n += o.geometry.getAttribute('position').count;
				}
			});
			return { n, meshes };
		};
		const high = count('high');
		const low = count('low');
		expect(low.n).toBeLessThan(high.n / 2);
		expect(high.meshes).toBeLessThanOrEqual(16); // one mesh per material per level
		expect(high.n).toBeLessThan(400_000);
	});
});

describe('dish tracking', () => {
	test('respects the slew limits and points within 0.5 degrees at steady state', () => {
		const target = aimOf({ x: 1, y: 0.8, z: -0.3 });
		let aim = { azimuth: -2, elevation: DISH_STOW };
		const dt = 1 / 30;
		for (let i = 0; i < 30 * 1500; i++) {
			const next = trackStep(aim, target, dt);
			const dAz = Math.abs(
				Math.atan2(Math.sin(next.azimuth - aim.azimuth), Math.cos(next.azimuth - aim.azimuth))
			);
			expect(dAz).toBeLessThanOrEqual(DISH_RATES.azimuth * dt + 1e-12);
			expect(Math.abs(next.elevation - aim.elevation)).toBeLessThanOrEqual(
				DISH_RATES.elevation * dt + 1e-12
			);
			aim = next;
		}
		expect(
			Math.abs(
				Math.atan2(Math.sin(aim.azimuth - target.azimuth), Math.cos(aim.azimuth - target.azimuth))
			)
		).toBeLessThan(0.5 * DEG);
		expect(Math.abs(aim.elevation - target.elevation)).toBeLessThan(0.5 * DEG);
	});

	test('azimuth takes the short way round; below the horizon limit it stows at the zenith', () => {
		const step = trackStep(
			{ azimuth: 179 * DEG, elevation: 0.5 },
			{ azimuth: -179 * DEG, elevation: 0.5 },
			1
		);
		expect(step.azimuth).toBeGreaterThan(179 * DEG);
		let aim = { azimuth: 1, elevation: 30 * DEG };
		for (let i = 0; i < 400; i++)
			aim = trackStep(aim, { azimuth: 2, elevation: DISH_MIN_ELEVATION / 2 }, 1);
		expect(aim.elevation).toBeCloseTo(DISH_STOW, 9);
		expect(aim.azimuth).toBe(1);
		expect(aimOf({ x: 0, y: 0, z: -1 })).toEqual({ azimuth: 0, elevation: 0 });
		expect(aimOf({ x: 1, y: 0, z: 0 }).azimuth).toBeCloseTo(Math.PI / 2, 12);
	});
});
