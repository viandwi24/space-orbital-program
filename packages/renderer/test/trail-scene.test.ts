/** Plan 040 / ADR 0080: a climbing engine leaves a ribbon, a hovering one at the pad and one in vacuum do not. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot, VesselSnapshot } from '@orbital/core';
import { SceneModel } from '../src/scene.ts';
import { TRAIL_LIFETIME } from '../src/effects/trail.ts';
import { stockMaps } from './stock-fixture.ts';

const BODY = 'stock.home' as BodyId;
const R = 600_000;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const maps = stockMaps();
const engineOn = { 'stock.engine': { ignited: true, throttle: 1, flameout: false } };

const stack = (modules: Record<string, unknown>) =>
	[
		['stock.command-pod', 3.1],
		['stock.tank-small', 1.6],
		['stock.decoupler', 0.5],
		['stock.engine-lv', -0.2]
	].map(([definition, y], i) => ({
		id: (i + 1) as EntityId,
		definition: definition as PartId,
		position: { x: 0, y: y as number, z: 0 },
		orientation: q0,
		modules: definition === 'stock.engine-lv' ? modules : {}
	}));

const at = (t: number, altitude: number, modules: Record<string, unknown>): Snapshot => ({
	t,
	bodies: [{ id: BODY, position: { x: 0, y: 0, z: 0 }, rotation: q0 }],
	vessels: [
		{
			id: 1 as EntityId,
			mode: 'flight',
			soi: BODY,
			position: { x: R + altitude, y: 0, z: 0 },
			velocity: { x: 150, y: 0, z: 0 },
			orientation: q0,
			parts: stack(modules)
		} as VesselSnapshot
	]
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

/** Climbs from `from` at 150 m/s for `seconds`. */
function climb(m: SceneModel, from: number, seconds: number, modules = engineOn): void {
	for (let s = 0; s < seconds; s += 0.1) {
		m.sync(at(s, from + 150 * s, modules));
		for (let k = 0; k < 6; k++) m.prepareFrame(1 / 60, true);
	}
}

describe('exhaust trail through the scene', () => {
	test('a climbing engine in thick air leaves a ribbon that holds points and draws', () => {
		const m = make();
		m.sync(at(0, 600, engineOn));
		climb(m, 600, 20);
		expect(m.effects.trails.pointCount).toBeGreaterThan(40);
		expect(m.effects.trails.mesh.visible).toBe(true);
		expect(m.effects.trails.mesh.geometry.drawRange.count).toBeGreaterThan(100);
		m.dispose();
	});

	test('after the engine stops the trail stays for its life and then goes', () => {
		const m = make();
		climb(m, 600, 15);
		const points = m.effects.trails.pointCount;
		expect(points).toBeGreaterThan(20);
		const off = { 'stock.engine': { ignited: false, throttle: 0, flameout: false } };
		const seconds = (TRAIL_LIFETIME / 2) | 0;
		for (let s = 0; s < seconds; s++) {
			m.sync(at(20 + s, 3_000, off));
			m.prepareFrame(1, true);
		}
		expect(m.effects.trails.pointCount).toBe(points); // aged, not dropped
		for (let s = 0; s < TRAIL_LIFETIME; s++) {
			m.sync(at(100 + s, 3_000, off));
			m.prepareFrame(1, true);
		}
		expect(m.effects.trails.pointCount).toBe(0);
		expect(m.effects.trails.mesh.visible).toBe(false);
		m.dispose();
	});

	test('none in thin air, none at the pad', () => {
		const high = make();
		climb(high, 60_000, 10);
		expect(high.effects.trails.pointCount).toBe(0);
		const pad = make();
		for (let s = 0; s < 3; s += 0.1) {
			pad.sync(at(s, 5, engineOn));
			for (let k = 0; k < 6; k++) pad.prepareFrame(1 / 60, true);
		}
		expect(pad.effects.trails.pointCount).toBe(0);
		high.dispose();
		pad.dispose();
	});

	test('several engines on one vessel feed one trail, wider than a single engine makes', () => {
		const m = make();
		const two = (t: number, altitude: number): Snapshot => {
			const s = at(t, altitude, engineOn);
			const v = s.vessels[0]!;
			const extra = {
				id: 9 as EntityId,
				definition: 'stock.engine-lv' as PartId,
				position: { x: 2.5, y: -0.2, z: 0 },
				orientation: q0,
				modules: engineOn
			};
			return { ...s, vessels: [{ ...v, parts: [...v.parts, extra] }] };
		};
		for (let s = 0; s < 8; s += 0.1) {
			m.sync(two(s, 600 + 150 * s));
			for (let k = 0; k < 6; k++) m.prepareFrame(1 / 60, true);
		}
		expect(m.effects.trails.trails.size).toBe(1);
		const wide = m.effects.trails.trails.values().next().value!;
		const single = make();
		climb(single, 600, 8);
		const one = single.effects.trails.trails.values().next().value!;
		expect(wide.w0[0]!).toBeGreaterThan(one.w0[0]! + 2);
		m.dispose();
		single.dispose();
	});

	test('the ribbon stays inside its fixed buffers on every preset', () => {
		for (const preset of ['low', 'medium', 'high'] as const) {
			const m = make(preset);
			climb(m, 600, 30);
			expect(m.effects.trails.pointCount).toBeLessThanOrEqual(4 * 256);
			m.dispose();
		}
	});
});
