/** Buoyancy (plan 067, ADR 0182): floating, sinking, lakes, impacts on water, splashed. */
import { describe, expect, test } from 'bun:test';
import {
	cachedPlanetMap,
	createBodyTerrainField,
	LEGACY_TERRAIN_SEED,
	sampleMap,
	SEA_LEVEL,
	TERRAIN_MAP_WIDTH,
	terrainShift,
	warpedLatLon,
	WATER_DENSITY,
	type EntityId,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { vesselMass } from './helpers/measure.ts';
import { rapier, stack, twoStage } from './helpers/vessels.ts';

const R = 600_000;
const dirOf = (lat: number, lon: number): Vec3 => ({
	x: Math.cos(lat) * Math.cos(lon),
	y: Math.sin(lat),
	z: -Math.cos(lat) * Math.sin(lon)
});

/** A spot 0.02 rad (12 km) inside open water of the given kind: deep sea or a lake. */
function findWater(kind: 'sea' | 'lake'): { latitude: number; longitude: number } {
	const field = createBodyTerrainField({ radius: R, terrain: { kind: 'hills' } })!;
	const map = cachedPlanetMap(TERRAIN_MAP_WIDTH);
	const elevation = (d: Vec3) =>
		sampleMap(map, ...warpedLatLon(d, R, terrainShift(LEGACY_TERRAIN_SEED)))[0];
	for (let lat = -0.8; lat <= 0.8; lat += 0.01) {
		for (let lon = 0.3; lon < 6; lon += 0.01) {
			const ok = [
				[0, 0],
				[0.002, 0],
				[-0.002, 0],
				[0, 0.002],
				[0, -0.002]
			].every(([a, b]) => {
				const d = dirOf(lat + a!, lon + b!);
				if (!field.waterAt!(d)) return false;
				return kind === 'sea' ? elevation(d) < SEA_LEVEL - 0.03 : elevation(d) >= SEA_LEVEL;
			});
			if (ok) return { latitude: lat, longitude: lon };
		}
	}
	throw new Error(`no ${kind} found`);
}

const make = () =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(16),
		seed: 1,
		terrain: createBodyTerrainField
	});

function load(sim: Sim, parts: string[], placement: unknown): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: parts.length > 0 ? stack('Test', parts, []) : twoStage('stock.tank-medium'),
		placement: placement as never
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}

const vessel = (sim: Sim, id: EntityId): VesselSnapshot | undefined =>
	sim.snapshot().vessels.find((v) => v.id === id);
const altitudeOf = (v: VesselSnapshot) => Math.hypot(v.position.x, v.position.y, v.position.z) - R;

/** Submerged volume of an upright-or-not cylinder part, counted on a grid (independent of the sim). */
function submerged(v: VesselSnapshot, radius: number, height: number): number {
	const p = v.parts[0]!;
	const q = p.orientation;
	const rot = (x: number, y: number, z: number): Vec3 => {
		// q * (x, y, z) * q^-1
		const ix = q.w * x + q.y * z - q.z * y;
		const iy = q.w * y + q.z * x - q.x * z;
		const iz = q.w * z + q.x * y - q.y * x;
		const iw = -q.x * x - q.y * y - q.z * z;
		return {
			x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
			y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
			z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
		};
	};
	const centre = {
		x: v.position.x + p.position.x,
		y: v.position.y + p.position.y,
		z: v.position.z + p.position.z
	};
	const N = 30;
	let wet = 0;
	let total = 0;
	for (let i = 0; i < N; i++)
		for (let j = 0; j < N; j++)
			for (let k = 0; k < N; k++) {
				const x = ((i + 0.5) / N - 0.5) * 2 * radius;
				const z = ((k + 0.5) / N - 0.5) * 2 * radius;
				if (x * x + z * z > radius * radius) continue;
				const y = ((j + 0.5) / N - 0.5) * height;
				const o = rot(x, y, z);
				total++;
				if (Math.hypot(centre.x + o.x, centre.y + o.y, centre.z + o.z) < R) wet++;
			}
	return (wet / total) * Math.PI * radius * radius * height;
}

function settle(sim: Sim, seconds: number): void {
	for (let i = 0; i < seconds / 0.02; i++) sim.step(0.02);
}

