/** Plan 071 / ADR 0121 point 1: one terrain spec for a later hills body (sim, CPU twin, GPU bake). */
import { describe, expect, test } from 'bun:test';
import {
	LEGACY_TERRAIN_SEED,
	createBodyTerrainField,
	hillsSeedOf,
	latLonDirection,
	type BodyId,
	type TerrainZone,
	type Vec3
} from '@orbital/core';
import { MoonPass } from '../src/moon.ts';
import { SceneModel } from '../src/scene.ts';

const HOME = 'stock.home' as BodyId;
const orbit = { a: 30e6, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 };
const rock = {
	id: 'test.rock' as BodyId,
	radius: 420_000,
	mass: 3e22,
	parent: HOME,
	orbit,
	terrain: { kind: 'hills' as const }
};
const zone: TerrainZone = { latitude: 0.3, longitude: 1.1, flatRadius: 4_000, blendWidth: 3_000 };

function directions(count: number, seed = 7): Vec3[] {
	let s = seed;
	const next = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
	return Array.from({ length: count }, () => {
		const y = 2 * next() - 1;
		const a = 2 * Math.PI * next();
		const r = Math.sqrt(1 - y * y);
		return { x: r * Math.cos(a), y, z: -r * Math.sin(a) };
	});
}

describe('the terrain spec of a later hills body (plan 071)', () => {
	test("the pass's CPU height is the sim's field for the world's seed and the body's site zone", () => {
		const worldSeed = 4242;
		const spec = { seed: hillsSeedOf(rock, worldSeed, false), zones: [zone] };
		const pass = new MoonPass(rock.id, rock.radius, { kind: 'hills', terrain: spec });
		// what the sim's bodies.ts asks of `createBodyTerrainField` for this body
		const sim = createBodyTerrainField(rock, spec)!;
		for (const d of directions(300)) expect(pass.groundHeight(d)).toBe(sim.heightAt(d));
		// the site's flat zone is flat in both
		const site = latLonDirection(zone.latitude, zone.longitude);
		expect(pass.groundHeight(site)).toBe(sim.heightAt(site));
	});

	test('two seeds give different ground; the default seed mixes the world seed with the body id', () => {
		const a = new MoonPass(rock.id, rock.radius, {
			kind: 'hills',
			terrain: { seed: 1, zones: [] }
		});
		const b = new MoonPass(rock.id, rock.radius, {
			kind: 'hills',
			terrain: { seed: 2, zones: [] }
		});
		const dirs = directions(100);
		const differ = dirs.filter((d) => a.groundHeight(d) !== b.groundHeight(d)).length;
		// the rest is sea on both maps (height 0)
		expect(differ).toBeGreaterThan(50);
		expect(hillsSeedOf(rock, 4242, false)).not.toBe(4242);
		expect(hillsSeedOf(rock, 4242, true)).toBe(4242);
		expect(hillsSeedOf({ ...rock, terrain: { kind: 'hills', seed: 9 } }, 4242, false)).toBe(9);
		expect(hillsSeedOf({ ...rock, id: 'test.other' as BodyId }, 4242, false)).not.toBe(
			hillsSeedOf(rock, 4242, false)
		);
	});

	test('the scene gives the pass the host spec, else the same rule as the sim', () => {
		const home = { id: HOME, radius: 600_000, mass: 5.9e24 };
		const given = { seed: 77, zones: [zone] };
		const withSpec = new SceneModel({
			bodies: [home, rock],
			partShapes: new Map(),
			bodyTerrain: { [rock.id]: given }
		});
		const moonOf = (m: SceneModel) =>
			(m as unknown as { moons: Map<string, MoonPass> }).moons.get(rock.id)!;
		expect(moonOf(withSpec).terrain).toEqual(given);
		const derived = new SceneModel({ bodies: [home, rock], partShapes: new Map() });
		expect(moonOf(derived).terrain.seed).toBe(hillsSeedOf(rock, LEGACY_TERRAIN_SEED, false));
	});

	test('the bake materials carry the zone and shift uniforms (they were never set before)', () => {
		const spec = { seed: 1234, zones: [zone] };
		const pass = new MoonPass(rock.id, rock.radius, { kind: 'hills', terrain: spec });
		const mats = pass as unknown as {
			cubeMaterial: { uniforms: Record<string, { value: unknown }> };
			patchMaterial: { uniforms: Record<string, { value: unknown }> };
		};
		for (const m of [mats.cubeMaterial, mats.patchMaterial]) {
			expect(m.uniforms.uZoneCount!.value).toBe(1);
			expect(m.uniforms.uTerrainShift).toBeDefined();
		}
	});
});

describe('terrain shadows on a hills body (plan 071, ADR 0121 point 4)', () => {
	test("the hills march frees a higher sun and clears more relief than the craters'", async () => {
		const { HILLS_SHADOW_MARCH, SHADOW_MARCH, shadowRayLength, terrainSunVisibility } =
			await import('../src/terrain-shadow.ts');
		expect(HILLS_SHADOW_MARCH.freeSine).toBeGreaterThan(Math.SQRT1_2);
		expect(shadowRayLength(0.3, HILLS_SHADOW_MARCH)).toBeGreaterThan(
			shadowRayLength(0.3, SHADOW_MARCH)
		);
		// a ridge 200 m high from 300 to 600 m east of the point hides a sun 20 degrees up in the east
		const R = 420_000;
		const wall = (d: Vec3) =>
			d.x > 0 &&
			Math.abs(d.z) < 0.01 &&
			d.y > 0 &&
			Math.atan2(d.y, d.x) < Math.PI / 2 - 300 / R &&
			Math.atan2(d.y, d.x) > Math.PI / 2 - 600 / R
				? 200
				: 0;
		const n = { x: 0, y: 1, z: 0 };
		const e = 20 * (Math.PI / 180);
		const sun = { x: Math.cos(e), y: Math.sin(e), z: 0 };
		expect(
			terrainSunVisibility({
				groundAt: wall,
				radius: R,
				direction: n,
				height: 0,
				sun,
				march: HILLS_SHADOW_MARCH
			})
		).toBeLessThan(0.1);
		expect(
			terrainSunVisibility({
				groundAt: () => 0,
				radius: R,
				direction: n,
				height: 0,
				sun,
				march: HILLS_SHADOW_MARCH
			})
		).toBe(1);
	});
});
