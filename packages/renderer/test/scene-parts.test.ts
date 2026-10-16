import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot, VesselSnapshot } from '@orbital/core';
import { Material, Mesh, Object3D, type BufferGeometry } from 'three';
import { PRESETS } from '../src/presets.ts';
import { SceneModel } from '../src/scene.ts';
import { stockMaps } from './stock-fixture.ts';

const BODY = 'stock.home' as BodyId;
const R = 600_000;
const OMEGA = (2 * Math.PI) / 21_600;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const maps = stockMaps();
const id = (n: number) => n as EntityId;

const part = (
	n: number,
	definition: string,
	y: number,
	modules: Record<string, unknown> = {},
	temperature?: number
) => ({
	id: id(n),
	definition: definition as PartId,
	position: { x: 0, y, z: 0 },
	orientation: q0,
	modules,
	temperature
});

const engineOn = { 'stock.engine': { ignited: true, throttle: 1, flameout: false } };

const vessel = (
	n: number,
	parts: VesselSnapshot['parts'],
	altitude = 2,
	extraSpeed = 0
): VesselSnapshot => ({
	id: id(n),
	mode: 'flight',
	soi: BODY,
	position: { x: R + altitude, y: 0, z: 0 },
	velocity: { x: extraSpeed, y: 0, z: -OMEGA * R },
	orientation: q0,
	parts
});

const snap = (t: number, ...vessels: VesselSnapshot[]): Snapshot => ({
	t,
	bodies: [
		{
			id: BODY,
			position: { x: 0, y: 0, z: 0 },
			rotation: { x: 0, y: Math.sin((OMEGA * t) / 2), z: 0, w: Math.cos((OMEGA * t) / 2) }
		}
	],
	vessels
});

const make = (preset: 'low' | 'medium' | 'high' = 'high') =>
	new SceneModel({
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
		preset,
		launchSite: { latitude: 0, longitude: 0 }
	});

const stack = (engine: Record<string, unknown> = {}) => [
	part(1, 'stock.command-pod', 3.1),
	part(2, 'stock.tank-small', 1.6),
	part(3, 'stock.decoupler', 0.5),
	part(4, 'stock.engine-lv', -0.2, engine)
];

