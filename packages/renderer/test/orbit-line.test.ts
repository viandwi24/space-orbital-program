import { describe, expect, test } from 'bun:test';
import type { Vec3 } from '@orbital/core';
import { sampleOrbit, type OrbitalElements } from '../src/orbit-line.ts';

const len = (p: Vec3): number => Math.hypot(p.x, p.y, p.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});

const el = (o: Partial<OrbitalElements>): OrbitalElements => ({
	a: 7_000_000,
	e: 0,
	i: 0,
	raan: 0,
	argp: 0,
	m0: 0,
	epoch: 0,
	...o
});

describe('sampleOrbit', () => {
	test('circular orbit: constant radius within 1e-6 m', () => {
		for (const i of [0, 0.4, 1.2, Math.PI / 2, 2.5, Math.PI]) {
			const pts = sampleOrbit(el({ i, raan: 0.7, argp: 1.1 }), { segments: 360 });
			expect(pts.length).toBe(361);
			for (const p of pts) expect(Math.abs(len(p) - 7_000_000)).toBeLessThan(1e-6);
		}
	});

	test('elliptic orbit: starts at periapsis, apoapsis opposite, ellipse closes', () => {
		const e = 0.3;
		const pts = sampleOrbit(el({ e, i: 0.9, raan: 2, argp: 0.5 }), { segments: 200 });
		expect(len(pts[0]!)).toBeCloseTo(7_000_000 * (1 - e), 5);
		expect(len(pts[100]!)).toBeCloseTo(7_000_000 * (1 + e), 5);
		expect(dot(pts[0]!, pts[100]!)).toBeLessThan(0);
		expect(pts[200]).toEqual(pts[0]!);
		// every point lies on r = p / (1 + e cos ν) measured from the periapsis direction
		const p = 7_000_000 * (1 - e * e);
		const u = pts[0]!;
		const h = cross(pts[0]!, pts[10]!);
		for (const q of pts) {
			const nu = Math.atan2(dot(cross(u, q), h) / len(h), dot(u, q));
			expect(Math.abs(len(q) - p / (1 + e * Math.cos(nu)))).toBeLessThan(1e-6);
		}
	});

	test('frame: prograde equatorial is counter-clockwise about +Y; retrograde is clockwise', () => {
		const up = (i: number): number => {
			const [p0, p1] = sampleOrbit(el({ i, e: 0.1 }), { segments: 64 }) as [Vec3, Vec3];
			return cross(p0, p1).y;
		};
		expect(up(0)).toBeGreaterThan(0);
		expect(up(Math.PI)).toBeLessThan(0);
	});

	test('frame: orbit normal tilts by i from +Y; raan = π/2 puts the ascending node on −Z', () => {
		const i = 0.5;
		const pts = sampleOrbit(el({ i, raan: Math.PI / 2, e: 0.2 }), { segments: 128 });
		const p0 = pts[0]!;
		// argp = 0, so periapsis lies at the ascending node
		expect(p0.z).toBeLessThan(0);
		expect(Math.abs(p0.x) / len(p0)).toBeLessThan(1e-12);
		expect(Math.abs(p0.y) / len(p0)).toBeLessThan(1e-12);
		const h = cross(p0, pts[10]!);
		expect(h.y / len(h)).toBeCloseTo(Math.cos(i), 12);
		// all points lie in the plane through the origin with that normal
		for (const q of pts) expect(Math.abs(dot(q, h) / len(h))).toBeLessThan(1e-6);
		// raan = 0 puts the node on +X; max |y| is r·sin(i) at argument of latitude 90° (circular)
		const circ = sampleOrbit(el({ i: 0.5, raan: 0 }), { segments: 360 });
		expect(circ[0]!.x).toBeCloseTo(7_000_000, 6);
		expect(Math.max(...circ.map((q) => q.y))).toBeCloseTo(7_000_000 * Math.sin(0.5), 3);
	});

	test('hyperbolic orbit: clipped at maxRadius, symmetric about periapsis, motion direction ordered', () => {
		const a = -4_000_000;
		const e = 1.8;
		const maxRadius = 5e7;
		const pts = sampleOrbit(el({ a, e, i: 0.3, raan: 1, argp: 2 }), { segments: 100, maxRadius });
		expect(pts.length).toBe(101);
		expect(len(pts[0]!)).toBeCloseTo(maxRadius, 3);
		expect(len(pts[100]!)).toBeCloseTo(maxRadius, 3);
		expect(len(pts[50]!)).toBeCloseTo(Math.abs(a) * (e - 1), 5);
		for (const q of pts) expect(len(q)).toBeLessThanOrEqual(maxRadius * (1 + 1e-12));
		const h = cross(pts[49]!, pts[51]!);
		expect(h.y).toBeGreaterThan(0); // i = 0.3 -> prograde
		// conic equation r = p / (1 + e cos ν), p = |a|(e² − 1)
		const p = Math.abs(a) * (e * e - 1);
		const u = pts[50]!;
		for (const q of pts) {
			const nu = Math.atan2(dot(cross(u, q), h) / len(h), dot(u, q));
			expect(Math.abs(len(q) / (p / (1 + e * Math.cos(nu))) - 1)).toBeLessThan(1e-9);
		}
	});

	test('rejects invalid or unsupported elements', () => {
		expect(() => sampleOrbit(el({ a: Number.NaN }))).toThrow(/invalid/);
		expect(() => sampleOrbit(el({ a: 7e6, e: 1.5 }))).toThrow(/invalid/);
		expect(() => sampleOrbit(el({ a: -7e6, e: 0.5 }))).toThrow(/invalid/);
		expect(() => sampleOrbit(el({ a: -7e6, e: 1 + 1e-9 }))).toThrow(/invalid/);
		expect(() => sampleOrbit(el({}), { segments: 1 })).toThrow(/segments/);
		expect(() => sampleOrbit(el({ a: -7e6, e: 2 }), { maxRadius: 1 })).toThrow(/maxRadius/);
	});

	test('does not mutate the elements', () => {
		const frozen = Object.freeze(el({ e: 0.1 }));
		expect(() => sampleOrbit(frozen)).not.toThrow();
	});
});
