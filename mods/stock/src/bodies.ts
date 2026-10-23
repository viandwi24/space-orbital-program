import {
	type BodyDefinition,
	defineBody,
	GRAVITATIONAL_CONSTANT,
	km,
	STANDARD_ATMOSPHERE_TEMPERATURE
} from '@orbital/sdk';

/**
 * The Sun (plan 122, ADR 0119 point 3): the root of the stock system, a star with no surface. It
 * carries the system's calendar (ADR 0141: read on the root): days and years of the home planet.
 */
export const SunBody = defineBody({
	id: 'stock.sun',
	mass: 1.7565459e28,
	radius: km(261_600),
	rotationPeriod: 432_000,
	star: true,
	calendar: { kind: 'fictional', home: 'stock.home' }
});

/** Axial tilt of the home planet, rad (ADR 0119 point 4: the inclination of its orbit, pole +Y). */
export const HOME_TILT = (23.44 * Math.PI) / 180;
/**
 * The home planet's orbit around the Sun: 13.6 Gm, a year of 9.2 Ms (about 425 solar days). The
 * node and the phase put the Sun where the fixed sun of earlier versions was at t = 0 (declination
 * 0.2 rad; the launch site sees it 30 degrees up and rising), so a new world starts in the same light.
 */
export const HOME_ORBIT = {
	a: 13_599_840_256,
	e: 0,
	i: HOME_TILT,
	raan: 4.675573,
	argp: 0,
	m0: 5.759979,
	epoch: 0
};

/** Standard gravitational parameter of the home body, m³/s² (Kerbin-scale: radius 600 km, surface g about 9.81 m/s²). */
export const HOME_MU = 3.5316e12;
/**
 * The home planet: spherical, point-mass gravity, exponential atmosphere, orbiting the Sun (plan
 * 122). Its pole is the system +Y: the tilt is the orbit's, so nothing in its sphere changed.
 */
export const HomeBody = defineBody({
	id: 'stock.home',
	mass: HOME_MU / GRAVITATIONAL_CONSTANT,
	radius: km(600),
	// sidereal; the solar day is about 21 651 s now that the planet orbits the Sun
	rotationPeriod: 21_600,
	parent: 'stock.sun',
	orbit: HOME_ORBIT,
	atmosphere: {
		scaleHeight: 5_600,
		surfacePressure: 101_325,
		height: km(70),
		// a suited crew member may take the helmet off here (plan 249, ADR 0237)
		breathable: true,
		// the 1976 standard atmosphere's layers to its top (plan 212): a = 340 m/s at sea level
		temperatureCurve: STANDARD_ATMOSPHERE_TEMPERATURE.filter(([h]) => h <= km(71)).map(
			([h, t]) => [h, t] as [number, number]
		)
	},
	terrain: { kind: 'hills' },
	// Science thresholds and multiplier (plan 103, ADR 0178 point 2).
	science: { flyingHigh: km(18), spaceHigh: km(250), multiplier: 1 },
	// Science regions (plan 104, ADR 0180 point 2): the biomes the ground is drawn with.
	regions: {
		kind: 'biomes',
		regions: [
			{ id: 'desert', multiplier: 1.5 },
			{ id: 'rock', multiplier: 1.5 },
			{ id: 'snow', multiplier: 1.5 }
		]
	}
});

/** Semi-major axis of the moon's orbit around the home planet, m. */
const MOON_ORBIT_RADIUS = km(11_800);
/** Standard gravitational parameter of the moon, m³/s² (radius 190 km, surface gravity 1.6 m/s²). */
export const MOON_MU = 5.776e10;
/**
 * The moon (ADR 0052): airless, tidally locked (it turns once per orbit), on a circular equatorial
 * prograde orbit around the home planet, so a transfer from the equatorial launch site is a plain
 * Hohmann transfer. Its sphere of influence follows from the masses (Laplace, about 2 280 km).
 */
