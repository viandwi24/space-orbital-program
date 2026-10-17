/** Plan 040 / ADR 0077: wreckage and stages that stay, through the scene. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot, VesselSnapshot } from '@orbital/core';
import { Mesh } from 'three';
import { MAX_REMNANTS, REMNANT_LIFETIME } from '../src/remnants.ts';
import { PRESETS } from '../src/presets.ts';
import { MAX_WRECKS, WRECK_LIFETIME } from '../src/effects/wreckage.ts';
import { SceneModel } from '../src/scene.ts';
import { stockMaps } from './stock-fixture.ts';

const BODY = 'stock.home' as BodyId;
const R = 600_000;
const OMEGA = (2 * Math.PI) / 21_600;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const maps = stockMaps();
const id = (n: number) => n as EntityId;

const part = (n: number, definition: string, y: number, temperature?: number) => ({
	id: id(n),
	definition: definition as PartId,
	position: { x: 0, y, z: 0 },
	orientation: q0,
	modules: {},
	temperature
});

const stack = (base: number, temperature?: number) => [
	part(base + 1, 'stock.command-pod', 3.1, temperature),
	part(base + 2, 'stock.tank-small', 1.6, temperature),
	part(base + 3, 'stock.decoupler', 0.5, temperature)
];

const vessel = (
	n: number,
	parts: VesselSnapshot['parts'],
	altitude: number,
	extraSpeed = 0,
	lateral = 0
): VesselSnapshot => ({
	id: id(n),
	mode: 'flight',
	soi: BODY,
	position: { x: R + altitude, y: 0, z: lateral },
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

/** A falling stack that vanishes 6 m up at 35 m/s: an impact near the ground. */
function crash(m: SceneModel, at = 0): void {
	m.sync(snap(at, vessel(1, stack(0), 6, -35)));
	m.sync(snap(at + 0.1, vessel(1, stack(0).slice(0, 1), 5, -35)));
}

function run(m: SceneModel, seconds: number, step = 1 / 30): void {
	for (let t = 0; t < seconds; t += step) m.prepareFrame(step, true);
}

const wreckMeshes = (m: SceneModel): Mesh[] =>
	(m.effects.wrecks.root.children as Mesh[]).filter((c) => c.name === 'wreck');

describe('wreckage through the scene', () => {
	test('after an impact the pieces land and the wreck stays 120 s later, the explosion is gone', () => {
		const m = make();
		crash(m);
		m.prepareFrame(1 / 60, true);
		expect(m.effects.explosionCount).toBe(1);
		expect(m.effects.wrecks.wrecks.length).toBe(1);
		const pieces = m.effects.wrecks.pieceCount;
		expect(pieces).toBeGreaterThan(10);
		expect(pieces).toBeLessThanOrEqual(PRESETS.high.debrisShards);
		run(m, 6);
		expect(m.effects.explosionCount).toBe(0);
		expect(wreckMeshes(m).length).toBe(1);
		run(m, 120, 1);
		expect(m.effects.explosionCount).toBe(0);
		expect(m.effects.wrecks.wrecks.length).toBe(1);
		const mesh = wreckMeshes(m)[0]!;
		expect(mesh.visible).toBe(true);
		expect(mesh.geometry.getAttribute('position').count).toBe(pieces * 24);
		m.dispose();
	});

	test('the wreck rests on the ground, near where the vessel hit, and turns with the body', () => {
		const m = make();
		crash(m);
		run(m, 8);
		const mesh = wreckMeshes(m)[0]!;
		// within the throw of the pieces (14 m/s for under 5 s), near the vessel (render space is origin shifted)
		expect(Math.hypot(mesh.position.x, mesh.position.y, mesh.position.z)).toBeLessThan(200);
		const before = mesh.quaternion.clone();
		m.sync(snap(1000, vessel(2, stack(10), 100)));
		m.prepareFrame(1 / 60, true);
		expect(mesh.quaternion.equals(before)).toBe(false);
		m.dispose();
	});

	test('paused time (dt = 0) does not age the wreck', () => {
		const m = make();
		crash(m);
		run(m, 8);
		const age = m.effects.wrecks.wrecks[0]!.age;
		for (let i = 0; i < 30; i++) m.prepareFrame(1 / 60, false);
		expect(m.effects.wrecks.wrecks[0]!.age).toBe(age);
		m.dispose();
	});

	test('it sinks and goes after the lifetime', () => {
		const m = make();
		crash(m);
		run(m, 8);
		run(m, WRECK_LIFETIME, 10);
		expect(m.effects.wrecks.wrecks.length).toBe(0);
		expect(wreckMeshes(m).length).toBe(0);
		m.dispose();
	});

	test('the ninth wreck takes the first one’s place', () => {
		const m = make();
		for (let i = 0; i < MAX_WRECKS + 1; i++) {
			crash(m, i * 20);
			run(m, 6);
		}
		expect(m.effects.wrecks.wrecks.length).toBe(MAX_WRECKS);
		expect(wreckMeshes(m).length).toBe(MAX_WRECKS);
		m.dispose();
	});

	test('low keeps no pieces (it throws none); a hot part burning up leaves nothing', () => {
		const low = make('low');
		crash(low);
		run(low, 8);
		expect(low.effects.wrecks.wrecks.length).toBe(0);
		const burn = make();
		burn.sync(snap(0, vessel(1, stack(0, 900), 6, -35)));
		burn.sync(snap(0.1, vessel(1, stack(0, 900).slice(0, 1), 5, -35)));
		run(burn, 8);
		expect(burn.effects.wrecks.wrecks.length).toBe(0);
		low.dispose();
		burn.dispose();
	});

	test('a time jump backwards clears them', () => {
		const m = make();
		crash(m, 100);
		run(m, 8);
		expect(m.effects.wrecks.wrecks.length).toBe(1);
		m.sync(snap(0, vessel(5, stack(20), 100)));
		expect(m.effects.wrecks.wrecks.length).toBe(0);
		m.dispose();
	});

	test('a wreck far above the ground (a vessel lost at altitude) is not kept', () => {
		const m = make();
		m.sync(snap(0, vessel(1, stack(0), 5_000, -300)));
		m.sync(snap(0.1, vessel(1, stack(0).slice(0, 1), 4_970, -300)));
		run(m, 8);
		expect(m.effects.wrecks.wrecks.length).toBe(0);
		m.dispose();
	});
});

