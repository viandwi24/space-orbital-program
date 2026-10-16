import {
	GRAVITATIONAL_CONSTANT,
	type BodyDefinition,
	type EntityId,
	type Snapshot
} from '@orbital/core';
import { propagate } from '@orbital/kepler';
import { describe, expect, it } from 'vitest';
import { bodyNodes, predictManeuvers, predictMapPath, predictionHorizon } from './map-path';

const HOME_MU = 3.5316e12;
const home = {
	id: 'stock.home',
	mass: HOME_MU / GRAVITATIONAL_CONSTANT,
	radius: 600_000,
	rotationPeriod: 21_600
} as unknown as BodyDefinition;
const moon = {
	id: 'stock.cinder',
	mass: 5.776e10 / GRAVITATIONAL_CONSTANT,
	radius: 190_000,
	rotationPeriod: 135_524,
	parent: 'stock.home',
	orbit: { a: 11.8e6, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
} as unknown as BodyDefinition;
const nodes = bodyNodes([home, moon]);

const q0 = { x: 0, y: 0, z: 0, w: 1 };
const snapshotOf = (
	position: { x: number; y: number; z: number },
	velocity: { x: number; y: number; z: number },
	soi = 'stock.home'
): Snapshot =>
	({
		t: 0,
		bodies: [],
		vessels: [
			{ id: 1 as EntityId, mode: 'on-rails', soi, position, velocity, orientation: q0, parts: [] }
		]
	}) as unknown as Snapshot;

describe('predicted map path', () => {
	it('derives the sphere of influence of the moon from the masses', () => {
		const m = nodes.find((n) => n.id === 'stock.cinder')!;
		expect(m.soi).toBeGreaterThan(2.2e6);
		expect(m.soi).toBeLessThan(2.4e6);
		expect(nodes.find((n) => n.id === 'stock.home')!.soi).toBe(Number.POSITIVE_INFINITY);
	});

	it('a low circular orbit has no path to draw (its own orbit line shows it)', () => {
		const path = predictMapPath(
			snapshotOf({ x: 680_000, y: 0, z: 0 }, { x: 0, y: 0, z: -2_276 }),
			1,
			nodes,
			20_000
		);
		expect(path).toEqual([]);
	});

	it('a transfer to the moon gives a home stretch, a moon stretch at the moon, and the way out', () => {
		// transfer orbit apoapsis at the moon's radius plus 800 km, arrival timed for the moon
		const rm = 11.8e6 + 800_000;
		const a = (680_000 + rm) / 2;
		const flight = Math.PI * Math.sqrt((a * a * a) / HOME_MU);
		const n = Math.sqrt(HOME_MU / 11.8e6 ** 3);
		const periapsisAngle = 1 + n * flight - Math.PI;
		const state = propagate(
			{
				a,
				e: (rm - 680_000) / (rm + 680_000),
				i: 0,
				raan: 0,
				argp: periapsisAngle,
				m0: 0,
				epoch: 0
			},
			HOME_MU,
			0
		);
		const path = predictMapPath(snapshotOf(state.r, state.v), 1, nodes, 60_000);
		expect(path.map((p) => p.body)).toEqual(['stock.home', 'stock.cinder', 'stock.home']);
		// the moon stretch hangs where the moon is when the vessel gets there
		const moonAtEntry = propagate(moon.orbit!, HOME_MU, path[1]!.t0).r;
		expect(path[1]!.offset.x).toBeCloseTo(moonAtEntry.x, 3);
		expect(path[1]!.periapsis).toBeGreaterThan(190_000);
		// each stretch starts where the last ended (system frame, within the patch tolerance)
		const end0 = path[0]!.points.at(-1)!;
		const start1 = {
			x: path[1]!.offset.x + path[1]!.points[0]!.x,
			y: path[1]!.offset.y + path[1]!.points[0]!.y,
			z: path[1]!.offset.z + path[1]!.points[0]!.z
		};
		expect(Math.hypot(end0.x - start1.x, end0.y - start1.y, end0.z - start1.z)).toBeLessThan(5);
		expect(path[0]!.points).toHaveLength(161);
	});

	it('a vessel on the ground has no path', () => {
		const s = snapshotOf({ x: 600_000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
		(s.vessels[0] as { surface?: boolean }).surface = true;
		expect(predictMapPath(s, 1, nodes, 1_000)).toEqual([]);
	});

	it('a low orbit still looks six thousand seconds ahead', () => {
		expect(
			predictionHorizon({ a: 680_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }, HOME_MU)
		).toBe(6_000);
	});

	it('the look-ahead is 1.5 periods of a bound orbit and days for an escape', () => {
		expect(
			predictionHorizon({ a: 5_000_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }, HOME_MU)
		).toBeCloseTo(1.5 * 2 * Math.PI * Math.sqrt(5_000_000 ** 3 / HOME_MU), 3);
		expect(
			predictionHorizon({ a: -1e6, e: 1.5, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }, HOME_MU)
		).toBe(3 * 86_400);
		expect(predictionHorizon(undefined, HOME_MU)).toBe(3 * 86_400);
	});
});

describe('predicted path with maneuver nodes (plan 045)', () => {
	const R = 700_000;
	const v = Math.sqrt(HOME_MU / R);
	const circular = snapshotOf({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: -v });

	it('a single orbit is returned, the stretch after the node is planned, and the node sits on the path', () => {
		const out = predictManeuvers(
			circular,
			1,
			nodes,
			[{ id: 7, time: 600, prograde: 300, normal: 0, radial: 0 }],
			6_000
		);
		expect(out.unreachable).toEqual([]);
		expect(out.paths.length).toBeGreaterThanOrEqual(2);
		expect(out.paths[0]!.planned).toBeUndefined();
		expect(out.paths[0]!.t1).toBeCloseTo(600, 6);
		expect(out.paths[1]!.planned).toBe(true);
		expect(out.paths[1]!.t0).toBeCloseTo(600, 6);
		const node = out.nodes[0]!;
		expect(node.id).toBe(7);
		expect(node.path).toBe(0);
		// the node is where the first stretch ends
		const end = out.paths[0]!.points.at(-1)!;
		expect(node.world.x).toBeCloseTo(end.x, 3);
		expect(node.world.z).toBeCloseTo(end.z, 3);
		expect(node.speed).toBeCloseTo(v, 6);
		// prograde axis is the velocity direction, so the post-burn orbit leaves the circle
		const after = out.paths[1]!.points.at(-1)!;
		expect(Math.hypot(after.x, after.z)).toBeGreaterThan(R);
	});

	it('no nodes, a vessel on the ground, or a node the path never reaches', () => {
		expect(predictManeuvers(circular, 1, nodes, [], 6_000)).toEqual({
			paths: [],
			nodes: [],
			unreachable: []
		});
		const falling = snapshotOf({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: -1_000 });
		const out = predictManeuvers(
			falling,
			1,
			nodes,
			[{ id: 1, time: 5_000, prograde: 10, normal: 0, radial: 0 }],
			6_000
		);
		expect(out.unreachable).toEqual([1]);
		expect(out.nodes).toEqual([]);
	});

	it('keepSingle returns the path of an orbit that never leaves its sphere', () => {
		expect(predictMapPath(circular, 1, nodes, 6_000)).toEqual([]);
		const single = predictMapPath(circular, 1, nodes, 6_000, true);
		expect(single).toHaveLength(1);
		expect(single[0]!.points).toHaveLength(161);
	});

	it('a node whose time has passed keeps its marker where it was and draws the burn that is left as finished now', () => {
		const later = { ...circular, t: 1_000 } as unknown as Snapshot;
		const out = predictManeuvers(
			later,
			1,
			nodes,
			[{ id: 3, time: 900, prograde: 100, normal: 0, radial: 0 }],
			6_000
		);
		expect(out.nodes).toHaveLength(1);
		expect(out.nodes[0]!.path).toBe(-1);
		expect(out.paths.length).toBeGreaterThanOrEqual(2);
		expect(out.paths[1]!.planned).toBe(true);
		expect(out.paths[1]!.t0).toBeCloseTo(1_000.5, 6);
		// the marker is on the old orbit 100 s before now, not at the vessel
		const at = out.nodes[0]!.world;
		expect(Math.hypot(at.x, at.z)).toBeCloseTo(R, 3);
		expect(Math.hypot(at.x - R, at.z)).toBeGreaterThan(1_000);
	});
});