export const MoonBody = defineBody({
	id: 'stock.cinder',
	mass: MOON_MU / GRAVITATIONAL_CONSTANT,
	radius: km(190),
	rotationPeriod: 2 * Math.PI * Math.sqrt(MOON_ORBIT_RADIUS ** 3 / HOME_MU),
	parent: 'stock.home',
	terrain: { kind: 'craters' },
	science: { spaceHigh: km(60), multiplier: 2 },
	regions: {
		kind: 'cells',
		seed: 7,
		regions: [
			{ id: 'highlands', label: 'Highlands' },
			{ id: 'maria', label: 'Maria', multiplier: 1.2 },
			{ id: 'crater-fields', label: 'Crater fields', multiplier: 1.5 }
		]
	},
	orbit: { a: MOON_ORBIT_RADIUS, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
});

// ---- the wider system (plan 381, ADR 0318) ---------------------------------------------------------
//
// Small bodies at KSP scale, so the stock system stays the easy mode: an inner hot rock (Kiln), a
// hot world under a thick haze (Vesper), a dusty red planet with two captured moonlets (Ochre, Mote,
// Flick), a ringed giant with four moons (Tempest: Forge, Rime, Bastion, Husk), an icy dwarf on a
// tilted, eccentric orbit (Glim) and a wandering asteroid (Vagrant). Numbers and the Δv map:
// docs/research/stock-system.md.

const DEG = Math.PI / 180;
/** The home planet's solar day, s: the "day" the research note and the briefings count in. */
const DAY = 21_651;

type V3 = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: V3, k: number): V3 => v(a.x * k, a.y * k, a.z * k);
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 =>
	v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const unit = (a: V3): V3 => scale(a, 1 / Math.hypot(a.x, a.y, a.z));

/** A reference plane in the system frame: X its reference direction, Y its pole, Z = X × Y. */
interface Plane {
	x: V3;
	y: V3;
	z: V3;
}

/** A plane from its pole, with X where it crosses the system equator going north (or +X if none). */
function planeOf(pole: V3): Plane {
	const y = unit(pole);
	const node = cross(v(0, 1, 0), y);
	const x = Math.hypot(node.x, node.y, node.z) < 1e-9 ? v(1, 0, 0) : unit(node);
	return { x, y, z: cross(x, y) };
}

/** The ecliptic: the home planet's orbit plane, X at its ascending node on the home equator. */
const ECLIPTIC: Plane = (() => {
	const { i, raan } = HOME_ORBIT;
	const x = v(Math.cos(raan), 0, -Math.sin(raan));
	const y = v(Math.sin(raan) * Math.sin(i), Math.cos(i), Math.cos(raan) * Math.sin(i));
	return { x, y, z: cross(x, y) };
})();

/** A vector given in a plane's own axes (Y its pole), in the system frame. */
const inPlane = (p: Plane, l: V3): V3 =>
	add(add(scale(p.x, l.x), scale(p.y, l.y)), scale(p.z, l.z));

/**
 * Orbit elements given against a reference plane (inclination, node and periapsis measured in it,
 * the convention of `@orbital/kepler` with the plane's pole as +Y), as elements in the system frame.
 */
export function orbitAgainst(
	p: Plane,
	el: { a: number; e: number; i: number; raan: number; argp: number; m0: number }
): NonNullable<BodyDefinition['orbit']> {
	// perifocal axes in the plane's textbook frame (I = x, J = -z, K = y), then in the plane's axes
	const cO = Math.cos(el.raan);
	const sO = Math.sin(el.raan);
	const ci = Math.cos(el.i);
	const si = Math.sin(el.i);
	const cw = Math.cos(el.argp);
	const sw = Math.sin(el.argp);
	const pT = v(cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si);
	const wT = v(sO * si, -cO * si, ci);
	const fromT = (t: V3): V3 => inPlane(p, v(t.x, t.z, -t.y));
	const P = fromT(pT);
	const W = fromT(wT);
	// back to the system's textbook frame and the classical elements
	const toT = (g: V3): V3 => v(g.x, -g.z, g.y);
	const Pt = toT(P);
	const Wt = toT(W);
	const i = Math.acos(Math.max(-1, Math.min(1, Wt.z)));
	const n = v(-Wt.y, Wt.x, 0);
	const nLen = Math.hypot(n.x, n.y);
	let raan = 0;
	let argp: number;
	if (nLen < 1e-12) {
		argp = Math.atan2(Pt.y, Pt.x) * (Wt.z >= 0 ? 1 : -1);
	} else {
		const N = scale(n, 1 / nLen);
		raan = Math.atan2(N.y, N.x);
		argp = Math.atan2(dot(cross(N, Pt), Wt), dot(N, Pt));
	}
	const wrap = (x: number): number => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	return {
		a: el.a,
		e: el.e,
		i,
		raan: wrap(raan),
		argp: wrap(argp),
		m0: wrap(el.m0),
		epoch: 0
	};
}

