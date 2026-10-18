/** Plan 071 / ADR 0121 point 2: air on a later body, through the moon pass. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot } from '@orbital/core';
import { Mesh, type MeshLambertMaterial } from 'three';
import { REFERENCE_PRESSURE, atmosphereFor } from '../src/atmosphere-model.ts';
import { MoonPass } from '../src/moon.ts';
import { SceneModel, type PartShape } from '../src/scene.ts';

const HOME = 'stock.home' as BodyId;
const POD = 'stock.pod' as PartId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const orbit = { a: 20e6, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 };
const home = {
	id: HOME,
	radius: 600_000,
	mass: 5.9e24,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
};
const mist = {
	id: 'test.mist' as BodyId,
	radius: 250_000,
	mass: 1e22,
	parent: HOME,
	orbit,
	terrain: { kind: 'hills' as const },
	atmosphere: { scaleHeight: 4_000, surfacePressure: 20_000, height: 40_000 }
};
const rock = {
	...mist,
	id: 'test.rock' as BodyId,
	atmosphere: undefined,
	orbit: { ...orbit, a: 30e6 }
};
const shapes = new Map<string, PartShape>([[POD, { kind: 'box', size: { x: 1, y: 2, z: 3 } }]]);

const snapshot = (soi: BodyId, radius: number): Snapshot => ({
	t: 0,
	bodies: [
		{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 },
		{ id: mist.id, position: { x: 20e6, y: 0, z: 0 }, rotation: q0 },
		{ id: rock.id, position: { x: 0, y: 0, z: 30e6 }, rotation: q0 }
	],
	vessels: [
		{
			id: 1 as EntityId,
			mode: 'flight',
			soi,
			position: { x: radius + 3_000, y: 0, z: 0 },
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

const shellOf = (pass: MoonPass) => pass.root.children.find((c) => c.name === 'sky-shell');

describe('air on a later body (plan 071)', () => {
	test('a body with an atmosphere gets the air programs and a sky shell; an airless one neither', () => {
		const aired = new MoonPass(mist.id, mist.radius, {
			kind: 'hills',
			atmosphere: atmosphereFor(mist.radius, 40_000, 4_000, 20_000)
		});
		const bare = new MoonPass(rock.id, rock.radius, { kind: 'hills' });
		expect(shellOf(aired)).toBeInstanceOf(Mesh);
		expect(shellOf(bare)).toBeUndefined();
		const key = (pass: MoonPass) =>
			(
				(pass.root.children.find((c) => c instanceof Mesh && c.name !== 'sky-shell') as Mesh)
					.material as MeshLambertMaterial
			).customProgramCacheKey();
		expect(key(aired)).toContain('-air');
		expect(key(bare)).not.toContain('-air');
	});

	test("the environment over a body with air is lit through that air, not as an airless body's", () => {
		const m = new SceneModel({ bodies: [home, mist, rock], partShapes: shapes });
		m.setActiveVessel(1 as EntityId);
		m.sync(snapshot(mist.id, mist.radius));
		m.prepareFrame(1 / 60, true);
		expect(m.environment.state.airless).toBeNull();
		const sky = m.environment.hemisphere.color;
		expect(sky.r + sky.g + sky.b).toBeGreaterThan(0);
		// the sky scatters blue: the ambient is bluer than red
		expect(sky.b).toBeGreaterThan(sky.r);
		m.dispose();
		const n = new SceneModel({ bodies: [home, mist, rock], partShapes: shapes });
		n.setActiveVessel(1 as EntityId);
		n.sync(snapshot(rock.id, rock.radius));
		n.prepareFrame(1 / 60, true);
		expect(n.environment.state.airless).not.toBeNull();
		n.dispose();
	});

	test('optical depth scales with the surface pressure; the home value is the reference', () => {
		const ref = atmosphereFor(600_000, 70_000, 5_600);
		const same = atmosphereFor(600_000, 70_000, 5_600, REFERENCE_PRESSURE);
		expect(same).toEqual(ref);
		const thin = atmosphereFor(600_000, 70_000, 5_600, REFERENCE_PRESSURE / 5);
		expect(thin.betaRayleigh[2]).toBeCloseTo(ref.betaRayleigh[2] / 5, 12);
		expect(thin.betaMie).toBeCloseTo(ref.betaMie / 5, 12);
	});
});
