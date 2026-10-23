/**
 * The Sol pack in the sim (plan 124, ADR 0184): system selection, the home, the rescaled
 * invariants, and the sky on known dates against JPL Horizons (docs/research/ephemerides.md).
 */
import { describe, expect, test } from 'bun:test';
import {
	GRAVITATIONAL_CONSTANT,
	LEGACY_SITE,
	legacyWorldInfo,
	type Snapshot,
	type WorldInfo
} from '@orbital/core';
import Sol, { RESCALE, SolEarth, SolMoon } from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { rapier } from './helpers/vessels.ts';

const DEG = Math.PI / 180;

const solWorld = (variant: string, day = 9_575): WorldInfo => ({
	...legacyWorldInfo(7),
	id: '3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f',
	systemId: 'sol',
	systemVersion: '0.1.0',
	variant,
	epoch: { day, fraction: 0 }
});
const make = (world: WorldInfo) =>
	createSim({ plugins: [Stock, Sol], backendFactory: rapier(16), seed: 7, world });

type Q = { x: number; y: number; z: number; w: number };
const rotate = (q: Q, v: { x: number; y: number; z: number }) => {
	const cx = q.y * v.z - q.z * v.y;
	const cy = q.z * v.x - q.x * v.z;
	const cz = q.x * v.y - q.y * v.x;
	return {
		x: v.x + 2 * (q.w * cx + q.y * cz - q.z * cy),
		y: v.y + 2 * (q.w * cy + q.z * cx - q.x * cz),
		z: v.z + 2 * (q.w * cz + q.x * cy - q.y * cx)
	};
};
const sub = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
	x: a.x - b.x,
	y: a.y - b.y,
	z: a.z - b.z
});
const unit = (a: { x: number; y: number; z: number }) => {
	const n = Math.hypot(a.x, a.y, a.z);
	return { x: a.x / n, y: a.y / n, z: a.z / n };
};
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
	a.x * b.x + a.y * b.y + a.z * b.z;
const body = (s: Snapshot, id: string) => s.bodies.find((b) => String(b.id) === id)!;

describe('system selection (ADR 0184 points 1 and 2)', () => {
	test('a stock world never sees Sol; a Sol world sees only Sol and starts on the Earth', async () => {
		const stock = await createSim({ plugins: [Stock, Sol], backendFactory: rapier(16), seed: 1 });
		const ids = stock.registries.bodies.list().map((b) => b.id);
		expect(ids.some((id) => id.startsWith('sol.'))).toBe(false);
		expect(ids).toContain('stock.home');
		stock.dispose();

		const sol: Sim = await make(solWorld('1:1'));
		expect(sol.registries.bodies.list().every((b) => b.id.startsWith('sol.'))).toBe(true);
		expect(sol.home).toBe('sol.earth');
		const r = sol.dispatch({
			type: 'load-vessel',
			design: {
				formatVersion: 1,
				name: 'Pod',
				parts: [{ index: 0, part: 'stock.command-pod' as never, parent: null }],
				stages: []
			},
			placement: { kind: 'surface' }
		});
		expect(r.ok).toBe(true);
		expect(String(sol.snapshot().vessels[0]!.soi)).toBe('sol.earth');
		sol.dispose();
	});

	test('rescaled keeps surface gravity and the Moon month, with the Earth a quarter the size', async () => {
		const sim = await make(solWorld('rescaled'));
		const earth = sim.registries.bodies.get('sol.earth')!;
		const moon = sim.registries.bodies.get('sol.moon')!;
		expect(earth.radius / SolEarth.radius).toBeCloseTo(RESCALE, 12);
		const g = (b: { mass: number; radius: number }) =>
			(GRAVITATIONAL_CONSTANT * b.mass) / b.radius ** 2;
		expect(g(earth) / g(SolEarth)).toBeCloseTo(1, 12);
		const month = (e: { mass: number }, m: typeof moon) =>
			2 * Math.PI * Math.sqrt(m.orbit!.a ** 3 / (GRAVITATIONAL_CONSTANT * e.mass));
		expect(month(earth, moon) / month(SolEarth, SolMoon)).toBeCloseTo(1, 9);
		expect(sim.registries.bodies.get('sol.earth')!.atmosphere!.height).toBe(50_000);
		sim.dispose();
	});
});

describe('the sky on known dates (ADR 0184 point 4)', () => {
	/** Horizons: Sun apparent declination and Moon S-O-T elongation, 12:00 TT. */
	const DATES: Array<{ day: number; sunDec: number; moonElongation: number }> = [
		{ day: 9_575, sunDec: -0.045804649, moonElongation: 19.2538 }, // 2026-03-20
		{ day: 9_668, sunDec: 23.437852159, moonElongation: 85.0676 } // 2026-06-21
	];
	for (const variant of ['1:1', 'rescaled']) {
		test(`${variant}: the Sun's declination within 0.2° and the Moon's elongation within 0.5°`, async () => {
			for (const date of DATES) {
				const sim = await make(solWorld(variant, date.day));
				const s = sim.snapshot();
				const earth = body(s, 'sol.earth');
				const pole = rotate(earth.rotation as Q, { x: 0, y: 1, z: 0 });
				const toSun = unit(sub(body(s, 'sol.sun').position, earth.position));
				const toMoon = unit(sub(body(s, 'sol.moon').position, earth.position));
				const dec = Math.asin(dot(toSun, pole)) / DEG;
				const elongation = Math.acos(dot(toSun, toMoon)) / DEG;
				expect(Math.abs(dec - date.sunDec)).toBeLessThan(0.2);
				expect(Math.abs(elongation - date.moonElongation)).toBeLessThan(0.5);
				sim.dispose();
			}
		});
	}
});

describe('the Space Center on a tilted, phased Earth (system audit)', () => {
	test("the comms station stands where the vessel on the Space Center's pad stands", async () => {
		// Create World puts a Sol world's site on the Earth; the Earth has IAU pole and start angle
		const hq = {
			...structuredClone(LEGACY_SITE),
			id: 'space-center',
			body: 'sol.earth',
			latitude: 28.5 * DEG,
			longitude: -80.6 * DEG
		};
		const sim = await make({ ...solWorld('1:1'), sites: [hq] });
		sim.dispatch({ type: 'set-rule', rule: 'stock.comms', value: true });
		const r = sim.dispatch({
			type: 'load-vessel',
			design: {
				formatVersion: 1,
				name: 'Pod',
				parts: [{ index: 0, part: 'stock.command-pod' as never, parent: null }],
				stages: []
			}
		});
		expect(r.ok).toBe(true);
		for (let i = 0; i < 5; i++) sim.step(0.02);
		const snap = sim.snapshot();
		const vessel = snap.vessels[0]!;
		expect(String(vessel.soi)).toBe('sol.earth');
		const station = snap.network!.stations.find((s) => s.id === 'site:space-center')!;
		const atStation = sub(station.position, body(snap, 'sol.earth').position);
		// the mast stands a few tens of metres over the pad; a wrong turn of the Earth is ~1000 km off
		expect(Math.hypot(...Object.values(sub(atStation, vessel.position)))).toBeLessThan(200);
		sim.dispose();
	});
});
