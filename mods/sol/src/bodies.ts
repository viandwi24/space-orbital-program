/**
 * The Sun, the planets and the Moon at real scale (plan 124, ADR 0184 point 4). Sources and dates:
 * docs/research/ephemerides.md. Frame: the J2000 ecliptic with +Y as its pole (ADR 0183 point 4);
 * time: J2000 TDB (`rotation.epoch: 'j2000'`, orbit models `kepler-rates` and `series`).
 */
import {
	defineBody,
	GRAVITATIONAL_CONSTANT,
	km,
	levelAElements,
	poleQuaternion,
	type BodyDefinition,
	type LevelARow
} from '@orbital/sdk';

const DEG = Math.PI / 180;
const DAY = 86_400;
/** Obliquity of the J2000 ecliptic (the value JPL's Level A page uses). */
const OBLIQUITY = 23.43928 * DEG;

type Vec = { x: number; y: number; z: number };
const cross = (a: Vec, b: Vec): Vec => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (a: Vec): Vec => {
	const n = Math.hypot(a.x, a.y, a.z);
	return { x: a.x / n, y: a.y / n, z: a.z / n };
};
const rotateQ = (q: { x: number; y: number; z: number; w: number }, v: Vec): Vec => {
	const c = cross(q, v);
	const cc = cross(q, c);
	return {
		x: v.x + 2 * (q.w * c.x + cc.x),
		y: v.y + 2 * (q.w * c.y + cc.y),
		z: v.z + 2 * (q.w * c.z + cc.z)
	};
};

/** An ICRF (equatorial) unit vector in the game frame: ecliptic J2000, +Y the ecliptic pole. */
function equatorialToGame(v: Vec): Vec {
	const yEcl = Math.cos(OBLIQUITY) * v.y + Math.sin(OBLIQUITY) * v.z;
	const zEcl = -Math.sin(OBLIQUITY) * v.y + Math.cos(OBLIQUITY) * v.z;
	return { x: v.x, y: zEcl, z: -yEcl };
}

/**
 * A body's rotation from its IAU elements (pole α₀, δ₀ in ICRF; W = W₀ + Ẇ d), as the game's
 * `rotation`: the pole in the game frame, and `w0` such that the body-fixed +X axis is the IAU
 * prime meridian at J2000 (ADR 0184 point 4).
 */
export function iauRotation(
	ra: number,
	dec: number,
	w0Deg: number,
	wDotDegPerDay: number
): NonNullable<BodyDefinition['rotation']> {
	const poleEq = {
		x: Math.cos(dec * DEG) * Math.cos(ra * DEG),
		y: Math.cos(dec * DEG) * Math.sin(ra * DEG),
		z: Math.sin(dec * DEG)
	};
	const pole = equatorialToGame(poleEq);
	const angles = {
		ra: Math.atan2(-pole.z, pole.x),
		dec: Math.asin(Math.max(-1, Math.min(1, pole.y)))
	};
	// IAU node: where the body's equator crosses the ICRF equator going north, ẑ × pole
	const node = equatorialToGame(unit(cross({ x: 0, y: 0, z: 1 }, poleEq)));
	const q = poleQuaternion({ rotationPeriod: 1, rotation: { pole: angles } });
	const e0 = rotateQ(q, { x: 1, y: 0, z: 0 });
	const toNode = Math.atan2(dot(cross(e0, node), pole), dot(e0, node));
	return {
		pole: angles,
		w0: w0Deg * DEG + toNode,
		wDot: (wDotDegPerDay * DEG) / DAY,
		epoch: 'j2000'
	};
}

/** A planet's orbit from its JPL Level A row (`kepler-rates`, ADR 0183 point 2). */
export function levelAOrbit(row: LevelARow): NonNullable<BodyDefinition['orbit']> {
	const { elements, rates } = levelAElements(row);
	return { ...elements, model: 'kepler-rates', rates };
}

const massOf = (gm: number) => gm / GRAVITATIONAL_CONSTANT;
const mass24 = (m: number) => m * 1e24;

/** JPL Table 1 rows (value, rate per Julian century; au and degrees). */
export const LEVEL_A: Record<string, LevelARow> = {
	mercury: {
		a: [0.38709927, 0.00000037],
		e: [0.20563593, 0.00001906],
		I: [7.00497902, -0.00594749],
		L: [252.2503235, 149472.67411175],
		peri: [77.45779628, 0.16047689],
		node: [48.33076593, -0.12534081]
	},
	venus: {
		a: [0.72333566, 0.0000039],
		e: [0.00677672, -0.00004107],
		I: [3.39467605, -0.0007889],
		L: [181.9790995, 58517.81538729],
		peri: [131.60246718, 0.00268329],
		node: [76.67984255, -0.27769418]
	},
	earth: {
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
	},
	saturn: {
		a: [9.53667594, -0.0012506],
		e: [0.05386179, -0.00050991],
		I: [2.48599187, 0.00193609],
		L: [49.95424423, 1222.49362201],
		peri: [92.59887831, -0.41897216],
		node: [113.66242448, -0.28867794]
	},
	uranus: {
		a: [19.18916464, -0.00196176],
		e: [0.04725744, -0.00004397],
		I: [0.77263783, -0.00242939],
		L: [313.23810451, 428.48202785],
		peri: [170.9542763, 0.40805281],
		node: [74.01692503, 0.04240589]
	},
	neptune: {
		a: [30.06992276, 0.00026291],
		e: [0.00859048, 0.00005105],
		I: [1.77004347, 0.00035372],
		L: [-55.12002969, 218.45945325],
		peri: [44.96476227, -0.32241464],
		node: [131.78422574, -0.00508664]
	}
};

