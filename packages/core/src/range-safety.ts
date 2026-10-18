/**
 * Range safety (plan 127, ADR 0155): the safe launch fan of a site from the water map, where a
 * spent stage falls along its drag-free conic, what is wrong with that place, the penalties, and
 * the Launch screen's nominal estimate. Pure; the sim judges drops at staging with these.
 */
import { cross, dot, length, normalize, scale, add, trueToMean, wrapTwoPi } from '@orbital/kepler';
import * as z from 'zod';
import type { Vec3 } from './math.ts';
import { siteDistance, travel } from './site-templates.ts';
import { latLonDirection } from './terrain.ts';

/** The world rule (stock defines it): `cost`, `hard` or `off`. */
export const RANGE_RULE = 'stock.range-safety';
export type RangeMode = 'cost' | 'hard' | 'off';

/** Ledger cause of a penalty. */
export const RANGE_CAUSE = 'range-safety';

/** The numbers of ADR 0155 points 1, 3 and 4. */
export const RANGE = {
	/** Azimuth step of the fan, degrees. */
	fanStep: 5,
	/** The ground track judged for the fan, m downrange. */
	fanNear: 20_000,
	fanFar: 200_000,
	fanSample: 10_000,
	/** Share of the samples that must be water. */
	fanWater: 0.75,
	/** A drop or a track this close to a site is on it, m. */
	siteClearance: 50_000,
	/** The ascent azimuth is measured at this height above the surface, m. */
	azimuthAltitude: 2_000
} as const;

export type RangeViolationKind = 'site' | 'land' | 'azimuth';

/** Funds (before the cost multiplier) and reputation per violation (ADR 0155 point 5). */
export const RANGE_PENALTIES: Record<RangeViolationKind, { funds: number; reputation: number }> = {
	site: { funds: 10_000, reputation: 10 },
	land: { funds: 2_000, reputation: 3 },
	azimuth: { funds: 1_000, reputation: 1 }
};

/** A contiguous run of safe azimuths, degrees clockwise from north, `to` inclusive. */
export interface FanArc {
	from: number;
	to: number;
}

export interface LatLon {
	latitude: number;
	longitude: number;
}

/** Body-fixed unit direction to latitude and longitude, rad (the inverse of `latLonDirection`). */
export function latLonOf(direction: Vec3): LatLon {
	const n = normalize(direction);
	return {
		latitude: Math.asin(Math.max(-1, Math.min(1, n.y))),
		longitude: Math.atan2(-n.z, n.x)
	};
}

/**
 * The safe fan of a site (ADR 0155 point 1): every `fanStep` azimuth whose track from `fanNear`
 * to `fanFar` is water at `fanWater` of its samples and passes no other site, as arcs.
 */
export function safeFan(
	site: LatLon,
	radius: number,
	waterAt: (direction: Vec3) => boolean,
	others: readonly LatLon[] = []
): FanArc[] {
	const steps = Math.round(360 / RANGE.fanStep);
	const safe: boolean[] = [];
	for (let i = 0; i < steps; i++) {
		const bearing = (i * RANGE.fanStep * Math.PI) / 180;
		let water = 0;
		let samples = 0;
		let clear = true;
		for (let d = RANGE.fanNear; d <= RANGE.fanFar; d += RANGE.fanSample) {
			const [la, lo] = travel(site.latitude, site.longitude, bearing, d, radius);
			samples++;
			if (waterAt(latLonDirection(la, lo))) water++;
			const here = { latitude: la, longitude: lo };
			if (others.some((o) => siteDistance(here, o, radius) < RANGE.siteClearance)) clear = false;
		}
		safe.push(clear && water >= RANGE.fanWater * samples);
	}
	return arcsOf(safe);
}

