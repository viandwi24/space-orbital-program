/**
 * Aurora curtains (plan 061, ADR 0093): the pure model the planet pass's GLSL repeats. An aurora is
 * emission, not scattering, so it is a footprint on the ground (where the oval of the auroral zone
 * and its folded sheets are) times a profile in height (which gas glows at which altitude), summed
 * along the view ray (Lawlor and Genetti, "Interactive volume rendering aurora on the GPU", 2011:
 * "a height-dependent energy deposition function and a 2D electron flux map"). Nothing here touches
 * the GPU; `auroraAlongRay` is the oracle the tests compare the maths against.
 *
 * Geometry. A body has a magnetic axis: its rotation axis (+Y body-fixed) tilted by `AURORA.tiltDeg`
 * toward longitude `AURORA.tiltLongitudeDeg` (Earth's dipole tilt and the longitude of its geomagnetic
 * north pole). The oval is a ring around that axis at colatitude 23 degrees at magnetic midnight and 12
 * degrees at magnetic noon (Feldstein's oval, research `three.md`), so it sits on the night side.
 */
import type { Vec3 } from '@orbital/core';
import { surfaceUp } from './sun.ts';
import { DEG, clamp, cross, dot, normalize, scale, sub, vec } from './vec.ts';

export const AURORA = {
	/** Tilt of the magnetic axis from the rotation axis, and the body-fixed longitude it leans toward (degrees). */
	tiltDeg: 9.4,
	tiltLongitudeDeg: -72,
	/** Colatitude of the oval's centre line at magnetic midnight and at magnetic noon, rad. */
	colatNight: 23 * DEG,
	colatDay: 12 * DEG,
	/** Gaussian half width of the oval (rad): wide at night, narrow at noon. */
	widthNight: 3.2 * DEG,
	widthDay: 2 * DEG,
	/**
	 * Shell the march covers, m above the surface. The green line peaks near 114 km (Whiter et al. 2023), the
	 * blue lower edge near 100 km, and the red 630 nm light above 200 km; curtains begin above about 80 km.
	 * Absolute altitudes like the ozone layer (ADR 0069): the home body's 70 km of air lies wholly under it.
	 */
	shellBase: 80_000,
	shellTop: 320_000,
	/**
	 * Emission lobes: peak height and half widths (below and above the peak) in m, share of the vertical
	 * column and the colour of that light (linear RGB). Each lobe is normalised, so a column straight
	 * through all three radiates `gain` times the sum of the shares.
	 */
	lobes: [
		// 557.7 nm atomic oxygen: sharp lower edge, tail upward
		{ peak: 112_000, below: 7_000, above: 22_000, share: 1, colour: [0.25, 1.0, 0.4] },
		// 427.8 nm molecular nitrogen: the blue and violet lower fringe
		{ peak: 98_000, below: 4_000, above: 9_000, share: 0.25, colour: [0.55, 0.3, 1.0] },
		// 630 nm atomic oxygen: the faint red upper fringe
		{ peak: 210_000, below: 45_000, above: 55_000, share: 0.14, colour: [1.0, 0.12, 0.08] }
	],
	/** Radiance of a column of footprint 1 straight through the shell, linear HDR (the sky at night is about 0.001). */
	gain: 0.3,
	/** Sample spacing (rad of arc) at which the streaks along the curtain fade to half: a step that long cannot show them. */
	streakFilter: 0.03,
	/** The march's sample spacing times this is the widening of the sheets (see `ovalWeight`). */
	filterShare: 0.5,
	/** Footprint folds repeat after this many seconds; every angular rate below is a whole number of turns per period. */
	period: 600,
	/** Whole turns per `period` of the three folds and the streaks (the curtains drift slowly: tens of seconds per fold). */
	turns: { foldA: 4, foldB: 5, foldC: 9, rays: 7 },
	/** Amplitudes of the three folds in colatitude, rad. */
	foldAmplitude: [1.7 * DEG, 0.9 * DEG, 0.35 * DEG],
	/** Sun elevation (sine) under which the footprint is dark enough to glow: full at `nightFull`, none at `nightNone`. */
	nightNone: -0.05,
	nightFull: -0.2,
	/** From above the air the same emission reads brighter (the eye and the exposure are set by the dark ground, not the dark sky): the strength is scaled by this share. */
	orbitShare: 0.2,
	/** The highest emission that matters for gating: above it the lobes are too faint to see from the ground. */
	visibleTop: 150_000,
	/** Share of the geometric reach that counts: an emission on the horizon is hidden by the haze and the ground. */
	reachShare: 0.7
} as const;

