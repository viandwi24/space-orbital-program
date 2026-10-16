import { describe, expect, test } from 'bun:test';
import {
	add,
	burnComponents,
	burnVector,
	cross,
	dot,
	fromStateVector,
	length,
	orbitalAxes,
	patchedStateAt,
	predictWithManeuvers,
	propagateUniversal,
	scale,
	sub,
	type PatchedBody
} from '../src/index.ts';
import { MU_EARTH } from './helpers.ts';

const R0 = 6_578_000;
const earth: PatchedBody[] = [{ id: 'earth', mu: MU_EARTH, soi: Infinity, radius: 6_378_000 }];
const circular = () => {
	const r = { x: R0, y: 0, z: 0 };
	const v = { x: 0, y: 0, z: -Math.sqrt(MU_EARTH / R0) };
	return { body: 'earth', r, v, t: 0 };
};

describe('orbital axes', () => {
	test('are orthonormal and right-handed: prograde x normal = radial', () => {
		const r = { x: 6.8e6, y: 1.2e6, z: -0.5e6 };
		const v = { x: 800, y: 6900, z: -2100 };
		const a = orbitalAxes(r, v);
		for (const k of ['prograde', 'normal', 'radial'] as const) {
			expect(Math.abs(length(a[k]) - 1)).toBeLessThan(1e-12);
		}
		expect(Math.abs(dot(a.prograde, a.normal))).toBeLessThan(1e-12);
		expect(Math.abs(dot(a.prograde, a.radial))).toBeLessThan(1e-12);
		expect(Math.abs(dot(a.normal, a.radial))).toBeLessThan(1e-12);
		expect(length(sub(cross(a.prograde, a.normal), a.radial))).toBeLessThan(1e-12);
		// normal is r x v; radial points away from the body for a bound orbit
		expect(dot(a.normal, cross(r, v))).toBeGreaterThan(0);
		expect(dot(a.radial, r)).toBeGreaterThan(0);
	});

	test('components round trip through the vector', () => {
		const a = orbitalAxes({ x: 7e6, y: 0, z: 0 }, { x: 10, y: 7500, z: 20 });
		const c = burnComponents(a, burnVector(a, { prograde: 12, normal: -3, radial: 7 }));
		expect(c.prograde).toBeCloseTo(12, 9);
		expect(c.normal).toBeCloseTo(-3, 9);
		expect(c.radial).toBeCloseTo(7, 9);
	});
});

