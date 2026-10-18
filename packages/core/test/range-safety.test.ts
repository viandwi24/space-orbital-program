/** Range safety (plan 127, ADR 0155): the fan from the water map, the conic drop, the estimate. */
import { describe, expect, test } from 'bun:test';
import {
	conicImpact,
	createBodyTerrainField,
	dropProblem,
	fanWidth,
	headingOf,
	inFan,
	latLonDirection,
	latLonOf,
	nominalDrops,
	resolveSiteTemplate,
	safeFan,
	travel
} from '../src/index.ts';

const DEG = Math.PI / 180;
const HOME = { id: 'stock.home', radius: 600_000, terrain: { kind: 'hills' as const } };
// a world seed whose equatorial coast has the sea to the east within the fan's band
const SEED = 1;
const MU = 3.5316e12;
const field = createBodyTerrainField(HOME, { seed: SEED })!;
const waterAt = (d: { x: number; y: number; z: number }) => field.waterAt!(d);
const probe = { seed: SEED, radius: HOME.radius };

describe('the safe fan (ADR 0155 point 1)', () => {
	test('a coastal site fans over the sea; an inland site has a narrower fan', () => {
		const coast = resolveSiteTemplate(
			{ criteria: { absLatitude: [0, 5 * DEG], seaEast: true } },
			probe
		);
		const inland = resolveSiteTemplate(
			{ criteria: { absLatitude: [0, 50 * DEG], inland: true, minElevation: 0.65 } },
			probe
		);
		const coastFan = safeFan(coast, HOME.radius, waterAt);
		const inlandFan = safeFan(inland, HOME.radius, waterAt);
		expect(coastFan.length).toBeGreaterThan(0);
		// every safe azimuth of the coast points over the sea: its drop band is mostly water
		for (const a of coastFan) {
			const span = (a.to - a.from + 360) % 360;
			for (let az = a.from; az <= a.from + span; az += 5) {
				let water = 0;
				for (let d = 20_000; d <= 200_000; d += 10_000) {
					const [la, lo] = travel(
						coast.latitude,
						coast.longitude,
						(az % 360) * DEG,
						d,
						HOME.radius
					);
					if (waterAt(latLonDirection(la, lo))) water++;
				}
				expect(water / 19).toBeGreaterThanOrEqual(0.75);
			}
		}
		expect(inFan(coastFan, 90)).toBe(true); // the template asks for sea to the east
		expect(fanWidth(inlandFan)).toBeLessThan(fanWidth(coastFan));
	});

	test('another site on the track closes those azimuths', () => {
		const coast = resolveSiteTemplate(
			{ criteria: { absLatitude: [0, 5 * DEG], seaEast: true } },
			probe
		);
		const east = { latitude: coast.latitude, longitude: coast.longitude + 200_000 / HOME.radius };
		const open = safeFan(coast, HOME.radius, waterAt);
		const closed = safeFan(coast, HOME.radius, waterAt, [east]);
		expect(inFan(open, 90)).toBe(true);
		expect(inFan(closed, 90)).toBe(false);
		expect(fanWidth(closed)).toBeLessThan(fanWidth(open));
	});

	test('a fan arc can wrap past north', () => {
		const sea = () => true;
		expect(safeFan({ latitude: 0, longitude: 0 }, HOME.radius, sea)).toEqual([
			{ from: 0, to: 355 }
		]);
		expect(inFan([{ from: 340, to: 20 }], 0)).toBe(true);
		expect(inFan([{ from: 340, to: 20 }], 90)).toBe(false);
	});
});

describe('the drop along the conic (ADR 0155 point 2)', () => {
	const R = HOME.radius;
	test('a circular orbit above the surface never comes down; a hop does', () => {
		const r = { x: R + 80_000, y: 0, z: 0 };
		const vc = Math.sqrt(MU / (R + 80_000));
		expect(conicImpact(MU, r, { x: 0, y: vc, z: 0 }, R)).toBeNull();
		const hop = conicImpact(MU, r, { x: 0, y: 1_000, z: 0 }, R)!;
		expect(Math.hypot(hop.position.x, hop.position.y, hop.position.z)).toBeCloseTo(R, 3);
		expect(hop.position.y).toBeGreaterThan(0); // forward of the start
		expect(hop.time).toBeGreaterThan(0);
	});

	test('the flight time agrees with stepping the same path', () => {
		const r = { x: R + 30_000, y: 0, z: 0 };
		const v = { x: 300, y: 800, z: 0 };
		const hit = conicImpact(MU, r, v, R)!;
		let p = { ...r };
		let u = { ...v };
		let t = 0;
		const dt = 0.01;
		while (Math.hypot(p.x, p.y, p.z) > R) {
			const d = Math.hypot(p.x, p.y, p.z);
			const g = -MU / (d * d * d);
			u = { x: u.x + g * p.x * dt, y: u.y + g * p.y * dt, z: u.z + g * p.z * dt };
			p = { x: p.x + u.x * dt, y: p.y + u.y * dt, z: p.z + u.z * dt };
			t += dt;
		}
		expect(Math.abs(hit.time - t)).toBeLessThan(0.5);
		expect(Math.hypot(hit.position.x - p.x, hit.position.y - p.y)).toBeLessThan(1_000);
	});

	test('a drop on a site or on land is named; one at sea is fine', () => {
		const sea = () => true;
		const land = () => false;
		const site = { id: 'acme.east', latitude: 0, longitude: 0.1 };
		expect(dropProblem({ latitude: 0, longitude: 0.1 }, R, sea, [site])).toEqual({
			kind: 'site',
			site: 'acme.east'
		});
		expect(dropProblem({ latitude: 0, longitude: 0.5 }, R, land, [site])).toEqual({ kind: 'land' });
		expect(dropProblem({ latitude: 0, longitude: 0.5 }, R, sea, [site])).toBeUndefined();
	});

	test('heading and latitude-longitude round trips', () => {
		const up = latLonDirection(0.2, 0.3);
		const ll = latLonOf(up);
		expect(ll.latitude).toBeCloseTo(0.2, 9);
		expect(ll.longitude).toBeCloseTo(0.3, 9);
		const east = latLonDirection(0, 0.001);
		const at0 = latLonDirection(0, 0);
		const v = { x: east.x - at0.x, y: east.y - at0.y, z: east.z - at0.z };
		expect(headingOf(at0, v)).toBeCloseTo(90, 3);
		expect(headingOf(at0, { x: 0, y: 1, z: 0 })).toBeCloseTo(0, 6);
	});
});

describe('the Launch screen estimate (ADR 0155 point 6)', () => {
	test('drops move downrange with more stage Δv, and an orbital stage drops nothing', () => {
		const body = { mu: MU, radius: HOME.radius, atmosphereHeight: 70_000 };
		const site = { latitude: 0, longitude: 0 };
		const drops = nominalDrops([800, 900, 1500, 1000], body, site);
		expect(drops.map((d) => d.stage)).toEqual([0, 1, 2]);
		expect(drops[1]!.downrange!).toBeGreaterThan(drops[0]!.downrange!);
		expect(drops[0]!.at!.longitude).toBeGreaterThan(0); // east
		expect(nominalDrops([5_000, 500], body, site)[0]!.at).toBeNull();
	});
});
