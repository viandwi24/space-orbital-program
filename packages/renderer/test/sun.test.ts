import { describe, expect, test } from 'bun:test';
import {
	SUN_DECLINATION,
	bodyRotationAt,
	latLonOf,
	siteAxes,
	surfaceUp,
	starDirection,
	sunDirectionBodyFixed,
	sunElevationAt,
	sunFromHorizontal,
	sunElevation
} from '../src/sun.ts';
import { DEG, dot, length, rotate } from '../src/vec.ts';

const PERIOD = 21_600; // stock.home rotationPeriod
const OMEGA = (2 * Math.PI) / PERIOD;

describe('sun', () => {
	test('star direction is a unit vector inclined by the declination', () => {
		const s = starDirection();
		expect(length(s)).toBeCloseTo(1, 12);
		expect(Math.asin(s.y)).toBeCloseTo(SUN_DECLINATION, 12);
	});

	test('the body-fixed sun direction turns with the body rotation quaternion', () => {
		const t = 5_400; // quarter of a day
		const q = bodyRotationAt(OMEGA, t);
		const bf = sunDirectionBodyFixed(q);
		// rotating the body-fixed direction back gives the fixed inertial star direction
		const back = rotate(q, bf);
		const s = starDirection();
		expect(back.x).toBeCloseTo(s.x, 12);
		expect(back.y).toBeCloseTo(s.y, 12);
		expect(back.z).toBeCloseTo(s.z, 12);
		// and the body-fixed direction rotated by exactly omega*t about +Y from the t = 0 one
		const b0 = sunDirectionBodyFixed(bodyRotationAt(OMEGA, 0));
		const lon0 = Math.atan2(-b0.z, b0.x);
		const lon1 = Math.atan2(-bf.z, bf.x);
		expect(lon0 - lon1).toBeCloseTo(OMEGA * t, 9);
		expect(bf.y).toBeCloseTo(b0.y, 12);
	});

	test('launch site: 25..35 degrees and rising at t = 0, noon after 3600 s, day length = rotation period', () => {
		const el = (t: number) => sunElevationAt(bodyRotationAt(OMEGA, t), 0, 0) / DEG;
		expect(el(0)).toBeGreaterThan(25);
		expect(el(0)).toBeLessThan(35);
		expect(el(60)).toBeGreaterThan(el(0));
		let best = 0;
		let bestT = 0;
		for (let t = 0; t < PERIOD; t += 60) {
			if (el(t) > best) {
				best = el(t);
				bestT = t;
			}
		}
		expect(bestT).toBe(3_600);
		expect(best).toBeCloseTo(90 - SUN_DECLINATION / DEG, 3);
		expect(el(PERIOD)).toBeCloseTo(el(0), 9);
		expect(el(PERIOD / 2 + 3_600)).toBeLessThan(-60); // midnight
	});

	test('horizontal override reproduces the requested elevation and azimuth', () => {
		const axes = siteAxes(0.3, 1.1);
		const d = sunFromHorizontal(axes, 22, 135);
		expect(length(d)).toBeCloseTo(1, 12);
		expect(sunElevation(d, axes.up) / DEG).toBeCloseTo(22, 9);
		const horiz = dot(d, axes.east) / Math.cos(22 * DEG);
		expect(horiz).toBeCloseTo(Math.sin(135 * DEG), 9);
	});

	test('site axes match placeOnSurface: lat/lon 0 has up +X, east -Z, north +Y', () => {
		const a = siteAxes(0, 0);
		expect(a.up).toEqual({ x: 1, y: 0, z: -0 });
		expect(a.east.z).toBeCloseTo(-1, 12);
		expect(a.north.y).toBeCloseTo(1, 12);
	});
});

describe('latLonOf', () => {
	test('inverts surfaceUp', () => {
		for (const [lat, lon] of [
			[0, 0],
			[0.4, 1.2],
			[-0.9, -2.5]
		] as const) {
			const out = latLonOf(surfaceUp(lat, lon));
			expect(out.latitude).toBeCloseTo(lat, 12);
			expect(out.longitude).toBeCloseTo(lon, 12);
		}
	});
});