/** The unit normal of an orbit (its angular momentum) in the system frame. */
function orbitNormal(o: { i: number; raan: number }): V3 {
	return v(Math.sin(o.raan) * Math.sin(o.i), Math.cos(o.i), Math.cos(o.raan) * Math.sin(o.i));
}

/**
 * A planet's pole: its orbit normal tilted by `tilt` toward ecliptic longitude `toward`, as the
 * `rotation.pole` direction (ra, dec) of the body schema.
 */
function tiltedPole(
	orbit: { i: number; raan: number },
	tilt: number,
	toward: number
): { ra: number; dec: number } {
	const w = orbitNormal(orbit);
	const d = inPlane(ECLIPTIC, v(Math.cos(toward), 0, -Math.sin(toward)));
	const side = unit(add(d, scale(w, -dot(d, w))));
	const pole = unit(add(scale(w, Math.cos(tilt)), scale(side, Math.sin(tilt))));
	return { ra: Math.atan2(-pole.z, pole.x), dec: Math.asin(Math.max(-1, Math.min(1, pole.y))) };
}

/** The pole direction of (ra, dec) as a vector. */
const poleVector = (p: { ra: number; dec: number }): V3 =>
	v(Math.cos(p.dec) * Math.cos(p.ra), Math.sin(p.dec), -Math.cos(p.dec) * Math.sin(p.ra));

/** μ from a radius and a surface gravity, then the mass. */
const massFor = (radius: number, g: number): number =>
	(g * radius * radius) / GRAVITATIONAL_CONSTANT;

/** The orbital period around a parent of `mu`, s (the spin of a tidally locked moon). */
const periodOf = (a: number, mu: number): number => 2 * Math.PI * Math.sqrt(a ** 3 / mu);

/** CO2 (Vesper, Ochre): gas constant J/(kg·K) and heat capacity ratio. */
const CO2 = { gasConstant: 188.9, gamma: 1.29 };

/** The Sun's μ, m³/s². */
const SUN_MU = SunBody.mass * GRAVITATIONAL_CONSTANT;

/**
 * The phase of a planet at t = 0 (its mean longitude in the ecliptic), set so the first Hohmann
 * window from Home opens `daysToWindow` days into a new world (ADR 0318 point 4).
 */
function phaseFor(a: number, daysToWindow: number): number {
	const nHome = Math.sqrt(SUN_MU / HOME_ORBIT.a ** 3);
	const n = Math.sqrt(SUN_MU / a ** 3);
	const transfer = Math.PI * Math.sqrt(((HOME_ORBIT.a + a) / 2) ** 3 / SUN_MU);
	// the target's lead over Home at departure, and how it drifts until then
	const lead = Math.PI - n * transfer;
	const homeLongitude = HOME_ORBIT.m0;
	return homeLongitude + lead - (n - nHome) * daysToWindow * DAY;
}

/** Elements of a planet against the ecliptic: inclination, node, periapsis and the window it opens on. */
function planetOrbit(el: {
	a: number;
	e: number;
	i: number;
	raan: number;
	argp: number;
	/**
	 * Days from t = 0 to the first transfer window from Home, by the mean longitudes. The trip
	 * planner (`hohmannToTarget`) uses today's radii, so an eccentric orbit's window moves a little:
	 * each value is set so the planner's window falls on the design day (stock-system test).
	 */
	window: number;
}): NonNullable<BodyDefinition['orbit']> {
	const longitude = phaseFor(el.a, el.window);
	return orbitAgainst(ECLIPTIC, { ...el, m0: longitude - el.raan - el.argp });
}

// ---- Kiln: the inner, hot planet ------------------------------------------------------------------

const KILN_ORBIT = planetOrbit({
	a: 5_600_000_000,
	e: 0.18,
	i: 6.2 * DEG,
	raan: 72 * DEG,
	argp: 14 * DEG,
	window: 35
});
/**
 * Kiln: a scorched rock close to the Sun. No air, a long day, cheap to land on but expensive to reach:
 * the transfer down the Sun's well and the capture at an eccentric, inclined planet cost more than
 * any other destination but the outer dwarf.
 */
