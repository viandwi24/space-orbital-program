/**
 * Plan 381 / ADR 0318: the wider stock system is a valid hierarchy. Every body hangs from a
 * registered parent, every sphere of influence holds its body and sits inside its parent's, no two
 * siblings' spheres can touch anywhere along their orbits, and the rings stay clear of the moons.
 */
import { describe, expect, test } from 'bun:test';
import { GRAVITATIONAL_CONSTANT, type BodyDefinition } from '@orbital/core';
import { STOCK_BODIES } from '@orbital/mod-stock';
import { hohmannToTarget, length, soiRadius, sub, toStateVector, type Vec3 } from '@orbital/kepler';

const bodies = STOCK_BODIES as readonly BodyDefinition[];
const byId = new Map(bodies.map((b) => [b.id, b]));
const mu = (b: BodyDefinition): number => b.mass * GRAVITATIONAL_CONSTANT;
const soiOf = (b: BodyDefinition): number =>
	b.orbit && b.parent ? soiRadius(b.orbit.a, b.mass, byId.get(b.parent)!.mass) : Infinity;

/** Points along an orbit, parent-relative, m (positions over one period). */
function ring(b: BodyDefinition, n: number): Vec3[] {
	const parent = byId.get(b.parent!)!;
	const period = 2 * Math.PI * Math.sqrt(b.orbit!.a ** 3 / mu(parent));
	const out: Vec3[] = [];
	for (let k = 0; k < n; k++) out.push(toStateVector(b.orbit!, mu(parent), (k / n) * period).r);
	return out;
}

/** Smallest distance between two orbits' curves (not the bodies), m: a dense sampling. */
function closestCurves(a: BodyDefinition, b: BodyDefinition): number {
	const pa = ring(a, 1_500);
	const pb = ring(b, 1_500);
	let best = Infinity;
	for (const p of pa) for (const q of pb) best = Math.min(best, length(sub(p, q)));
	return best;
}

describe('the stock system (plan 381)', () => {
	test('fifteen bodies under one Sun, every parent registered before its children', () => {
		expect(bodies.length).toBe(15);
		expect(bodies.filter((b) => !b.parent).map((b) => b.id)).toEqual(['stock.sun']);
		const seen = new Set<string>();
		for (const b of bodies) {
			if (b.parent) expect(seen.has(b.parent)).toBe(true);
			seen.add(b.id);
		}
		expect(new Set(bodies.map((b) => b.id)).size).toBe(bodies.length);
	});

	test('every sphere of influence holds its body and a low orbit, and lies inside its parent', () => {
		for (const b of bodies) {
			if (!b.parent || !b.orbit) continue;
			const parent = byId.get(b.parent)!;
			const soi = soiOf(b);
			const air = b.atmosphere?.height ?? 0;
			// a low orbit (above the air, or 5 km up) fits with room to spare
			expect(soi).toBeGreaterThan(1.5 * (b.radius + Math.max(air, 5_000)));
			const apo = b.orbit.a * (1 + b.orbit.e);
			const peri = b.orbit.a * (1 - b.orbit.e);
			if (parent.parent) expect(apo + soi).toBeLessThan(0.6 * soiOf(parent));
			// never inside the parent's air
			expect(peri - soi).toBeGreaterThan(parent.radius + (parent.atmosphere?.height ?? 0));
		}
	});

	test("no two siblings' spheres meet anywhere along their orbits", () => {
		const pairs: string[] = [];
		for (const a of bodies) {
			for (const b of bodies) {
				if (!a.orbit || !b.orbit || a.parent !== b.parent || a.id >= b.id) continue;
				const gap = closestCurves(a, b);
				if (gap < 1.5 * (soiOf(a) + soiOf(b))) pairs.push(`${a.id}–${b.id}: ${gap.toExponential(2)} m`);
			}
		}
		expect(pairs).toEqual([]);
	});

	test('the first transfer window from Home to each planet opens on its design day', () => {
		const sun = byId.get('stock.sun')!;
		const home = byId.get('stock.home')!;
		const DAY = 21_651;
		const design: Record<string, number> = {
			'stock.kiln': 30,
			'stock.vesper': 160,
			'stock.ochre': 45,
			'stock.tempest': 120,
			'stock.glim': 200
		};
		const from = toStateVector(home.orbit!, mu(sun), 0);
		for (const [id, day] of Object.entries(design)) {
			const to = toStateVector(byId.get(id)!.orbit!, mu(sun), 0);
			const plan = hohmannToTarget(from, to, mu(sun), 0, 60)!;
			expect(Math.abs(plan.wait / DAY - day)).toBeLessThan(3);
		}
	});

	test("Tempest's rings stay between its air and its first moon", () => {
		const tempest = byId.get('stock.tempest')!;
		const rings = tempest.appearance!.rings!;
		expect(rings.inner).toBeGreaterThan(tempest.radius + tempest.atmosphere!.height);
		const moons = bodies.filter((b) => b.parent === tempest.id);
		const nearest = Math.min(...moons.map((m) => m.orbit!.a * (1 - m.orbit!.e) - soiOf(m)));
		expect(rings.outer).toBeLessThan(nearest);
	});

	test('the destinations get harder outward: surface gravity, air and orbit in the ranges of the design', () => {
		const g = (id: string): number => mu(byId.get(id)!) / byId.get(id)!.radius ** 2;
		expect(g('stock.vesper')).toBeGreaterThan(g('stock.home'));
		expect(g('stock.ochre')).toBeLessThan(g('stock.home') / 3);
		expect(byId.get('stock.vesper')!.atmosphere!.surfacePressure).toBeGreaterThan(4e5);
		expect(byId.get('stock.ochre')!.atmosphere!.surfacePressure).toBeLessThan(1e4);
		expect(byId.get('stock.kiln')!.atmosphere).toBeUndefined();
		expect(byId.get('stock.glim')!.orbit!.e).toBeGreaterThan(0.2);
		expect(byId.get('stock.vagrant')!.orbit!.e).toBeGreaterThan(0.5);
		// Husk goes round backwards against Tempest's spin
		const tempest = byId.get('stock.tempest')!;
		const husk = byId.get('stock.husk')!;
		const forge = byId.get('stock.forge')!;
		const h = (b: BodyDefinition): Vec3 => {
			const s = toStateVector(b.orbit!, mu(tempest), 0);
			return {
				x: s.r.y * s.v.z - s.r.z * s.v.y,
				y: s.r.z * s.v.x - s.r.x * s.v.z,
				z: s.r.x * s.v.y - s.r.y * s.v.x
			};
		};
		const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
		expect(dot(h(husk), h(forge))).toBeLessThan(0);
	});
});