/** The magnetic north axis of a body, unit, body-fixed. */
export const magneticAxis = (): Vec3 =>
	surfaceUp((90 - AURORA.tiltDeg) * DEG, AURORA.tiltLongitudeDeg * DEG);

export interface MagneticFrame {
	axis: Vec3;
	/** Unit, perpendicular to the axis, toward magnetic midnight (away from the sun). */
	midnight: Vec3;
	/** `cross(axis, midnight)`: the direction of increasing magnetic local angle. */
	side: Vec3;
}

/** The axis and the midnight meridian for a sun direction in the body-fixed frame. */
export function magneticFrame(sunBodyFixed: Vec3, axis: Vec3 = magneticAxis()): MagneticFrame {
	const away = scale(sunBodyFixed, -1);
	const perp = sub(away, scale(axis, dot(away, axis)));
	const midnight =
		Math.hypot(perp.x, perp.y, perp.z) > 1e-9
			? normalize(perp)
			: normalize(cross(axis, vec(1, 0, 0)));
	return { axis, midnight, side: cross(axis, midnight) };
}

/** Magnetic colatitude (rad from the axis) and magnetic local angle (rad from midnight, in (-pi, pi]) of a unit body-fixed direction. */
export function magneticCoordinates(frame: MagneticFrame, n: Vec3): { colat: number; psi: number } {
	const ca = clamp(dot(n, frame.axis), -1, 1);
	const perp = sub(n, scale(frame.axis, ca));
	return {
		colat: Math.acos(ca),
		psi: Math.atan2(dot(perp, frame.side), dot(perp, frame.midnight))
	};
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Colatitude of the oval's centre line at magnetic local angle `psi`. */
export const ovalColatitude = (psi: number): number =>
	mix(AURORA.colatDay, AURORA.colatNight, 0.5 + 0.5 * Math.cos(psi));

/** Gaussian half width of the oval at `psi`. */
export const ovalWidth = (psi: number): number =>
	mix(AURORA.widthDay, AURORA.widthNight, 0.5 + 0.5 * Math.cos(psi));

/**
 * Weight of the oval, 1 on its centre line, at `colat` and `psi`. `filter` (rad) is the spacing of the samples a march
 * takes across it: the gaussian is widened by it (keeping its energy) so that a few steps along a long ray read the
 * average of the sheet and not a random point of it.
 */
export function ovalWeight(colat: number, psi: number, filter = 0): number {
	const width = ovalWidth(psi);
	const wide = Math.hypot(width, filter);
	const x = (colat - ovalColatitude(psi)) / wide;
	return (Math.exp(-x * x) * width) / wide;
}

/** 1 where the ground is dark enough for the aurora to show against it (sine of the sun's elevation there), 0 in daylight. */
export function nightWeight(sunSine: number): number {
	const t = clamp((sunSine - AURORA.nightNone) / (AURORA.nightFull - AURORA.nightNone), 0, 1);
	return t * t * (3 - 2 * t);
}

/** Seconds folded into one period, so the GPU never sees a large float and the curtains repeat exactly. */
export const auroraTime = (seconds: number): number =>
	((seconds % AURORA.period) + AURORA.period) % AURORA.period;

const rate = (turns: number): number => (2 * Math.PI * turns) / AURORA.period;

/**
 * The footprint of the curtains, 0 to 1: the oval, folded along its length by three travelling waves
 * (the curtain sheets bend and ripple), and broken into streaks and patches along it. Periodic in
 * `AURORA.period` seconds and in `psi` with a whole number of waves, so there is no seam.
 */
export function curtainFootprint(colat: number, psi: number, seconds: number, filter = 0): number {
	const t = auroraTime(seconds);
	const [a, b, c] = AURORA.foldAmplitude;
	const warp =
		a * Math.sin(3 * psi + rate(AURORA.turns.foldA) * t) +
		b * Math.sin(7 * psi - rate(AURORA.turns.foldB) * t + 1.3) +
		c * Math.sin(13 * psi + rate(AURORA.turns.foldC) * t + 2.1);
	const band = ovalWeight(colat - warp, psi, filter);
	// streaks along the curtain, and a slow patchiness that leaves gaps in the arc
	const streak =
		0.65 +
		(0.35 / (1 + (filter / AURORA.streakFilter) ** 2)) *
			Math.sin(23 * psi - rate(AURORA.turns.rays) * t + (4 * (colat - warp)) / DEG);
	const gaps =
		0.25 + 0.75 * smooth(-0.4, 0.5, Math.sin(2 * psi + 0.7) * Math.sin(5 * psi - rate(2) * t));
	return clamp(band * streak * gaps, 0, 1);
}

const smooth = (e0: number, e1: number, x: number): number => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};

