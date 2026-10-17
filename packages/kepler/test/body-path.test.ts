/**
 * Body path models (plan 123, ADR 0183) against JPL Horizons at three dates. Reference data and
 * sources: docs/research/ephemerides.md.
 */
import { describe, expect, test } from 'bun:test';
import {
	AU,
	bodyPathState,
	levelAElements,
	osculatingElements,
	toStateVector,
	type BodyPath,
	type BodySeries,
	type LevelARow,
	type Vec3
} from '../src/index.ts';

const GM_SUN = 1.32712440018e20;
const DATES = [2451545.0, 2459000.5, 2466154.5];
const tau = (jd: number) => (jd - 2451545.0) * 86_400;
/** game (x, y, z) → ecliptic (x, −z, y) */
const ecliptic = (r: Vec3) => ({ x: r.x, y: -r.z, z: r.y });
const ARCSEC = Math.PI / (180 * 3600);

/** JPL Table 1 rows (value, rate per century). */
const ROWS: Record<string, LevelARow> = {
	emb: {
		a: [1.00000261, 0.00000562],
		e: [0.01671123, -0.00004392],
		I: [-0.00001531, -0.01294668],
		L: [100.46457166, 35999.37244981],
		peri: [102.93768193, 0.32327364],
		node: [0, 0]
	},
	mars: {
		a: [1.52371034, 0.00001847],
		e: [0.0933941, 0.00007882],
		I: [1.84969142, -0.00813131],
		L: [-4.55343205, 19140.30268499],
		peri: [-23.94362959, 0.44441088],
		node: [49.55953891, -0.29257343]
	},
	jupiter: {
		a: [5.202887, -0.00011607],
		e: [0.04838624, -0.00013253],
		I: [1.30439695, -0.00183714],
		L: [34.39644051, 3034.74612775],
		peri: [14.72847983, 0.21252668],
		node: [100.47390909, 0.20469106]
	}
};

/** Horizons heliocentric ecliptic J2000 positions, au, at DATES. */
const HORIZONS: Record<string, Array<[number, number, number]>> = {
	emb: [
		[-1.771587841839055e-1, 9.672193524609504e-1, -1.139275508446145e-6],
		[-3.511582553894914e-1, -9.511576870861485e-1, 4.487328942356039e-5],
		[-1.641321798521249e-1, 9.695495018634084e-1, -8.603666253972062e-5]
	],
	mars: [
		[1.390715921746351, -1.341631815101244e-2, -3.446766277581799e-2],
		[6.131408532590118e-1, -1.268998761099761, -4.16322852257292e-2],
		[-2.903959146522574e-1, 1.567160495882598, 3.996702366830432e-2]
	],
	jupiter: [
		[4.001177435589426, 2.938575782470499, -1.01785283451815e-1],
		[1.625771266821006, -4.910006092682107, -1.598104862413612e-2],
		[-5.354415136563502, 8.877640647780445e-1, 1.161125974249393e-1]
	]
};

/** Table 1 nominal errors: λ, φ (arcsec), ρ (km). */
const ERRORS: Record<string, [number, number, number]> = {
	emb: [20, 8, 6_000],
	mars: [40, 2, 25_000],
	jupiter: [400, 10, 600_000]
};