describe('stages that stay (remnants)', () => {
	/** Vessel 1 lies still for `seconds`, then is gone; vessel 2 is the active one far above. */
	function lieAndVanish(m: SceneModel, n: number, seconds: number, t0 = 0, extra = {}): number {
		m.setActiveVessel(id(99));
		let t = t0;
		for (; t < t0 + seconds; t += 1) {
			m.sync(
				snap(
					t,
					vessel(n, stack(n * 10, (extra as { temperature?: number }).temperature), 2),
					vessel(99, stack(990), 3_000)
				)
			);
		}
		m.sync(snap(t, vessel(99, stack(990), 3_000)));
		return t;
	}

	test('a stage that lay still for 10 s and then vanished stays, frozen to the ground', () => {
		const m = make();
		lieAndVanish(m, 1, 11);
		expect(m.remnantCount).toBe(1);
		const group = m.scene.children.find(
			(c) => c.type === 'Group' && c.children.some((k) => k.name === 'part:stock.tank-small')
		)!;
		expect(group).toBeDefined();
		expect(group.visible).toBe(true);
		m.dispose();
	});

	test('one that vanishes after only a moment, in flight, hot or as the active vessel does not', () => {
		const brief = make();
		lieAndVanish(brief, 1, 4);
		expect(brief.remnantCount).toBe(0);
		const hot = make();
		lieAndVanish(hot, 1, 11, 0, { temperature: 900 });
		expect(hot.remnantCount).toBe(0);
		const moving = make();
		moving.setActiveVessel(id(99));
		for (let t = 0; t < 11; t++) {
			moving.sync(snap(t, vessel(1, stack(10), 2, 5), vessel(99, stack(990), 3_000)));
		}
		moving.sync(snap(11, vessel(99, stack(990), 3_000)));
		expect(moving.remnantCount).toBe(0);
		const active = make();
		for (let t = 0; t < 11; t++) active.sync(snap(t, vessel(1, stack(10), 2)));
		active.sync(snap(11, vessel(2, stack(30), 3_000)));
		expect(active.remnantCount).toBe(0);
		for (const m of [brief, hot, moving, active]) m.dispose();
	});

	test('a stage high above the ground does not stay', () => {
		const m = make();
		m.setActiveVessel(id(99));
		for (let t = 0; t < 11; t++) {
			m.sync(snap(t, vessel(1, stack(10), 500), vessel(99, stack(990), 3_000)));
		}
		m.sync(snap(11, vessel(99, stack(990), 3_000)));
		expect(m.remnantCount).toBe(0);
		m.dispose();
	});

	test('the fourth evicts the first, and they go after their lifetime', () => {
		const m = make();
		let t = 0;
		for (let n = 1; n <= MAX_REMNANTS + 1; n++) t = lieAndVanish(m, n, 11, t + 1);
		expect(m.remnantCount).toBe(MAX_REMNANTS);
		for (let k = 1; k <= REMNANT_LIFETIME / 30 - 2; k++) {
			m.sync(snap(t + k * 30, vessel(99, stack(990), 3_000)));
		}
		expect(m.remnantCount).toBe(MAX_REMNANTS);
		for (let k = 0; k < 8; k++)
			m.sync(snap(t + REMNANT_LIFETIME + k * 30, vessel(99, stack(990), 3_000)));
		expect(m.remnantCount).toBe(0);
		m.dispose();
	});

	test('a time jump backwards clears them', () => {
		const m = make();
		const t = lieAndVanish(m, 1, 11, 500);
		expect(m.remnantCount).toBe(1);
		m.sync(snap(t - 400, vessel(99, stack(990), 3_000)));
		expect(m.remnantCount).toBe(0);
		m.dispose();
	});
});