describe('SceneModel with part visuals (plan 020)', () => {
	test('parts with descriptors are procedural models, one per part, in the vessel group', () => {
		const m = make();
		m.sync(snap(0, vessel(1, stack())));
		const group = m.scene.children.find((c) => c.type === 'Group')!;
		expect(group.children.map((c) => c.name)).toEqual([
			'part:stock.command-pod',
			'part:stock.tank-small',
			'part:stock.decoupler',
			'part:stock.engine-lv'
		]);
		const tank = group.children[1] as Object3D;
		expect(tank.position.y).toBe(1.6);
		m.dispose();
	});

	test('a burning engine shows its plume and throws ground smoke; a stopped one does not', () => {
		const m = make();
		m.sync(snap(0, vessel(1, stack(engineOn))));
		m.prepareFrame(1 / 60, true);
		const plume = m.scene.getObjectByName('plume')!;
		expect(plume.visible).toBe(true);
		for (let i = 0; i < 120; i++) m.prepareFrame(1 / 60, true);
		expect(m.effects.particleCount).toBeGreaterThan(10);
		expect(m.effects.particleCount).toBeLessThanOrEqual(PRESETS.high.smokeParticles);
		m.sync(
			snap(
				2,
				vessel(1, stack({ 'stock.engine': { ignited: false, throttle: 0, flameout: false } }))
			)
		);
		expect(plume.visible).toBe(false);
		m.dispose();
	});

	test('effects stay inside the preset budget on low', () => {
		const m = make('low');
		m.sync(snap(0, vessel(1, stack(engineOn))));
		for (let i = 0; i < 600; i++) m.prepareFrame(1 / 60, true);
		expect(m.effects.particleCount).toBeLessThanOrEqual(PRESETS.low.smokeParticles);
		m.dispose();
	});

	test('a part that vanishes while falling fast explodes; one that despawns at rest does not', () => {
		const m = make();
		m.sync(snap(0, vessel(1, stack(), 40, -35)));
		m.sync(snap(0.1, vessel(1, stack().slice(0, 3), 36, -35)));
		m.prepareFrame(1 / 60);
		expect(m.effects.explosionCount).toBe(1);
		const quiet = make();
		quiet.sync(snap(0, vessel(1, stack())));
		quiet.sync(snap(0.1, vessel(1, stack().slice(0, 3))));
		quiet.prepareFrame(1 / 60);
		expect(quiet.effects.explosionCount).toBe(0);
		m.dispose();
		quiet.dispose();
	});

	test('a split gives separation gas', () => {
		const m = make();
		m.sync(snap(0, vessel(1, stack())));
		const upper = vessel(1, stack().slice(0, 3));
		const lower = vessel(2, stack().slice(3));
		m.sync(snap(0.1, upper, lower));
		m.prepareFrame(1 / 60, true);
		expect(m.effects.particleCount).toBeGreaterThan(3);
		m.dispose();
	});

	test('switching the preset rebuilds the part models with the new detail', () => {
		const m = make('high');
		m.sync(snap(0, vessel(1, stack())));
		const tris = (): number => {
			let n = 0;
			m.scene.traverse((o) => {
				if (o instanceof Mesh && o.parent?.name.startsWith('part:stock.tank')) {
					n += o.geometry.getAttribute('position').count / 3;
				}
			});
			return n;
		};
		const high = tris();
		m.setPreset('low');
		m.sync(snap(0.1, vessel(1, stack())));
		expect(tris()).toBeLessThan(high);
		m.dispose();
	});

	test('dispose frees every geometry and material the vessel and the effects created', () => {
		const m = make();
		const hot = stack(engineOn).map((p) => ({ ...p, temperature: 2200 }));
		m.sync(snap(0, vessel(1, hot)));
		m.sync(snap(0.1, vessel(1, hot.slice(0, 3), 20, -40)));
		for (let i = 0; i < 30; i++) m.prepareFrame(1 / 60, true);
		const seen = new Set<BufferGeometry | Material>();
		const walk = (root: Object3D) =>
			root.traverse((o) => {
				if (!(o instanceof Mesh) && o.type !== 'Points') return;
				const mesh = o as Mesh;
				seen.add(mesh.geometry);
				for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
					seen.add(mat);
			});
		for (const c of m.scene.children) if (c.type === 'Group' || c.name === 'effects') walk(c);
		expect(seen.size).toBeGreaterThan(10);
		const freed = new Set<unknown>();
		for (const r of seen) r.addEventListener('dispose', () => freed.add(r));
		m.dispose();
		const leaked = [...seen].filter((r) => !freed.has(r));
		expect(leaked.length).toBe(0);
	});
});

describe('camera after the active vessel is destroyed', () => {
	test('stays at the wreck for a few seconds instead of jumping to the planet centre', () => {
		const m = make();
		m.setActiveVessel(id(1));
		m.sync(snap(0, vessel(1, stack(), 2)));
		m.prepareFrame(1 / 60);
		const before = m.camera.position.clone();
		m.sync(snap(0.01, vessel(2, [part(9, 'stock.tank-small', 0)], 300)));
		m.prepareFrame(1 / 60);
		expect(m.camera.position.distanceTo(before)).toBeLessThan(60);
		expect(Math.hypot(m.camera.position.x, m.camera.position.y, m.camera.position.z)).toBeLessThan(
			5_000
		);
		m.sync(snap(10, vessel(2, [part(9, 'stock.tank-small', 0)], 300)));
		expect(m.activeVessel).toBe(id(1));
		m.dispose();
	});
});
