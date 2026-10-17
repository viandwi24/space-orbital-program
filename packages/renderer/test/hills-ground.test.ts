/** Plan 059 / ADR 0090: a hills body after the first is drawn by the ground pass, on the sim's own height function. */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	LAKE_SHAPE,
	MAP_WARP,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
	TERRAIN_SHAPE,
	createBodyTerrainField,
	type BodyId,
	type EntityId,
	type PartId,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import { Mesh, Object3D, type WebGLRenderer } from 'three';
import { GROUND_SPECS, MOON_BAKE_DISTANCE } from '../src/moon-model.ts';
import { MoonPass } from '../src/moon.ts';
import { SceneModel, type PartShape } from '../src/scene.ts';
import {
	hillsCubeFragment,
	hillsHeightGLSL,
	hillsPatchFragment,
	moonCubeFragment
} from '../src/shaders/moon.glsl.ts';
import {
	terrainBakeFragment,
	terrainBakeVertex,
	terrainPatchFragment
} from '../src/shaders/terrain.glsl.ts';
import { length, normalize } from '../src/vec.ts';

const HOME = 'stock.home' as BodyId;
const POD = 'stock.pod' as PartId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const orbit = { a: 11.8e6, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 };
const home = {
	id: HOME,
	radius: 600_000,
	mass: 5.9e24,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
};
const R_AIRLESS = 420_000;
const R_AIR = 250_000;
const airless = {
	id: 'test.rock' as BodyId,
	radius: R_AIRLESS,
	mass: 3e22,
	parent: HOME,
	orbit,
	terrain: { kind: 'hills' as const }
};
const aired = {
	id: 'test.mist' as BodyId,
	radius: R_AIR,
	mass: 1e22,
	parent: HOME,
	orbit: { ...orbit, a: 20e6 },
	terrain: { kind: 'hills' as const },
	atmosphere: { scaleHeight: 4_000, surfacePressure: 20_000, height: 40_000 }
};
const plain = { id: 'test.ball' as BodyId, radius: 90_000, mass: 1e21, parent: HOME, orbit };
const shapes = new Map<string, PartShape>([[POD, { kind: 'box', size: { x: 1, y: 2, z: 3 } }]]);

/** A repeatable stream of unit body-fixed directions. */
function directions(count: number, seed = 20261017): Vec3[] {
	let s = seed;
	const next = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
	return Array.from({ length: count }, () => {
		const y = 2 * next() - 1;
		const a = 2 * Math.PI * next();
		const r = Math.sqrt(1 - y * y);
		return { x: r * Math.cos(a), y, z: -r * Math.sin(a) };
	});
}

describe('a scene with the home planet and two further hills bodies', () => {
	const scene = new SceneModel({ bodies: [home, airless, aired, plain], partShapes: shapes });
	const passOf = (id: string): boolean =>
		scene.bodyObject(id as BodyId)!.children.some((c) => c.name === `moon:${id}`);

	test('both hills bodies, with and without an atmosphere, get the ground pass; a body with no terrain stays a sphere', () => {
		expect(passOf('test.rock')).toBe(true);
		expect(passOf('test.mist')).toBe(true);
		expect(passOf('test.ball')).toBe(false);
		expect(scene.bodyObject('test.ball' as BodyId)!.children).toHaveLength(1);
		// the first body keeps the planet pass: no mesh of its own in the scene graph
		expect(scene.bodyObject(HOME)!.children).toHaveLength(0);
	});

	test("the pass's ground height is the sim's field, for radii that are not the home radius", () => {
		for (const body of [airless, aired]) {
			const pass = new MoonPass(body.id, body.radius, { kind: 'hills' });
			const field = createBodyTerrainField(body)!;
			const dirs = directions(200);
			let raised = 0;
			for (const d of dirs) {
				const h = pass.groundHeight(d);
				expect(h).toBe(field.heightAt(d));
				expect(h).toBeGreaterThanOrEqual(0);
				expect(h).toBeLessThanOrEqual(field.maxHeight);
				if (h > 0) raised++;
			}
			// the continents are land on about half of the sphere; the rest is sea and flat coast
			expect(raised).toBeGreaterThan(dirs.length / 3);
			pass.dispose();
		}
		// each is its own ground at its own radius
		const a = new MoonPass('a', R_AIRLESS, { kind: 'hills' });
		const b = new MoonPass('b', R_AIR, { kind: 'hills' });
		const differing = directions(40).filter((d) => a.groundHeight(d) !== b.groundHeight(d));
		expect(differing.length).toBeGreaterThan(10);
		a.dispose();
		b.dispose();
	});

	test('the craters pass is untouched by the kind option', () => {
		const pass = new MoonPass('c', 190_000);
		expect(pass.kind).toBe('craters');
		const n = normalize({ x: -0.4, y: 0.5, z: 0.77 });
		expect(pass.groundHeight(n)).not.toBe(
			new MoonPass('h', 190_000, { kind: 'hills' }).groundHeight(n)
		);
		pass.dispose();
	});
});

