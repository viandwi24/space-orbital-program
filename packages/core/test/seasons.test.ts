/** Plan 122 (ADR 0119 point 4): the stock home planet's seasons from its tilted orbit round the Sun. */
import { describe, expect, test } from 'bun:test';
import { HOME_TILT, HomeBody, MoonBody, SunBody } from '../../../mods/stock/src/bodies.ts';
import { calendarOf, positionFromStar, subSolarLatitude } from '../src/index.ts';

const bodies = [SunBody, HomeBody, MoonBody];
const DEG = Math.PI / 180;

describe('seasons', () => {
	test('the sub-solar latitude swings between +tilt and -tilt over one year', () => {
		const cal = calendarOf(bodies);
		const year = cal.kind === 'fictional' ? cal.yearLength! : 0;
		expect(year).toBeGreaterThan(9e6);
		let max = -Infinity;
		let min = Infinity;
		const N = 20_000;
		for (let k = 0; k < N; k++) {
			const lat = subSolarLatitude(bodies, 'stock.home', (k / N) * year)!;
			max = Math.max(max, lat);
			min = Math.min(min, lat);
		}
		expect(Math.abs(max - HOME_TILT)).toBeLessThan(0.01 * DEG);
		expect(Math.abs(min + HOME_TILT)).toBeLessThan(0.01 * DEG);
	});

	test('at t = 0 the sun has the declination of the old fixed sun (0.2 rad)', () => {
		expect(subSolarLatitude(bodies, 'stock.home', 0)).toBeCloseTo(0.2, 3);
	});

	test('the moon is measured through its parent; a system without a star has no seasons', () => {
		const home = positionFromStar(bodies, 'stock.home', 0)!;
		const moon = positionFromStar(bodies, 'stock.cinder', 0)!;
		expect(Math.hypot(moon.x - home.x, moon.y - home.y, moon.z - home.z)).toBeCloseTo(
			11_800_000,
			0
		);
		const { parent: _p, orbit: _o, ...root } = HomeBody;
		expect(subSolarLatitude([root, MoonBody], 'stock.home', 0)).toBeNull();
	});
});
