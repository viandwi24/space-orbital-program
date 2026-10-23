import { describe, expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { atmosphereFor } from '../src/atmosphere-model.ts';
import { DETAIL_LOD_FADE, DETAIL_SIZE, DETAIL_TILE } from '../src/detail-textures.ts';
import { PlanetPass } from '../src/planet.ts';
import { PRESETS } from '../src/presets.ts';
import { planetFragment } from '../src/shaders/planet.glsl.ts';
import { siteAxes } from '../src/sun.ts';

/**
 * A branch's ground (plan 388): round the home site in view the planet pass draws a site's ground,
 * not the field patchwork, hill relief and rivers of the open country; and the ground detail fades
 * out before a tile is a few texels that repeat as a grid.
 */
const R = 600_000;
const HQ = { latitude: 0.009, longitude: 0.02 };
const BRANCH = { latitude: 0.3, longitude: 0.9 };

describe('a branch in view', () => {
	test('the planet pass knows where it is: the launch site minus the branch, body-fixed', () => {
		const planet = new PlanetPass(atmosphereFor(R, 100_000), PRESETS.high, HQ);
		const v = (): Vector3 => planet.material.uniforms.uSiteToOther!.value as Vector3;
		expect(v().length()).toBeGreaterThan(1e7);
		planet.setOtherSite(BRANCH);
		const hq = siteAxes(HQ.latitude, HQ.longitude).up;
		const branch = siteAxes(BRANCH.latitude, BRANCH.longitude).up;
		// a point at the branch, seen from the launch site (vS), plus the uniform is next to the branch
		const vS = new Vector3(branch.x - hq.x, branch.y - hq.y, branch.z - hq.z).multiplyScalar(R);
		expect(vS.clone().add(v()).length()).toBeLessThan(1e-6 * R);
		// the launch site moving keeps it right
		planet.setSite(0.1, 0.1);
		const hq2 = siteAxes(0.1, 0.1).up;
		const vS2 = new Vector3(branch.x - hq2.x, branch.y - hq2.y, branch.z - hq2.z).multiplyScalar(R);
		expect(vS2.add(v()).length()).toBeLessThan(1e-6 * R);
		planet.setOtherSite(null);
		expect(v().length()).toBeGreaterThan(1e7);
	});

	test('the shader measures the site distance to the nearer of the two', () => {
		expect(planetFragment).toContain('min(length(vS), length(vS + uSiteToOther))');
	});

	test('the detail fades out while a tile still has 4 or more texels across', () => {
		expect(DETAIL_LOD_FADE[0]).toBeLessThan(DETAIL_LOD_FADE[1]);
		expect(DETAIL_SIZE / 2 ** DETAIL_LOD_FADE[1]).toBeGreaterThanOrEqual(4);
		expect(DETAIL_TILE.rock).toBe(4);
	});
});