/** Density of one lobe at `h` m, per metre, integrating to its share over height. */
function lobeDensity(l: (typeof AURORA.lobes)[number], h: number): number {
	const sigma = h < l.peak ? l.below : l.above;
	const x = (h - l.peak) / sigma;
	return ((l.share * 2) / (Math.sqrt(2 * Math.PI) * (l.below + l.above))) * Math.exp(-0.5 * x * x);
}

/** Emission per metre of height at `h` m above the surface: linear RGB, the colour changing from violet through green to red as the height rises. */
export function emissionProfile(h: number): [number, number, number] {
	const out: [number, number, number] = [0, 0, 0];
	for (const l of AURORA.lobes) {
		const d = lobeDensity(l, h);
		out[0] += d * l.colour[0];
		out[1] += d * l.colour[1];
		out[2] += d * l.colour[2];
	}
	return out;
}

/** Radiance of the emission at a point: height, magnetic coordinates, time and the sun's sine at the point. */
export function auroraEmission(
	h: number,
	colat: number,
	psi: number,
	seconds: number,
	sunSine: number,
	filter = 0
): [number, number, number] {
	const night = nightWeight(sunSine);
	if (night <= 0) return [0, 0, 0];
	const k = AURORA.gain * night * curtainFootprint(colat, psi, seconds, filter);
	const e = emissionProfile(h);
	return [e[0] * k, e[1] * k, e[2] * k];
}

/** The parts of a ray (distances from `ro`) inside the shell, as one or two intervals; `hitsGround` clips the stretch behind the planet. */
export function shellIntervals(
	r0: number,
	mu: number,
	radius: number,
	hitsGround: boolean
): [number, number][] {
	const sphere = (rs: number): [number, number] | null => {
		const disc = r0 * r0 * (mu * mu - 1) + rs * rs;
		return disc < 0 ? null : [-r0 * mu - Math.sqrt(disc), -r0 * mu + Math.sqrt(disc)];
	};
	const top = sphere(radius + AURORA.shellTop);
	if (!top || top[1] <= 0) return [];
	const a0 = Math.max(top[0], 0);
	const base = sphere(radius + AURORA.shellBase);
	if (!base || base[1] <= 0) return [[a0, top[1]]];
	if (base[0] > 0)
		return hitsGround
			? [[a0, base[0]]]
			: [
					[a0, base[0]],
					[base[1], top[1]]
				];
	return hitsGround ? [] : [[Math.max(a0, base[1]), top[1]]];
}