describe('the GLSL of the hills bake', () => {
	const numbers: number[] = [
		TERRAIN_SHAPE.hillAmplitude,
		TERRAIN_SHAPE.hillWavelengthKm,
		TERRAIN_SHAPE.mountainAmplitude,
		...TERRAIN_SHAPE.rangeWavelengthsKm,
		...TERRAIN_SHAPE.backdropRiseMetres,
		...TERRAIN_SHAPE.backdropFallMetres,
		TERRAIN_SHAPE.ridgeWavelengthKm,
		TERRAIN_SHAPE.landStart,
		TERRAIN_SHAPE.landFull,
		TERRAIN_SHAPE.rangeBlend,
		LAKE_SHAPE.wavelengthKm,
		LAKE_SHAPE.slope,
		LAKE_SHAPE.siteFrom,
		LAKE_SHAPE.siteTo,
		MAP_WARP.amplitude,
		...MAP_WARP.wavelengthsKm
	];
	const text = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

	test('every constant of the height function of core is in both bake fragments', () => {
		for (const n of numbers) {
			expect(hillsCubeFragment).toContain(text(n));
			expect(hillsPatchFragment).toContain(text(n));
		}
		expect(hillsHeightGLSL).toContain(`${LAKE_SHAPE.salt}`);
		expect(hillsHeightGLSL).toContain('float moonHeight(vec3 n, float radius)');
		// the site radii are uniforms now (plan 084, ADR 0142): the zone loop reads them
		expect(hillsHeightGLSL).toContain('uniform vec4 uZones[8];');
		expect(hillsHeightGLSL).toContain('vec3 zones = terrainZones(n, uRadius);');
	});

	test('the hills bake is the planet pass bake function and the craters bake is not touched', () => {
		expect(hillsCubeFragment).toContain('float heightAt(vec3 n)');
		expect(hillsCubeFragment.indexOf('uniform float uRadius;')).toBeLessThan(
			hillsCubeFragment.indexOf('float heightAt(vec3 n)')
		);
		expect(moonCubeFragment).not.toContain('heightAt');
		expect(moonCubeFragment).toContain('float moonHeight(vec3 n, float radius)');
	});

	test("the biome elevation is read by hand-made bilinear in float, not by the hardware's 8-bit filter", () => {
		expect(hillsCubeFragment).toContain('biomeElevation(vec2(ll.y / (2.0 * PI_) + 0.5');
		expect(hillsCubeFragment).not.toContain('textureLod(uMap, vec2(ll.y');
		expect(terrainBakeFragment).toContain('textureLod(uMap, vec2(ll.y');
	});

	test('the planet pass bake programs are the ones of plan 084 (zones and the seed shift, ADR 0142)', () => {
		// Plan 068 added a measurement-only `#ifdef TERRAIN_NO_GRADIENT` branch; the program without
		// that define is the one plan 084 pinned, so the pin is taken with the branch removed.
		const production = (src: string): string =>
			src.replace(/#ifdef TERRAIN_NO_GRADIENT\n[\s\S]*?#else\n([\s\S]*?)#endif\n/g, '$1');
		const sha = (s: string): string =>
			createHash('sha256').update(production(s)).digest('hex');
		// plan 059 pinned b0287f39… / 90014bca… (HEAD 4de52a7); plan 084 changed both on purpose:
		// the site's constants became the zone uniforms and noiseT gained uTerrainShift
		expect(sha(terrainBakeFragment)).toBe(
			'e2ab91ab89ccc886abfe533916f1e389c636205c764529b3711f8bc913dbe61d'
		);
		expect(sha(terrainPatchFragment)).toBe(
			'e4848aa7f82d25b680555a42b2ba601c3636cf66ef591f9e6f16e234c023c0c0'
		);
		expect(sha(terrainBakeVertex)).toBe(
			'227b9f2ac69e37c9d7c7131be39f4cf01eb80ff06ba0fc71f9ed3ab7605b0712'
		);
	});
});

describe('the cube map follows the camera (ADR 0090)', () => {
	/** Enough of a context for `bake` to run its loop: nothing is drawn. */
	const fakeGl = {
		renders: 0,
		getRenderTarget: () => null,
		setRenderTarget: () => undefined,
		render() {
			this.renders++;
		},
		autoClear: true
	};
	const globeUniforms = (pass: MoonPass): Record<string, { value: unknown }> =>
		(pass.root.children[0] as Mesh).userData.uniforms as Record<string, { value: unknown }>;

	test('a hills body bakes its cube within 8 radii, one face a frame, and gives it back beyond 16', () => {
		expect(GROUND_SPECS.hills.bakeDistance).toBe(8);
		expect(GROUND_SPECS.hills.cubeSize).toBe(1024);
		expect(GROUND_SPECS.craters.bakeDistance).toBe(MOON_BAKE_DISTANCE);
		const pass = new MoonPass('h', R_AIRLESS, { kind: 'hills' });
		const gl = fakeGl as unknown as WebGLRenderer;
		pass.update({ x: 20 * R_AIRLESS, y: 0, z: 0 });
		pass.bake(gl);
		expect(fakeGl.renders).toBe(0); // far: nothing is baked
		pass.update({ x: 7 * R_AIRLESS, y: 0, z: 0 });
		for (let i = 0; i < 6; i++) {
			expect(globeUniforms(pass).uCubeOn!.value).toBe(0);
			pass.bake(gl);
		}
		expect(fakeGl.renders).toBe(6);
		expect(globeUniforms(pass).uCubeOn!.value).toBe(1);
		pass.update({ x: 12 * R_AIRLESS, y: 0, z: 0 }); // between 8 and 16: kept
		expect(globeUniforms(pass).uCubeOn!.value).toBe(1);
		pass.update({ x: 17 * R_AIRLESS, y: 0, z: 0 });
		expect(globeUniforms(pass).uCubeOn!.value).toBe(0);
		pass.bake(gl);
		expect(fakeGl.renders).toBe(6); // released, nothing more to bake
		pass.update({ x: 5 * R_AIRLESS, y: 0, z: 0 }); // back: baked again
		for (let i = 0; i < 6; i++) pass.bake(gl);
		expect(fakeGl.renders).toBe(12);
		expect(globeUniforms(pass).uCubeOn!.value).toBe(1);
		pass.dispose();
	});

	test('a craters body keeps its cube as before', () => {
		const pass = new MoonPass('m', 190_000);
		const gl = fakeGl as unknown as WebGLRenderer;
		fakeGl.renders = 0;
		pass.update({ x: 30 * 190_000, y: 0, z: 0 });
		for (let i = 0; i < 6; i++) pass.bake(gl);
		expect(globeUniforms(pass).uCubeOn!.value).toBe(1);
		pass.update({ x: 500 * 190_000, y: 0, z: 0 });
		expect(globeUniforms(pass).uCubeOn!.value).toBe(1);
		pass.dispose();
	});

	test('on a hills body the stones, the terrain shadows and the vessel terrain light are off', () => {
		const pass = new MoonPass('h2', R_AIRLESS, { kind: 'hills' });
		pass.setDetail(true, true);
		const globe = pass.root.children[0] as Mesh;
		expect((globe.userData.uniforms as Record<string, { value: unknown }>).uShadowOn!.value).toBe(
			0
		);
		// the stone meshes stay hidden whatever the camera does
		pass.update({ x: R_AIRLESS + 30, y: 0, z: 0 });
		const stones = pass.root.children.filter((c: Object3D) => c.name === 'moon-stones');
		expect(stones.length).toBeGreaterThan(0);
		expect(stones.every((c) => !c.visible)).toBe(true);
		pass.dispose();
	});
});

describe('a lander on the second planet', () => {
	test('the camera stays above the hills the pass draws (the same ground the sim stands on)', () => {
		const scene = new SceneModel({ bodies: [home, airless, aired], partShapes: shapes });
		const field = createBodyTerrainField(airless)!;
		// the highest of a few hundred directions: a hill the camera could start inside
		let best = directions(400).reduce((a, d) => (field.heightAt(d) > field.heightAt(a) ? d : a));
		best = normalize(best);
		const h = field.heightAt(best);
		expect(h).toBeGreaterThan(300);
		const position = {
			x: best.x * (R_AIRLESS + h + 4),
			y: best.y * (R_AIRLESS + h + 4),
			z: best.z * (R_AIRLESS + h + 4)
		};
		const snapshot = (): Snapshot => ({
			t: 0,
			bodies: [
				{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 },
				{ id: airless.id, position: { x: 6_372_971, y: 0, z: -9_931_024 }, rotation: q0 },
				{ id: aired.id, position: { x: -1.2e7, y: 1e6, z: 1.6e7 }, rotation: q0 }
			],
			vessels: [
				{
					id: 1 as EntityId,
					mode: 'flight',
					soi: airless.id,
					position,
					velocity: { x: 0, y: 0, z: 0 },
					orientation: q0,
					parts: [
						{
							id: 2 as EntityId,
							definition: POD,
							position: { x: 0, y: 0, z: 0 },
							orientation: q0,
							modules: {}
						}
					]
				}
			]
		});
		scene.sync(snapshot());
		scene.setFlightRig({ yaw: 0, pitch: -1.4, distance: 25 });
		scene.sync(snapshot());
		const holder = scene.bodyObject(airless.id)!;
		const rel = {
			x: scene.camera.position.x - holder.position.x,
			y: scene.camera.position.y - holder.position.y,
			z: scene.camera.position.z - holder.position.z
		};
		const dir = normalize(rel);
		expect(length(rel)).toBeGreaterThan(R_AIRLESS + field.heightAt(dir));
	});
});