export const KilnBody = defineBody({
	id: 'stock.kiln',
	mass: massFor(km(260), 2.7),
	radius: km(260),
	rotationPeriod: 1_210_000,
	rotation: { pole: tiltedPole(KILN_ORBIT, 0.5 * DEG, 0) },
	parent: 'stock.sun',
	orbit: KILN_ORBIT,
	terrain: { kind: 'craters', seed: 11 },
	appearance: { palette: ['#a39584', '#665a50', '#cbb79c'], pattern: 'mottled' },
	science: { spaceHigh: km(80), multiplier: 7 },
	regions: {
		kind: 'cells',
		seed: 11,
		regions: [
			{ id: 'scorched-plains', label: 'Scorched plains' },
			{ id: 'rupes', label: 'Rupes', multiplier: 1.3 },
			{ id: 'polar-shadow', label: 'Polar shadow', multiplier: 1.6 }
		]
	}
});

// ---- Vesper: the hot world under a thick haze ------------------------------------------------------

const VESPER_ORBIT = planetOrbit({
	a: 9_900_000_000,
	e: 0.012,
	i: 2.1 * DEG,
	raan: 150 * DEG,
	argp: 40 * DEG,
	window: 172
});
/**
 * Vesper: a world a little bigger than Home under five atmospheres of hot carbon dioxide and a deck
 * of yellow cloud. Easy to land on (the air brakes almost everything, a parachute does the rest),
 * very hard to leave: high gravity and a thick, hot atmosphere. It turns slowly backwards.
 */
export const VesperBody = defineBody({
	id: 'stock.vesper',
	mass: massFor(km(700), 16.2),
	radius: km(700),
	rotationPeriod: 81_000,
	rotation: { pole: tiltedPole(VESPER_ORBIT, 177 * DEG, 30 * DEG) },
	parent: 'stock.sun',
	orbit: VESPER_ORBIT,
	atmosphere: {
		scaleHeight: 7_200,
		surfacePressure: 506_625,
		height: km(90),
		...CO2,
		aurora: false,
		temperatureCurve: [
			[0, 680],
			[20_000, 560],
			[45_000, 380],
			[65_000, 270],
			[90_000, 210]
		]
	},
	terrain: { kind: 'craters', seed: 23 },
	appearance: {
		palette: ['#a5774a', '#6f4a2c', '#c99a62'],
		pattern: 'volcanic',
		sky: '#e0b25c',
		haze: 0.85,
		clouds: { color: '#eedcae', altitude: km(48), opacity: 0.96 }
	},
	science: { flyingHigh: km(30), spaceHigh: km(300), multiplier: 6 },
	regions: {
		kind: 'cells',
		seed: 23,
		regions: [
			{ id: 'lowlands', label: 'Lowlands' },
			{ id: 'lava-plains', label: 'Lava plains', multiplier: 1.3 },
			{ id: 'tesserae', label: 'Tesserae', multiplier: 1.5 }
		]
	}
});

// ---- Ochre and its two captured moonlets ----------------------------------------------------------

const OCHRE_ORBIT = planetOrbit({
	a: 21_500_000_000,
	e: 0.05,
	i: 0.8 * DEG,
	raan: 220 * DEG,
	argp: 300 * DEG,
	window: 62
});
const OCHRE_RADIUS = km(330);
const OCHRE_MU = 2.95 * OCHRE_RADIUS ** 2;
const OCHRE_POLE = tiltedPole(OCHRE_ORBIT, 25 * DEG, 110 * DEG);
const OCHRE_EQUATOR = planeOf(poleVector(OCHRE_POLE));
/**
 * Ochre: the dusty red planet, the first real interplanetary trip. A thin air (6.5 kPa) slows a
 * lander enough for wide parachutes, not enough for small ones; seasons from a 25° tilt and white
 * polar caps.
 */
export const OchreBody = defineBody({
	id: 'stock.ochre',
	mass: OCHRE_MU / GRAVITATIONAL_CONSTANT,
	radius: OCHRE_RADIUS,
	rotationPeriod: 65_500,
	rotation: { pole: OCHRE_POLE },
	parent: 'stock.sun',
	orbit: OCHRE_ORBIT,
	atmosphere: {
		scaleHeight: 5_300,
		surfacePressure: 6_500,
		height: km(48),
		...CO2,
		temperatureCurve: [
			[0, 228],
			[15_000, 200],
			[35_000, 170],
			[48_000, 160]
		]
	},
	terrain: { kind: 'craters', seed: 31 },
	appearance: {
		palette: ['#b0603a', '#7c3c25', '#d38c5c'],
		pattern: 'polar-caps',
		sky: '#d6a27a',
		haze: 0.35
	},
	science: { flyingHigh: km(12), spaceHigh: km(120), multiplier: 5 },
	regions: {
		kind: 'cells',
		seed: 31,
		regions: [
			{ id: 'dust-plains', label: 'Dust plains' },
			{ id: 'canyons', label: 'Canyons', multiplier: 1.4 },
			{ id: 'highlands', label: 'Highlands', multiplier: 1.2 },
			{ id: 'polar-ice', label: 'Polar ice', multiplier: 1.6 }
		]
	}
});

