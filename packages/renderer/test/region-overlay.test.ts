/** Plan 192 / ADR 0180: the region overlay of map view matches `regionAt`, and the cursor's region. */
import { describe, expect, test } from 'bun:test';
import {
	createRng,
	loadPlugins,
	regionAt,
	type BodyId,
	type EntityId,
	type Snapshot
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { Mesh, SphereGeometry } from 'three';
import { regionColour, regionTexture, uvDirection } from '../src/region-overlay.ts';
import { SceneModel } from '../src/scene.ts';

const bodies = loadPlugins([Stock]).registries.bodies;
const home = bodies.get('stock.home')!;
const moon = bodies.get('stock.cinder')!;

describe('the region overlay (plan 192)', () => {
	test('the texel layout is where three puts the sphere UVs', () => {
		const g = new SphereGeometry(1, 32, 16);
		const pos = g.getAttribute('position');
		const uv = g.getAttribute('uv');
		for (let k = 0; k < pos.count; k += 7) {
			const d = uvDirection(uv.getX(k), uv.getY(k));
			expect(d.x).toBeCloseTo(pos.getX(k), 6);
			expect(d.y).toBeCloseTo(pos.getY(k), 6);
			expect(d.z).toBeCloseTo(pos.getZ(k), 6);
		}
	});

	for (const [name, body] of [
		['home (biomes)', home],
		['moon (cells)', moon]
	] as const) {
		test(`the colour at 200 directions matches regionAt on the ${name}`, () => {
			const world = { seed: 12345 };
			const t = regionTexture(body, world, 128, 64);
			const rng = createRng(192);
			const seen = new Set<string>();
			for (let n = 0; n < 200; n++) {
				const i = Math.floor(rng.range(0, t.width));
				const j = Math.floor(rng.range(0, t.height));
				const id = regionAt(body, uvDirection((i + 0.5) / t.width, (j + 0.5) / t.height), world);
				seen.add(id);
				const o = (j * t.width + i) * 4;
				expect([t.data[o], t.data[o + 1], t.data[o + 2]]).toEqual([...regionColour(body, id)]);
			}
			expect(seen.size).toBeGreaterThan(1);
		});
	}

	test('the overlay shows in map view only, and the cursor hit gives the body-fixed direction', () => {
		const HOME = 'stock.home' as BodyId;
		const q = { x: 0, y: Math.sin(0.4), z: 0, w: Math.cos(0.4) }; // the body turned 0.8 rad
		const m = new SceneModel({
			bodies: [{ id: HOME, radius: 600_000, mass: 5.9e24 }],
			partShapes: new Map()
		});
		const snap: Snapshot = {
			t: 0,
			bodies: [{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q }],
			vessels: [
				{
					id: 1 as EntityId,
					mode: 'on-rails',
					soi: HOME,
					position: { x: 700_000, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: 2_300 },
					orientation: { x: 0, y: 0, z: 0, w: 1 },
					parts: []
				}
			]
		};
		m.resize(800, 600);
		m.setActiveVessel(1 as EntityId);
		m.setRegionOverlay([{ id: HOME, body: home }]);
		const mesh = m.bodyObject(HOME)!.children.find((c) => c.name === 'regions:stock.home') as Mesh;
		expect(mesh.visible).toBe(false);
		m.setMapView(true);
		m.sync(snap);
		expect(mesh.visible).toBe(true);
		// a surface point in the body frame, projected, comes back as the same direction
		const d = { x: 0.6, y: 0.48, z: 0.64 };
		const w = { x: 0, y: 0, z: 0 };
		// rotate d by q into the inertial frame
		const [qx, qy, qz, qw] = [q.x, q.y, q.z, q.w];
		const ix = qw * d.x + qy * d.z - qz * d.y;
		const iy = qw * d.y + qz * d.x - qx * d.z;
		const iz = qw * d.z + qx * d.y - qy * d.x;
		const iw = -qx * d.x - qy * d.y - qz * d.z;
		w.x = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * 600_000;
		w.y = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * 600_000;
		w.z = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * 600_000;
		const p = m.project(w);
		expect(p && !p.hidden).toBe(true);
		const hit = m.bodyDirectionAt(p!.x, p!.y)!;
		expect(hit.body).toBe(HOME);
		expect(hit.direction.x).toBeCloseTo(d.x, 2);
		expect(hit.direction.y).toBeCloseTo(d.y, 2);
		expect(hit.direction.z).toBeCloseTo(d.z, 2);
		expect(m.bodyDirectionAt(1, 1)).toBeNull();
		m.setRegionOverlay(null);
		expect(m.bodyObject(HOME)!.children.some((c) => c.name.startsWith('regions:'))).toBe(false);
	});
});