function arcsOf(safe: readonly boolean[]): FanArc[] {
	const n = safe.length;
	if (safe.every(Boolean)) return [{ from: 0, to: 360 - RANGE.fanStep }];
	// start the walk just after an unsafe azimuth so no arc wraps past the end
	const start = safe.findIndex((s, i) => !s && safe[(i + 1) % n]);
	if (start < 0) return [];
	const arcs: FanArc[] = [];
	let from: number | null = null;
	for (let k = 1; k <= n; k++) {
		const i = (start + k) % n;
		if (safe[i] && from === null) from = i;
		if (!safe[i] && from !== null) {
			arcs.push({ from: from * RANGE.fanStep, to: (((i - 1 + n) % n) * RANGE.fanStep) % 360 });
			from = null;
		}
	}
	return arcs.sort((a, b) => a.from - b.from);
}

/** Total width of a fan, degrees. */
export const fanWidth = (fan: readonly FanArc[]): number =>
	fan.reduce((w, a) => w + ((a.to - a.from + 360) % 360) + RANGE.fanStep, 0);

/** True when `azimuth` (degrees) lies in the fan, half a step around each arc. */
export function inFan(fan: readonly FanArc[], azimuth: number): boolean {
	const az = ((azimuth % 360) + 360) % 360;
	const half = RANGE.fanStep / 2;
	return fan.some((a) => {
		const span = ((a.to - a.from + 360) % 360) + 2 * half;
		return (az - (a.from - half) + 720) % 360 <= span;
	});
}

/**
 * Where a state falls along its conic to the reference `radius` (ADR 0155 point 2): the
 * descending crossing, as a body-centred inertial position and the flight time. Null when the
 * conic never comes down (periapsis above the surface, or not an ellipse).
 */
export function conicImpact(
	mu: number,
	r: Vec3,
	v: Vec3,
	radius: number
): { position: Vec3; time: number } | null {
	const r0 = length(r);
	if (r0 <= radius) return { position: scale(normalize(r), radius), time: 0 };
	const h = cross(r, v);
	const hh = length(h);
	if (hh < 1e-9) {
		// straight up or down: falls back to where it is
		return dot(r, v) < 0 || dot(v, v) / 2 - mu / r0 < 0
			? { position: scale(normalize(r), radius), time: NaN }
			: null;
	}
	const ev = scale(add(cross(v, h), scale(r, -mu / r0)), 1 / mu);
	const e = length(ev);
	if (e >= 1 - 1e-6) return null;
	const p = (hh * hh) / mu;
	if (p / (1 + e) >= radius) return null; // periapsis above the surface
	const a = p / (1 - e * e);
	// true anomaly now, and of the descending crossing of the radius
	const eHat = e > 1e-9 ? scale(ev, 1 / e) : normalize(r);
	const qHat = normalize(cross(normalize(h), eHat));
	const nu0 = Math.atan2(dot(r, qHat), dot(r, eHat));
	const c = e > 1e-9 ? (p / radius - 1) / e : 1;
	if (c > 1) return null;
	const nu1 = 2 * Math.PI - Math.acos(Math.max(-1, c));
	const n = Math.sqrt(mu / (a * a * a));
	const m0 = wrapTwoPi(trueToMean(nu0, e));
	const m1 = wrapTwoPi(trueToMean(nu1, e));
	const time = wrapTwoPi(m1 - m0) / n;
	const position = add(scale(eHat, radius * Math.cos(nu1)), scale(qHat, radius * Math.sin(nu1)));
	return { position, time };
}

/** What is wrong with a drop at `at` (ADR 0155 point 3): on a site, on land, or nothing. */
export function dropProblem(
	at: LatLon,
	radius: number,
	waterAt: (direction: Vec3) => boolean,
	sites: readonly (LatLon & { id: string })[]
): { kind: 'site'; site: string } | { kind: 'land' } | undefined {
	const near = sites.find((s) => siteDistance(at, s, radius) < RANGE.siteClearance);
	if (near) return { kind: 'site', site: near.id };
	if (!waterAt(latLonDirection(at.latitude, at.longitude))) return { kind: 'land' };
	return undefined;
}