/** A moon of a planet: elements against the parent's equator, tidally locked, its pole the parent's. */
function moonOf(
	parentMu: number,
	equator: Plane,
	parentPole: { ra: number; dec: number },
	el: { a: number; e: number; i: number; raan: number; argp: number; m0: number }
): Pick<BodyDefinition, 'orbit' | 'rotationPeriod' | 'rotation'> {
	return {
		orbit: orbitAgainst(equator, el),
		rotationPeriod: periodOf(el.a, parentMu),
		rotation: { pole: parentPole }
	};
}

/** Mote: the inner moonlet of Ochre, a captured lump racing round in about four hours. */
export const MoteBody = defineBody({
	id: 'stock.mote',
	mass: massFor(km(13), 0.06),
	radius: km(13),
	parent: 'stock.ochre',
	...moonOf(OCHRE_MU, OCHRE_EQUATOR, OCHRE_POLE, {
		a: km(2_200),
		e: 0.02,
		i: 1.1 * DEG,
		raan: 0,
		argp: 0,
		m0: 0.6
	}),
	terrain: { kind: 'craters', seed: 37 },
	appearance: { palette: ['#857868', '#51473f', '#ab9a87'], pattern: 'mottled' },
	science: { spaceHigh: km(30), multiplier: 5 }
});

/** Flick: the outer moonlet of Ochre, smaller, on a tilted and slightly eccentric orbit. */
export const FlickBody = defineBody({
	id: 'stock.flick',
	mass: massFor(km(9), 0.04),
	radius: km(9),
	parent: 'stock.ochre',
	...moonOf(OCHRE_MU, OCHRE_EQUATOR, OCHRE_POLE, {
		a: km(4_600),
		e: 0.07,
		i: 8 * DEG,
		raan: 40 * DEG,
		argp: 90 * DEG,
		m0: 2.4
	}),
	terrain: { kind: 'craters', seed: 41 },
	appearance: { palette: ['#8b8075', '#5a5048', '#b0a293'], pattern: 'mottled' },
	science: { spaceHigh: km(30), multiplier: 5.5 }
});

// ---- Tempest, the ringed giant, and its four moons --------------------------------------------------

const TEMPEST_ORBIT = planetOrbit({
	a: 70_000_000_000,
	e: 0.04,
	i: 1.4 * DEG,
	raan: 30 * DEG,
	argp: 200 * DEG,
	window: 125
});
const TEMPEST_RADIUS = km(5_500);
const TEMPEST_MU = 7.6 * TEMPEST_RADIUS ** 2;
const TEMPEST_POLE = tiltedPole(TEMPEST_ORBIT, 3.5 * DEG, 200 * DEG);
const TEMPEST_EQUATOR = planeOf(poleVector(TEMPEST_POLE));
/**
 * Tempest: a hydrogen giant with copper and cream bands, white storms and bright rings. It has no
 * surface: its air thickens until it crushes whatever sinks into it. Aerobraking in its upper air
 * makes the moons cheap to reach.
 */