const spherical = (p: { x: number; y: number; z: number }) => {
	const rho = Math.hypot(p.x, p.y, p.z);
	return { lon: Math.atan2(p.y, p.x), lat: Math.asin(p.z / rho), rho };
};
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('kepler-rates: JPL Level A (Table 1)', () => {
	for (const body of Object.keys(ROWS)) {
		test(`${body} is within Table 1's nominal errors of Horizons at 2000, 2020 and 2040`, () => {
			const { elements, rates } = levelAElements(ROWS[body]!);
			const path: BodyPath = { model: 'kepler-rates', elements, rates };
			DATES.forEach((jd, k) => {
				const ours = spherical(ecliptic(bodyPathState(path, GM_SUN, tau(jd)).r));
				const [x, y, z] = HORIZONS[body]![k]!;
				const ref = spherical({ x: x * AU, y: y * AU, z: z * AU });
				const [dLon, dLat, dRho] = ERRORS[body]!;
				expect(angleDiff(ours.lon, ref.lon) / ARCSEC).toBeLessThan(dLon);
				expect(Math.abs(ours.lat - ref.lat) / ARCSEC).toBeLessThan(dLat);
				expect(Math.abs(ours.rho - ref.rho) / 1000).toBeLessThan(dRho);
			});
		});
	}

	test('osculating elements reproduce the state they were taken from', () => {
		const { elements, rates } = levelAElements(ROWS.mars!);
		const path: BodyPath = { model: 'kepler-rates', elements, rates };
		const t = tau(DATES[1]!);
		const s = bodyPathState(path, GM_SUN, t);
		const back = toStateVector(osculatingElements(path, GM_SUN, t), GM_SUN, t);
		expect(Math.hypot(back.r.x - s.r.x, back.r.y - s.r.y, back.r.z - s.r.z)).toBeLessThan(1e-3);
	});
});

/** The Astronomical Almanac low-precision Moon (ephemerides.md). */
export const ALMANAC_MOON: BodySeries = {
	longitude: {
		base: [218.32, 481267.883],
		terms: [
			[6.29, 134.9, 477198.85],
			[-1.27, 259.2, -413335.38],
			[0.66, 235.7, 890534.23],
			[0.21, 269.9, 954397.7],
			[-0.19, 357.5, 35999.05],
			[-0.11, 186.6, 966404.05]
		]
	},
	latitude: {
		terms: [
			[5.13, 93.3, 483202.03],
			[0.28, 228.2, 960400.87],
			[-0.28, 318.3, 6003.18],
			[-0.17, 217.6, -407332.2]
		]
	},
	parallax: {
		base: 0.9508,
		terms: [
			[0.0518, 134.9, 477198.85],
			[0.0095, 259.2, -413335.38],
			[0.0078, 235.7, 890534.23],
			[0.0028, 269.9, 954397.7]
		]
	},
	parentRadius: 6_378_140
};

/** Horizons geocentric Moon: Δ (au), ecliptic-of-date λ, β (deg), at DATES. */
const MOON: Array<[number, number, number]> = [
	[0.00268997545281, 223.3148557, 5.1708744],
	[0.00247079802353, 171.2610741, 5.2014413],
	[0.00270510211946, 116.1423087, 3.5882797]
];

describe('series: the Almanac Moon', () => {
	test('within 0.3° in longitude, 0.2° in latitude and 0.5 % in distance of Horizons', () => {
		const path: BodyPath = {
			model: 'series',
			elements: { a: 384_400_000, e: 0.055, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 },
			series: ALMANAC_MOON
		};
		DATES.forEach((jd, k) => {
			const ours = spherical(ecliptic(bodyPathState(path, 3.986004418e14, tau(jd)).r));
			const [delta, lon, lat] = MOON[k]!;
			expect(angleDiff(ours.lon, (lon * Math.PI) / 180)).toBeLessThan((0.3 * Math.PI) / 180);
			expect(Math.abs(ours.lat - (lat * Math.PI) / 180)).toBeLessThan((0.2 * Math.PI) / 180);
			expect(Math.abs(ours.rho - delta * AU) / (delta * AU)).toBeLessThan(0.005);
		});
	});

	test('its velocity is the derivative of its position, and the osculating conic is lunar', () => {
		const path: BodyPath = {
			model: 'series',
			elements: { a: 384_400_000, e: 0.055, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 },
			series: ALMANAC_MOON
		};
		const s = bodyPathState(path, 3.986004418e14, 1e8);
		const speed = Math.hypot(s.v.x, s.v.y, s.v.z);
		expect(speed).toBeGreaterThan(900);
		expect(speed).toBeLessThan(1_200);
		const el = osculatingElements(path, 3.986004418e14, 1e8);
		expect(el.a / 384_400_000).toBeGreaterThan(0.9);
		expect(el.a / 384_400_000).toBeLessThan(1.1);
	});
});