export interface AuroraRay {
	/** Camera position relative to the body centre, body-fixed, m. */
	origin: Vec3;
	/** Unit view direction, body-fixed. */
	direction: Vec3;
	/** Unit toward the sun, body-fixed. */
	sun: Vec3;
	radius: number;
	seconds: number;
	hitsGround?: boolean;
	steps?: number;
}

/** Radiance along a ray: the CPU oracle of the planet pass's march (midpoint samples, no jitter). */
export function auroraAlongRay(ray: AuroraRay): [number, number, number] {
	const frame = magneticFrame(ray.sun);
	const r0 = Math.hypot(ray.origin.x, ray.origin.y, ray.origin.z);
	const mu = dot(ray.origin, ray.direction) / r0;
	const parts = shellIntervals(r0, mu, ray.radius, ray.hitsGround ?? false);
	const total = parts.reduce((s, [a, b]) => s + (b - a), 0);
	const steps = ray.steps ?? 64;
	const out: [number, number, number] = [0, 0, 0];
	if (total <= 0) return out;
	const ds = total / steps;
	const filter = (ds * AURORA.filterShare) / (ray.radius + AURORA.lobes[0].peak);
	for (let i = 0; i < steps; i++) {
		let s = (i + 0.5) * ds;
		let at = parts[parts.length - 1]![1];
		for (const [from, to] of parts) {
			if (s < to - from) {
				at = from + s;
				break;
			}
			s -= to - from;
		}
		const p = vec(
			ray.origin.x + ray.direction.x * at,
			ray.origin.y + ray.direction.y * at,
			ray.origin.z + ray.direction.z * at
		);
		const r = Math.hypot(p.x, p.y, p.z);
		const n = scale(p, 1 / r);
		const { colat, psi } = magneticCoordinates(frame, n);
		const e = auroraEmission(r - ray.radius, colat, psi, ray.seconds, dot(n, ray.sun), filter);
		out[0] += e[0] * ds;
		out[1] += e[1] * ds;
		out[2] += e[2] * ds;
	}
	return out;
}

export interface AuroraGateInput {
	/** Unit radial of the camera, body-fixed. */
	up: Vec3;
	sunBodyFixed: Vec3;
	/** Camera altitude, m, and the height of the body's air. */
	altitude: number;
	atmosphereHeight: number;
	radius: number;
	/** 0 to 1: the sky is dark (`starVisibility`: night, or thin air above the atmosphere). */
	darkSky: number;
	/** Whether the body has an aurora (its definition) and the preset draws one. */
	enabled: boolean;
}

/**
 * Strength 0 to 1 the planet pass is given: 0 skips the march altogether (the pass has no cost by
 * day, at low latitudes or on a body without an aurora). The oval has to be in reach of the eye:
 * the central angle from the camera's foot to a point of the shell it can still see over the horizon
 * is `acos(R / (R + altitude)) + acos(R / (R + visibleTop))`, and the oval's edge (two widths from its
 * centre line) must be inside it. It fades out over the last fifth of the reach.
 */
export function auroraStrength(input: AuroraGateInput): number {
	if (!input.enabled || input.darkSky <= 0.02) return 0;
	const frame = magneticFrame(input.sunBodyFixed);
	const { colat, psi } = magneticCoordinates(frame, input.up);
	const toRing = Math.max(0, Math.abs(colat - ovalColatitude(psi)) - 2 * ovalWidth(psi));
	const horizon = (h: number): number => Math.acos(input.radius / (input.radius + Math.max(h, 0)));
	const reach = AURORA.reachShare * (horizon(input.altitude) + horizon(AURORA.visibleTop));
	const reachFade = 1 - smooth(0.8 * reach, reach, toRing);
	const inSpace = smooth(0.5, 1, input.altitude / input.atmosphereHeight);
	return clamp(input.darkSky, 0, 1) * reachFade * mix(1, AURORA.orbitShare, inSpace);
}