/** The reason a judged drop gives the player. */
export const dropReason = (problem: { kind: 'site'; site: string } | { kind: 'land' }): string =>
	problem.kind === 'site'
		? `the spent stage would fall on site "${problem.site}"`
		: 'the spent stage would fall on land';

/** Compass heading (degrees from north, clockwise) of a body-fixed velocity at a direction. */
export function headingOf(up: Vec3, velocity: Vec3): number {
	const u = normalize(up);
	const north0 = { x: -u.x * u.y, y: 1 - u.y * u.y, z: -u.z * u.y };
	const north = length(north0) < 1e-9 ? { x: 1, y: 0, z: 0 } : normalize(north0);
	const east = normalize(cross(north, u));
	const deg = (Math.atan2(dot(velocity, east), dot(velocity, north)) * 180) / Math.PI;
	return (deg + 360) % 360;
}

export interface NominalDrop {
	/** Stage in firing order (0 = the first). */
	stage: number;
	/** Null: that stage reaches orbit (no drop). */
	at: LatLon | null;
	downrange: number | null;
}

/**
 * The Launch screen's estimate (ADR 0155 point 6): each spent stage's drop from the cumulative
 * stage Δv along a fixed ascent profile toward `azimuth` (degrees), without the body's turn.
 * The last stage is the vessel and is not dropped. The sim never uses this.
 */
export function nominalDrops(
	stageDeltaV: readonly number[],
	body: { mu: number; radius: number; atmosphereHeight: number },
	site: LatLon,
	azimuth = 90
): NominalDrop[] {
	const top = body.atmosphereHeight > 0 ? body.atmosphereHeight : 70_000;
	const vCirc = Math.sqrt(body.mu / (body.radius + top));
	const out: NominalDrop[] = [];
	let dv = 0;
	for (let k = 0; k < stageDeltaV.length - 1; k++) {
		dv += Math.max(0, stageDeltaV[k]!);
		const speed = Math.max(0, dv - Math.min(0.45 * dv, 1_600));
		const f = Math.min(1, speed / vCirc);
		const h = top * Math.sqrt(f);
		const x0 = h * (0.5 + 1.5 * f);
		const gamma = (50 * (1 - f) * Math.PI) / 180;
		const theta = x0 / body.radius;
		const up = { x: Math.cos(theta), y: Math.sin(theta), z: 0 };
		const fwd = { x: -Math.sin(theta), y: Math.cos(theta), z: 0 };
		const r = scale(up, body.radius + h);
		const v = add(scale(fwd, speed * Math.cos(gamma)), scale(up, speed * Math.sin(gamma)));
		const hit = speed === 0 ? null : conicImpact(body.mu, r, v, body.radius);
		if (!hit && speed > 0) {
			out.push({ stage: k, at: null, downrange: null });
			continue;
		}
		const angle = hit ? Math.atan2(hit.position.y, hit.position.x) : theta;
		const downrange = Math.max(0, angle) * body.radius;
		const [la, lo] = travel(
			site.latitude,
			site.longitude,
			(azimuth * Math.PI) / 180,
			downrange,
			body.radius
		);
		out.push({ stage: k, at: { latitude: la, longitude: lo }, downrange });
	}
	return out;
}

/** Vessels loaded at a site whose ascent azimuth is still to be measured (ADR 0155 point 4). */
export interface SaveRange {
	pending: { vessel: number; site: string }[];
}

export const saveRangeSchema = z.object({
	pending: z.array(z.object({ vessel: z.int().min(0), site: z.string().min(1) }))
});

/** `Snapshot.range` (ADR 0155 point 6). */
export interface RangeSnapshot {
	mode: RangeMode;
	/** The fan of the site the focus left (or the primary site), when its body has water. */
	site?: { id: string; fan: FanArc[] };
	/** Controlled vessels whose next separating stage, fired now, would drop in the wrong place. */
	warnings: Array<{
		vessel: number;
		kind: 'site' | 'land';
		site?: string;
		latitude: number;
		longitude: number;
	}>;
}
