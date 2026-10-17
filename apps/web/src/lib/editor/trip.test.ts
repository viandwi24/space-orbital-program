/** Plan 034 / ADR 0083: the delta-v map against hand values, and the stage allocation. */
import { GRAVITATIONAL_CONSTANT, loadPlugins, type BodyDefinition } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { bodyMu } from '../orbit-info';
import {
	ascentOf,
	bodyName,
	destinationsOf,
	hohmannDeparture,
	hyperbolicBurn,
	lowOrbitAltitude,
	planTrip,
	REFERENCE_ACCELERATION_G,
	surfaceGravity,
	visViva,
	type Destination,
	type Leg,
	type StageBudget
} from './trip';

const { registries } = loadPlugins([Stock]);
const stock = registries.bodies.list();
const home = stock.find((b) => b.id === 'stock.home')!;
const moon = stock.find((b) => b.id === 'stock.cinder')!;
const MU = bodyMu(home);
const MU_MOON = bodyMu(moon);

/** A mod moon given as data: the stock one, thicker, with air, farther out. */
const airy: BodyDefinition = {
	id: 'acme.haze',
	mass: (0.8 * 5.776e10) / GRAVITATIONAL_CONSTANT,
	radius: 150_000,
	rotationPeriod: 100_000,
	atmosphere: { scaleHeight: 4_000, surfacePressure: 20_000, height: 30_000 },
	parent: 'stock.home',
	orbit: { a: 6_000_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
};

describe('conic legs', () => {
	it('vis-viva on a circle is the circular speed, on a Hohmann ellipse the textbook value', () => {
		const r = 7_000_000;
		expect(visViva(MU, r, r)).toBeCloseTo(Math.sqrt(MU / r), 9);
		const r1 = 680_000;
		const r2 = 11_800_000;
		const hand = Math.sqrt(MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
		expect(hohmannDeparture(MU, r1, r2)).toBeCloseTo(hand, 6);
		// journal 044: the transfer burn from 680 km to the moon's radius is 858 m/s
		expect(Math.abs(hohmannDeparture(MU, r1, r2) - 858)).toBeLessThan(0.01 * 858);
	});

	it('a hyperbolic burn is the difference of the periapsis speed and the circular speed', () => {
		expect(hyperbolicBurn(1e12, 1e6, 1000)).toBeCloseTo(Math.sqrt(3e6) - 1000, 9); // 732.05
		expect(hyperbolicBurn(1e12, 1e6, 0)).toBeCloseTo((Math.SQRT2 - 1) * 1000, 9);
	});

	it("the stock moon's capture into the 1 200 km ellipse of journal 044 is about 150 m/s", () => {
		const r1 = home.radius + lowOrbitAltitude(home);
		const r2 = moon.orbit!.a;
		const vInf = Math.sqrt(MU / r2) - visViva(MU, r2, (r1 + r2) / 2);
		const rp = moon.radius + 60_000;
		const ra = moon.radius + 1_200_000;
		const hyper = Math.sqrt(vInf * vInf + (2 * MU_MOON) / rp);
		const ellipse = visViva(MU_MOON, rp, (rp + ra) / 2);
		const dv = hyper - ellipse;
		expect(dv).toBeGreaterThan(130);
		expect(dv).toBeLessThan(175);
	});
});

describe('the ascent', () => {
	const accel = REFERENCE_ACCELERATION_G * surfaceGravity(home);

	it('the home ascent to 80 km is within the 3 000 to 3 900 m/s of journals 006 and 044', () => {
		const up = ascentOf(home, accel, lowOrbitAltitude(home))!;
		expect(lowOrbitAltitude(home)).toBe(80_000);
		expect(up.dv).toBeGreaterThan(3_000);
		expect(up.dv).toBeLessThan(3_900);
		const circular = Math.sqrt(MU / (home.radius + 80_000));
		expect(up.dv).toBeGreaterThan(circular - (2 * Math.PI * home.radius) / home.rotationPeriod);
	});

	it('an airless ascent costs between the circular speed and 1.6 times it, and more than the potential energy', () => {
		const alt = lowOrbitAltitude(moon);
		const up = ascentOf(moon, accel, alt)!;
		const circular = Math.sqrt(MU_MOON / (moon.radius + alt));
		expect(up.dv).toBeGreaterThan(circular);
		expect(up.dv).toBeLessThan(1.6 * circular);
		// no less than the speed that carries the climb: sqrt(2 (mu/R - mu/(2 r)))
		const r = moon.radius + alt;
		expect(up.dv).toBeGreaterThan(0.97 * Math.sqrt(2 * MU_MOON * (1 / moon.radius - 1 / (2 * r))));
	});

	it('a body without air has no drag loss; a thicker atmosphere costs more', () => {
		const alt = lowOrbitAltitude(home);
		const dv = (b: BodyDefinition): number => ascentOf(b, accel, alt)!.dv;
		const bare: BodyDefinition = { ...home, id: 'x.bare', atmosphere: undefined };
		const thick: BodyDefinition = {
			...home,
			id: 'x.thick',
			atmosphere: { ...home.atmosphere!, surfacePressure: 3 * home.atmosphere!.surfacePressure }
		};
		expect(dv(bare)).toBeLessThan(dv(home));
		expect(dv(home)).toBeLessThan(dv(thick));
		expect(dv(home) - dv(bare)).toBeGreaterThan(30);
	});

	it('a body the reference acceleration cannot lift off from has no ascent', () => {
		const heavy: BodyDefinition = { ...moon, id: 'x.heavy', mass: moon.mass * 40 };
		expect(surfaceGravity(heavy)).toBeGreaterThan(accel);
		expect(ascentOf(heavy, accel, 50_000)).toBeNull();
	});
});

describe('destinations from the bodies', () => {
	it('stock: low orbit, escape, then the moon in four steps with growing totals', () => {
		const d = destinationsOf(stock);
		expect(d.map((x) => x.id)).toEqual([
			'low-orbit',
			'escape',
			'stock.cinder:transfer',
			'stock.cinder:orbit',
			'stock.cinder:landing',
			'stock.cinder:return'
		]);
		expect(d.map((x) => x.label)).toEqual([
			'Low orbit (80 km)',
			'Escape from Home',
			'Cinder transfer',
			'Cinder orbit (48 km)',
			'Cinder landing',
			'Cinder and back'
		]);
		const totals = d.slice(2).map((x) => x.total);
		for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThan(totals[i - 1]!);
		for (const x of d)
			expect(x.total).toBeCloseTo(
				x.legs.reduce((s, l) => s + l.dv, 0),
				9
			);
	});

	it('escape is (sqrt 2 - 1) times the circular speed on top of the climb', () => {
		const d = destinationsOf(stock);
		const low = d[0]!;
		const escape = d[1]!;
		const r1 = home.radius + 80_000;
		expect(escape.legs.at(-1)!.dv).toBeCloseTo((Math.SQRT2 - 1) * Math.sqrt(MU / r1), 6);
		expect(escape.total).toBeCloseTo(low.total + escape.legs.at(-1)!.dv, 9);
	});

	it('the stock return is the landing plus a lift-off and an ejection, no burn at home (air)', () => {
		const ret = destinationsOf(stock).find((x) => x.id === 'stock.cinder:return')!;
		expect(ret.legs.map((l) => l.id)).toEqual([
			'ascent',
			'transfer',
			'capture',
			'descent',
			'liftoff',
			'ejection'
		]);
		const landing = destinationsOf(stock).find((x) => x.id === 'stock.cinder:landing')!;
		expect(ret.total).toBeGreaterThan(landing.total + 600);
		expect(ret.legs.filter((l) => l.atmospheric).map((l) => l.id)).toEqual(['ascent']);
	});

	it('a mod moon, handed in as data, gets its own four destinations', () => {
		const d = destinationsOf([...stock, airy]);
		const ids = d.map((x) => x.id);
		expect(ids).toContain('acme.haze:landing');
		expect(ids.filter((i) => i.startsWith('acme.haze:'))).toEqual([
			'acme.haze:transfer',
			'acme.haze:orbit',
			'acme.haze:landing',
			'acme.haze:return'
		]);
		const label = d.find((x) => x.id === 'acme.haze:orbit')!.label;
		expect(label).toBe('Haze orbit (40 km)'); // atmosphere height 30 km + 10 km
		// the nearer moon needs a smaller transfer burn than the stock one
		const transfer = (id: string): number =>
			d.find((x) => x.id === id)!.legs.find((l) => l.id === 'transfer')!.dv;
		expect(transfer('acme.haze:transfer')).toBeLessThan(transfer('stock.cinder:transfer'));
		expect(bodyName(airy)).toBe('Haze');
	});

	it('bodies that do not orbit the home body, have no orbit, or lie below its low orbit are not offered', () => {
		const grand: BodyDefinition = { ...airy, id: 'acme.grand', parent: 'stock.cinder' };
		const lost: BodyDefinition = { ...airy, id: 'acme.lost', orbit: undefined };
		const inside: BodyDefinition = {
			...airy,
			id: 'acme.inside',
			orbit: { ...airy.orbit!, a: home.radius + 50_000 }
		};
		const heavy: BodyDefinition = { ...moon, id: 'acme.heavy', mass: moon.mass * 40 };
		const ids = destinationsOf([...stock, grand, lost, inside, heavy]).map((x) => x.id);
		expect(ids.some((i) => /acme\.(grand|lost|inside|heavy)/.test(i))).toBe(false);
		expect(ids).toHaveLength(6);
	});

	it('an airless home needs a circularising burn on the way back', () => {
		const dry: BodyDefinition = { ...home, atmosphere: undefined };
		const ret = destinationsOf([dry, moon]).find((x) => x.id === 'stock.cinder:return')!;
		const last = ret.legs.at(-1)!;
		expect(last.id).toBe('reentry');
		expect(last.dv).toBeGreaterThan(0);
	});

	it('nothing without bodies', () => {
		expect(destinationsOf([])).toEqual([]);
	});
});

describe('laying the legs over the stages', () => {
	const leg = (id: Leg['id'], dv: number, atmospheric = false): Leg => ({
		id,
		label: id,
		dv,
		atmospheric
	});
	const dest = (legs: Leg[]): Destination => ({
		id: 't',
		label: 't',
		body: 'b',
		kind: 'landing',
		legs,
		total: legs.reduce((s, l) => s + l.dv, 0)
	});
	const stages: StageBudget[] = [
		{ stage: 0, dvSeaLevel: 2_400, dvVacuum: 3_000 },
		{ stage: 1, dvSeaLevel: 3_800, dvVacuum: 4_000 }
	];
	const three = dest([leg('ascent', 3_400, true), leg('transfer', 900), leg('capture', 700)]);

	it('hand case: the atmospheric leg takes the first stage at sea level, the rest from the second', () => {
		const plan = planTrip(three, stages);
		expect(plan.legs[0]!.covers).toEqual([
			{ stage: 0, dv: 2_400, seaLevel: true },
			{ stage: 1, dv: 1_000, seaLevel: false }
		]);
		expect(plan.legs[1]!.covers).toEqual([{ stage: 1, dv: 900, seaLevel: false }]);
		expect(plan.legs[2]!.covers).toEqual([{ stage: 1, dv: 700, seaLevel: false }]);
		expect(plan.short).toBe(0);
		expect(plan.enough).toBe(true);
		expect(plan.spare).toBeCloseTo(1_400, 9);
		expect(plan.covered).toBeCloseTo(5_000, 9);
	});

	it('a design 500 m/s short reports it on the last leg', () => {
		const plan = planTrip(three, [stages[0]!, { stage: 1, dvSeaLevel: 2_100, dvVacuum: 2_100 }]);
		expect(plan.enough).toBe(false);
		expect(plan.short).toBeCloseTo(500, 9);
		expect(plan.legs.map((l) => l.short)).toEqual([0, 0, expect.closeTo(500, 9)]);
		expect(plan.spare).toBeCloseTo(0, 9);
		expect(plan.covered).toBeCloseTo(plan.needed - 500, 9);
	});

	it('an empty design covers nothing', () => {
		const plan = planTrip(three, []);
		expect(plan.legs.every((l) => l.covers.length === 0)).toBe(true);
		expect(plan.short).toBe(three.total);
		expect(plan.covered).toBe(0);
		expect(plan.spare).toBe(0);
		expect(plan.enough).toBe(false);
	});

	it('covered plus short is the leg for every leg, and stages without delta-v are skipped', () => {
		const plan = planTrip(three, [
			{ stage: 0, dvSeaLevel: 0, dvVacuum: 0 }, // a decoupler stage
			{ stage: 1, dvSeaLevel: 1_000, dvVacuum: 1_200 },
			{ stage: 2, dvSeaLevel: 900, dvVacuum: 900 }
		]);
		for (const l of plan.legs)
			expect(l.covers.reduce((s, c) => s + c.dv, 0) + l.short).toBeCloseTo(l.leg.dv, 9);
		expect(plan.legs[0]!.covers.map((c) => c.stage)).toEqual([1, 2]);
		// the first stage of the report was the empty one: the sea-level rule is the report's first stage
		expect(plan.legs[0]!.covers[0]!.seaLevel).toBe(false);
	});

	it('an atmospheric leg that ends inside the first stage leaves the rest in proportion', () => {
		const plan = planTrip(dest([leg('ascent', 1_200, true), leg('transfer', 1_000)]), stages);
		expect(plan.legs[0]!.covers).toEqual([{ stage: 0, dv: 1_200, seaLevel: true }]);
		// half of stage 0 is used at 2 400 m/s of sea level: the other half gives 1 500 in vacuum
		expect(plan.legs[1]!.covers).toEqual([{ stage: 0, dv: 1_000, seaLevel: false }]);
		expect(plan.spare).toBeCloseTo(500 + 4_000, 9);
	});

	it('the stock lander designs fit the stock map', () => {
		const d = destinationsOf(stock);
		expect(d.every((x) => x.legs.every((l) => l.dv > 0))).toBe(true);
	});
});
