/** Plan 122 / ADR 0119 point 6: the sun from the star body, and the home body keyed by id. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, Snapshot } from '@orbital/core';
import { Mesh, MeshBasicMaterial } from 'three';
import { SceneModel } from '../src/scene.ts';
import { starDirection } from '../src/sun.ts';

const SUN = 'stock.sun' as BodyId;
const HOME = 'stock.home' as BodyId;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const bodies = [
	{ id: SUN, radius: 261_600_000, mass: 1.75e28, star: true },
	{
		id: HOME,
		radius: 600_000,
		mass: 5.29e22,
		parent: SUN,
		orbit: { a: 13.6e9, e: 0, i: 0.4, raan: 0, argp: 0, m0: 0, epoch: 0 }
	}
];
const snapshot = (home: { x: number; y: number; z: number }): Snapshot => ({
	t: 0,
	bodies: [
		{ id: SUN, position: { x: 0, y: 0, z: 0 }, rotation: q0 },
		{ id: HOME, position: home, rotation: q0 }
	],
	vessels: []
});

describe('a system with a star (plan 122)', () => {
	test('the sun direction is from the home body to the star, every sync', () => {
		const m = new SceneModel({ bodies, home: HOME, partShapes: new Map() });
		m.sync(snapshot({ x: 13.6e9, y: 0, z: 0 }));
		expect(m.environment.sunDirection(q0).x).toBeCloseTo(-1, 9);
		m.sync(snapshot({ x: 0, y: 0, z: -13.6e9 }));
		expect(m.environment.sunDirection(q0).z).toBeCloseTo(1, 9);
	});

	test('the star is an emissive sphere and the home body has no plain sphere (the planet pass draws it)', () => {
		const m = new SceneModel({ bodies, home: HOME, partShapes: new Map() });
		const star = m.bodyObject(SUN)!.children[0] as Mesh;
		expect(star.material).toBeInstanceOf(MeshBasicMaterial);
		expect(m.bodyObject(HOME)!.children).toHaveLength(0);
	});

	test('without a star the fixed direction stays', () => {
		const m = new SceneModel({ bodies: [{ id: HOME, radius: 600_000 }], partShapes: new Map() });
		m.sync({
			t: 0,
			bodies: [{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 }],
			vessels: []
		});
		expect(m.environment.sunDirection(q0)).toEqual(starDirection());
	});
});