/** General precession in longitude, deg per Julian century (the series is of date). */
const PRECESSION = 5028.796 / 3600;

/** The Earth's equatorial radius the Almanac parallax is measured against, m. */
export const EARTH_PARALLAX_RADIUS = 6_378_140;

/** The Almanac low-precision Moon in the J2000 ecliptic (ephemerides.md). */
export const MOON_SERIES = {
	longitude: {
		base: [218.32, 481267.883 - PRECESSION] as [number, number],
		terms: [
			[6.29, 134.9, 477198.85],
			[-1.27, 259.2, -413335.38],
			[0.66, 235.7, 890534.23],
			[0.21, 269.9, 954397.7],
			[-0.19, 357.5, 35999.05],
			[-0.11, 186.6, 966404.05]
		] as Array<[number, number, number]>
	},
	latitude: {
		terms: [
			[5.13, 93.3, 483202.03],
			[0.28, 228.2, 960400.87],
			[-0.28, 318.3, 6003.18],
			[-0.17, 217.6, -407332.2]
		] as Array<[number, number, number]>
	},
	parallax: {
		base: 0.9508,
		terms: [
			[0.0518, 134.9, 477198.85],
			[0.0095, 259.2, -413335.38],
			[0.0078, 235.7, 890534.23],
			[0.0028, 269.9, 954397.7]
		] as Array<[number, number, number]>
	},
	parentRadius: EARTH_PARALLAX_RADIUS
};

export const SolSun = defineBody({
	id: 'sol.sun',
	mass: massOf(1.32712440018e20),
	radius: km(695_700),
	rotationPeriod: (360 / 14.1844) * DAY,
	rotation: iauRotation(286.13, 63.87, 84.176, 14.1844),
	star: true,
	calendar: { kind: 'gregorian-utc' }
});

const planet = (
	name: string,
	m24: number,
	radiusKm: number,
	rotationDays: number,
	iau: [number, number, number, number],
	extra: Partial<BodyDefinition> = {}
) =>
	defineBody({
		id: `sol.${name}`,
		mass: mass24(m24),
		radius: km(radiusKm),
		rotationPeriod: Math.abs(rotationDays) * DAY,
		rotation: iauRotation(...iau),
		parent: 'sol.sun',
		orbit: levelAOrbit(LEVEL_A[name]!),
		...extra
	});

export const SolMercury = planet(
	'mercury',
	0.330103,
	2439.4,
	58.6462,
	[281.0103, 61.4155, 329.5988, 6.1385108],
	{
		terrain: { kind: 'craters', seed: 5 }
	}
);
export const SolVenus = planet(
	'venus',
	4.86731,
	6051.8,
	-243.018,
	[272.76, 67.16, 160.2, -1.4813688]
);
export const SolEarth = planet(
	'earth',
	5.97217,
	6371.0084,
	0.99726968,
	[0, 90, 190.147, 360.9856235],
	{
		atmosphere: { scaleHeight: 8_500, surfacePressure: 101_325, height: km(100) },
		terrain: { kind: 'hills' },
		science: { flyingHigh: km(18), spaceHigh: km(500), multiplier: 1 },
		regions: { kind: 'biomes' }
	}
);
export const SolMars = planet(
	'mars',
	0.641691,
	3389.5,
	1.02595676,
	[317.269202, 54.432516, 176.049863, 350.891982443297],
	{
		terrain: { kind: 'craters', seed: 3 },
		science: { multiplier: 3 }
	}
);
export const SolJupiter = planet(
	'jupiter',
	1898.125,
	69911,
	0.41354,
	[268.056595, 64.495303, 284.95, 870.536]
);
export const SolSaturn = planet(
	'saturn',
	568.317,
	58232,
	0.44401,
	[40.589, 83.537, 38.9, 810.7939024]
);
export const SolUranus = planet(
	'uranus',
	86.8099,
	25362,
	-0.71833,
	[257.311, -15.175, 203.81, -501.1600928]
);
export const SolNeptune = planet(
	'neptune',
	102.4092,
	24622,
	0.67125,
	[299.36, 43.46, 249.978, 541.1397757]
);

/** The Moon: the Almanac series for its path, a mean conic for its sphere (ADR 0183 point 1). */
export const SolMoon = defineBody({
	id: 'sol.moon',
	mass: massOf(4.9028e12),
	radius: km(1737.4),
	rotationPeriod: 27.321661 * DAY,
	rotation: iauRotation(269.9949, 66.5392, 38.3213, 13.17635815),
	parent: 'sol.earth',
	terrain: { kind: 'craters' },
	science: { spaceHigh: km(100), multiplier: 2 },
	orbit: {
		a: km(384_400),
		e: 0.0549,
		i: 5.145 * DEG,
		raan: 0,
		argp: 0,
		m0: 0,
		epoch: 0,
		model: 'series',
		series: MOON_SERIES
	}
});

/** Registration order: the Earth first after the Sun, so it is the home a site-less tool picks. */
export const SOL_BODIES = [
	SolSun,
	SolEarth,
	SolMoon,
	SolMercury,
	SolVenus,
	SolMars,
	SolJupiter,
	SolSaturn,
	SolUranus,
	SolNeptune
] as const;