describe('predictWithManeuvers', () => {
	test('a prograde node gives the vis-viva apoapsis and the position of an impulsive burn', () => {
		const start = circular();
		const tNode = 1_200;
		const dvp = 300;
		const out = predictWithManeuvers(
			earth,
			start,
			[{ id: 1, time: tNode, prograde: dvp, normal: 0, radial: 0 }],
			tNode + 3_600
		);
		expect(out.unreachable).toEqual([]);
		const node = out.nodes[0]!;
		const pre = propagateUniversal(start.r, start.v, MU_EARTH, tNode);
		expect(length(sub(node.pre.r, pre.r))).toBeLessThan(1e-3);
		// vis-viva: the burn point is the periapsis of the new orbit
		const rNode = length(pre.r);
		const v1 = length(pre.v) + dvp;
		const a = 1 / (2 / rNode - (v1 * v1) / MU_EARTH);
		const apoapsis = 2 * a - rNode;
		const el = fromStateVector(node.post.r, node.post.v, MU_EARTH, tNode);
		expect(Math.abs(el.a * (1 + el.e) - apoapsis) / apoapsis).toBeLessThan(1e-6);
		// the position one hour later against propagating the hand-added state
		const hand = propagateUniversal(
			pre.r,
			add(pre.v, scale(orbitalAxes(pre.r, pre.v).prograde, dvp)),
			MU_EARTH,
			3_600
		);
		const last = out.segments.at(-1)!;
		expect(length(sub(last.exit.r, hand.r))).toBeLessThan(1e-3);
		expect(out.segments.length).toBe(2);
		expect(out.segments[0]!.t1).toBeCloseTo(tNode, 6);
		expect(out.segments[1]!.t0).toBeCloseTo(tNode, 6);
	});

	test('a target replaces the components: the burn is target minus pre-burn velocity', () => {
		const start = circular();
		const tNode = 900;
		const pre = propagateUniversal(start.r, start.v, MU_EARTH, tNode);
		const target = add(pre.v, { x: 11, y: -4, z: 23 });
		const out = predictWithManeuvers(
			earth,
			start,
			[
				{
					id: 2,
					time: tNode,
					prograde: 999,
					normal: 999,
					radial: 999,
					target: { body: 'earth', v: target }
				}
			],
			tNode + 10
		);
		const n = out.nodes[0]!;
		expect(length(sub(n.post.v, target))).toBeLessThan(1e-9);
		expect(length(sub(n.burn, { x: 11, y: -4, z: 23 }))).toBeLessThan(1e-9);
		expect(n.magnitude).toBeCloseTo(Math.hypot(11, 4, 23), 9);
		// a target in another body is ignored
		const other = predictWithManeuvers(
			earth,
			start,
			[
				{
					id: 2,
					time: tNode,
					prograde: 5,
					normal: 0,
					radial: 0,
					target: { body: 'moon', v: target }
				}
			],
			tNode + 10
		);
		expect(other.nodes[0]!.dv.prograde).toBeCloseTo(5, 9);
	});

	test('a node in the past is reported from the backward conic and changes nothing', () => {
		const start = { ...circular(), t: 2_000 };
		const out = predictWithManeuvers(
			earth,
			start,
			[{ id: 3, time: 1_500, prograde: 10, normal: 0, radial: 0 }],
			500
		);
		expect(out.nodes[0]!.segment).toBe(-1);
		expect(out.segments).toHaveLength(1);
		expect(length(sub(out.segments[0]!.entry.v, start.v))).toBe(0);
		const back = propagateUniversal(start.r, start.v, MU_EARTH, -500);
		expect(length(sub(out.nodes[0]!.pre.r, back.r))).toBeLessThan(1e-3);
	});

	test('a node the path never reaches (it hits the ground first) is unreachable, not an error', () => {
		const r = { x: 6_600_000, y: 0, z: 0 };
		const v = { x: 0, y: 0, z: -1_500 };
		const out = predictWithManeuvers(
			earth,
			{ body: 'earth', r, v, t: 0 },
			[{ id: 4, time: 5_000, prograde: 10, normal: 0, radial: 0 }],
			6_000
		);
		expect(out.unreachable).toEqual([4]);
		expect(out.nodes).toEqual([]);
		expect(out.segments.at(-1)!.end).toBe('impact');
	});

	test('two nodes chain: the second burns from the orbit the first made', () => {
		const start = circular();
		const out = predictWithManeuvers(
			earth,
			start,
			[
				{ id: 2, time: 3_000, prograde: 100, normal: 0, radial: 0 },
				{ id: 1, time: 1_000, prograde: 200, normal: 0, radial: 0 }
			],
			4_000
		);
		expect(out.nodes.map((n) => n.id)).toEqual([1, 2]);
		const first = out.nodes[0]!;
		const mid = propagateUniversal(first.post.r, first.post.v, MU_EARTH, 2_000);
		expect(length(sub(out.nodes[1]!.pre.r, mid.r))).toBeLessThan(1e-3);
		expect(length(sub(out.nodes[1]!.pre.v, mid.v))).toBeLessThan(1e-6);
	});
});

describe('patchedStateAt', () => {
	test('forward equals propagation, backward runs the conic back', () => {
		const s = circular();
		const f = patchedStateAt(earth, s, 1_000)!;
		expect(length(sub(f.r, propagateUniversal(s.r, s.v, MU_EARTH, 1_000).r))).toBeLessThan(1e-3);
		const b = patchedStateAt(earth, { ...s, t: 500 }, 0)!;
		expect(length(sub(b.r, propagateUniversal(s.r, s.v, MU_EARTH, -500).r))).toBeLessThan(1e-3);
	});
});