export const TempestBody = defineBody({
	id: 'stock.tempest',
	mass: TEMPEST_MU / GRAVITATIONAL_CONSTANT,
	radius: TEMPEST_RADIUS,
	rotationPeriod: 36_000,
	rotation: { pole: TEMPEST_POLE },
	parent: 'stock.sun',
	orbit: TEMPEST_ORBIT,
	atmosphere: {
		scaleHeight: 25_000,
		surfacePressure: 1_500_000,
		height: km(350),
		// hydrogen and helium
		gasConstant: 3_600,
		gamma: 1.42,
		aurora: false,
		temperatureCurve: [
			[0, 165],
			[100_000, 120],
			[200_000, 110],
			[350_000, 160]
		]
	},
	appearance: {
		palette: ['#e2c79a', '#b9774a', '#f3e6c8', '#8c5a3a', '#d9a86e'],
		pattern: 'bands',
		rings: { inner: km(7_700), outer: km(12_600), color: '#d8c7a4', opacity: 0.7 }
	},
	science: { flyingHigh: km(150), spaceHigh: km(6_000), multiplier: 7 },
	regions: {
		kind: 'bands',
		bands: [
			{
				id: 'south-polar',
				label: 'South polar region',
				from: -Math.PI / 2,
				to: -0.9,
				multiplier: 1.4
			},
			{ id: 'south-belt', label: 'Southern belts', from: -0.9, to: -0.15 },
			{ id: 'equatorial-zone', label: 'Equatorial zone', from: -0.15, to: 0.15, multiplier: 1.2 },
			{ id: 'north-belt', label: 'Northern belts', from: 0.15, to: 0.9 },
			{
				id: 'north-polar',
				label: 'North polar region',
				from: 0.9,
				to: Math.PI / 2,
				multiplier: 1.4
			}
		]
	}
});

/** Forge: the innermost big moon of Tempest, kneaded hot by the giant; sulphur plains and lava vents. */
export const ForgeBody = defineBody({
	id: 'stock.forge',
	mass: massFor(km(300), 2.4),
	radius: km(300),
	parent: 'stock.tempest',
	...moonOf(TEMPEST_MU, TEMPEST_EQUATOR, TEMPEST_POLE, {
		a: km(27_000),
		e: 0.004,
		i: 0.1 * DEG,
		raan: 0,
		argp: 0,
		m0: 0.4
	}),
	terrain: { kind: 'craters', seed: 47 },
	appearance: { palette: ['#d8b54a', '#2d2219', '#e86a2a', '#f0dc8a'], pattern: 'volcanic' },
	science: { spaceHigh: km(90), multiplier: 9 },
	regions: {
		kind: 'cells',
		seed: 47,
		regions: [
			{ id: 'sulphur-plains', label: 'Sulphur plains' },
			{ id: 'lava-fields', label: 'Lava fields', multiplier: 1.5 },
			{ id: 'paterae', label: 'Paterae', multiplier: 1.8 }
		]
	}
});

/** Rime: an ice shell over a dark ocean, crossed by rust-coloured cracks. Smooth, bright and cold. */
export const RimeBody = defineBody({
	id: 'stock.rime',
	mass: massFor(km(260), 1.35),
	radius: km(260),
	parent: 'stock.tempest',
	...moonOf(TEMPEST_MU, TEMPEST_EQUATOR, TEMPEST_POLE, {
		a: km(46_000),
		e: 0.009,
		i: 0.5 * DEG,
		raan: 60 * DEG,
		argp: 0,
		m0: 2.1
	}),
	terrain: { kind: 'craters', seed: 53 },
	appearance: { palette: ['#dfe7ea', '#8c5a44', '#b9d4e0'], pattern: 'lineae' },
	science: { spaceHigh: km(80), multiplier: 9 },
	regions: {
		kind: 'cells',
		seed: 53,
		regions: [
			{ id: 'ice-plains', label: 'Ice plains' },
			{ id: 'lineae', label: 'Lineae', multiplier: 1.5 },
			{ id: 'chaos-terrain', label: 'Chaos terrain', multiplier: 1.8 }
		]
	}
});

/**
 * Bastion: the big moon of Tempest, nearly Home's gravity under a cold, thin orange haze of
 * nitrogen. The hardest landing in the system to fly back from, the easiest to slow down at.
 */
export const BastionBody = defineBody({
	id: 'stock.bastion',
	mass: massFor(km(520), 5.2),
	radius: km(520),
	parent: 'stock.tempest',
	...moonOf(TEMPEST_MU, TEMPEST_EQUATOR, TEMPEST_POLE, {
		a: km(90_000),
		e: 0.02,
		i: 0.3 * DEG,
		raan: 120 * DEG,
		argp: 45 * DEG,
		m0: 4.0
	}),
	atmosphere: {
		scaleHeight: 5_000,
		surfacePressure: 25_000,
		height: km(50),
		// nitrogen
		gasConstant: 296.8,
		gamma: 1.4,
		temperatureCurve: [
			[0, 94],
			[20_000, 72],
			[50_000, 150]
		]
	},
	terrain: { kind: 'craters', seed: 59 },
	appearance: {
		palette: ['#8a6a46', '#4f3d2c', '#b08c5c'],
		pattern: 'mottled',
		sky: '#d08a3c',
		haze: 0.6
	},
	science: { flyingHigh: km(15), spaceHigh: km(150), multiplier: 8 },
	regions: {
		kind: 'cells',
		seed: 59,
		regions: [
			{ id: 'dune-fields', label: 'Dune fields' },
			{ id: 'highlands', label: 'Highlands', multiplier: 1.3 },
			{ id: 'basins', label: 'Basins', multiplier: 1.5 }
		]
	}
});