describe('floating and sinking (ADR 0182 points 2 to 5)', () => {
	test('a pod floats on the sea at the waterline its density gives; a 17.6 t two-stage rocket sinks', async () => {
		const sea = findWater('sea');
		const sim = await make();
		const pod = load(sim, ['stock.command-pod'], { kind: 'surface', ...sea });
		settle(sim, 30);
		const v = vessel(sim, pod)!;
		const mass = vesselMass(sim, v);
		const expected = mass / WATER_DENSITY;
		expect(Math.abs(submerged(v, 0.625, 1) - expected) / expected).toBeLessThan(0.1);
		expect(altitudeOf(v)).toBeGreaterThan(-1);

		const rocket = load(sim, [], {
			kind: 'surface',
			latitude: sea.latitude + 0.0003,
			longitude: sea.longitude
		});
		const r = vessel(sim, rocket)!;
		expect(vesselMass(sim, r)).toBeGreaterThan(17_000);
		settle(sim, 40);
		expect(altitudeOf(vessel(sim, rocket)!)).toBeLessThan(-20); // on the seabed, 30 m down
		sim.dispose();
	}, 120_000);

	test('the same on a lake', async () => {
		const lake = findWater('lake');
		const sim = await make();
		const pod = load(sim, ['stock.command-pod'], { kind: 'surface', ...lake });
		settle(sim, 30);
		const v = vessel(sim, pod)!;
		const expected = vesselMass(sim, v) / WATER_DENSITY;
		expect(Math.abs(submerged(v, 0.625, 1) - expected) / expected).toBeLessThan(0.1);
		sim.dispose();
	}, 120_000);
});

describe('impacts and splashdown (ADR 0182 points 5 to 7)', () => {
	/** A pod 2 m above the ground at `spot`, upright, falling at `speed`. */
	function drop(sim: Sim, spot: { latitude: number; longitude: number }, speed: number): EntityId {
		const up = dirOf(spot.latitude, spot.longitude);
		// rotation taking +Y to `up`: axis Y x up, angle acos(up.y)
		const axis = { x: up.z, y: 0, z: -up.x };
		const s = Math.hypot(axis.x, axis.z);
		const half = Math.acos(Math.max(-1, Math.min(1, up.y))) / 2;
		const orientation =
			s < 1e-9
				? { x: 0, y: 0, z: 0, w: 1 }
				: {
						x: (axis.x / s) * Math.sin(half),
						y: 0,
						z: (axis.z / s) * Math.sin(half),
						w: Math.cos(half)
					};
		const h = R + 2;
		return load(sim, ['stock.command-pod'], {
			kind: 'state',
			position: { x: up.x * h, y: up.y * h, z: up.z * h },
			velocity: { x: -up.x * speed, y: -up.y * speed, z: -up.z * speed },
			orientation
		});
	}

	test('15 m/s leaves a pod whole on water and breaks it on land; 50 m/s on water damages it', async () => {
		const sea = findWater('sea');
		const sim = await make();
		const damaged: Array<{ vessel: EntityId; outcome: string }> = [];
		sim.events.on('part:damaged', (e) => damaged.push({ vessel: e.vessel, outcome: e.outcome }));
		const soft = drop(sim, sea, 15);
		settle(sim, 2);
		expect(damaged.filter((d) => d.vessel === soft)).toEqual([]);
		const land = drop(sim, { latitude: 0, longitude: 0.0002 }, 15);
		settle(sim, 2);
		expect(damaged.some((d) => d.vessel === land)).toBe(true);
		const hard = drop(sim, { latitude: sea.latitude, longitude: sea.longitude + 0.0005 }, 50);
		settle(sim, 2);
		expect(damaged.some((d) => d.vessel === hard)).toBe(true);
		sim.dispose();
	}, 120_000);

	test('a pod floating at rest is splashed and can be recovered', async () => {
		const sea = findWater('sea');
		const sim = await make();
		const id = load(sim, ['stock.command-pod', 'stock.thermometer'], { kind: 'surface', ...sea });
		let snap = vessel(sim, id)!;
		for (let i = 0; i < 6_000 && !snap.recovery; i++) {
			sim.step(0.02);
			snap = vessel(sim, id)!;
		}
		expect(snap.science!.situation).toBe('stock.splashed');
		expect(snap.recovery).toBeDefined();
		expect(sim.dispatch({ type: 'recover-vessel', vessel: id })).toEqual({ ok: true });
		sim.dispose();
	}, 120_000);
});