/** Husk: a dark captured rock far out on a tilted, backwards orbit round Tempest. */
export const HuskBody = defineBody({
	id: 'stock.husk',
	mass: massFor(km(45), 0.22),
	radius: km(45),
	parent: 'stock.tempest',
	...moonOf(TEMPEST_MU, TEMPEST_EQUATOR, TEMPEST_POLE, {
		a: km(480_000),
		e: 0.18,
		i: 158 * DEG,
		raan: 210 * DEG,
		argp: 70 * DEG,
		m0: 1.2
	}),
	terrain: { kind: 'craters', seed: 61 },
	appearance: { palette: ['#615a54', '#3b3632', '#857c74'], pattern: 'mottled' },
	science: { spaceHigh: km(40), multiplier: 8 }
});

// ---- Glim: the icy dwarf, and Vagrant: the wanderer -------------------------------------------------

const GLIM_ORBIT = planetOrbit({
	a: 95_000_000_000,
	e: 0.27,
	i: 12 * DEG,
	raan: 280 * DEG,
	argp: 90 * DEG,
	window: 233
});
/**
 * Glim: a dwarf of ice and frost far out, on an orbit tilted 12° and stretched from 69 to 121 Gm;
 * the longest trip in the system. Weak gravity, nitrogen frost plains and a bright heart of ice.
 */
export const GlimBody = defineBody({
	id: 'stock.glim',
	mass: massFor(km(200), 0.9),
	radius: km(200),
	rotationPeriod: 19_500,
	rotation: { pole: tiltedPole(GLIM_ORBIT, 55 * DEG, 0) },
	parent: 'stock.sun',
	orbit: GLIM_ORBIT,
	terrain: { kind: 'craters', seed: 67 },
	appearance: { palette: ['#cfc6bb', '#8e7a6a', '#eef0ee'], pattern: 'polar-caps' },
	science: { spaceHigh: km(60), multiplier: 10 },
	regions: {
		kind: 'cells',
		seed: 67,
		regions: [
			{ id: 'frost-plains', label: 'Frost plains' },
			{ id: 'tholin-lowlands', label: 'Tholin lowlands', multiplier: 1.3 },
			{ id: 'ice-heart', label: 'Ice heart', multiplier: 1.7 }
		]
	}
});

const VAGRANT_ORBIT = planetOrbit({
	a: 36_000_000_000,
	e: 0.68,
	i: 10 * DEG,
	raan: 100 * DEG,
	argp: 90 * DEG,
	window: 90
});
/**
 * Vagrant: a dark asteroid on an eccentric, tilted orbit that dives inside Home's orbit and climbs
 * almost to Tempest's; a rendezvous more than a landing, with gravity you can jump off.
 */
export const VagrantBody = defineBody({
	id: 'stock.vagrant',
	mass: massFor(km(7), 0.012),
	radius: km(7),
	rotationPeriod: 31_000,
	rotation: { pole: tiltedPole(VAGRANT_ORBIT, 40 * DEG, 50 * DEG) },
	parent: 'stock.sun',
	orbit: VAGRANT_ORBIT,
	terrain: { kind: 'craters', seed: 71 },
	appearance: { palette: ['#6e665e', '#46403a', '#958a7f'], pattern: 'mottled' },
	science: { spaceHigh: km(20), multiplier: 8 }
});

/** Every stock body in registration order: the Sun first, then Home and its moon, then the rest outward. */
export const STOCK_BODIES = [
	SunBody,
	HomeBody,
	MoonBody,
	KilnBody,
	VesperBody,
	OchreBody,
	MoteBody,
	FlickBody,
	VagrantBody,
	TempestBody,
	ForgeBody,
	RimeBody,
	BastionBody,
	HuskBody,
	GlimBody
] as const;
