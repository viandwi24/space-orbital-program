/**
 * Site templates (plan 092, ADRs 0097 and 0177): criteria for a quick-start site, a deterministic
 * resolver over a world's terrain seed, and the consequences of a site's place. Environment-neutral.
 */
import * as z from 'zod';
import { cachedPlanetMap, sampleMap, type PlanetMap } from './planet-map.ts';
import { definitionIdSchema } from './schemas.ts';
import {
	latLonDirection,
	TERRAIN_MAP_WIDTH,
	TERRAIN_SHAPE,
	terrainShift,
	warpedLatLon
} from './terrain.ts';

export interface SiteTemplateCriteria {
	/** |latitude| band, rad. */
	absLatitude: readonly [number, number];
	/** Sea within `seaDistance` to the east: launches go downrange over water. */
	seaEast?: boolean;
	/** No sea within `seaDistance` in eight directions. */
	inland?: boolean;
	/** Sea within `seaDistance` in the four cardinal directions. */
	island?: boolean;
	/** Biome map elevation at least this (0..1; sea level is 0.46). */
	minElevation?: number;
	/** m, default 300 000. */
	seaDistance?: number;
}

export interface SiteTemplateDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	description?: string;
	criteria: SiteTemplateCriteria;
}

const DEG = Math.PI / 180;

export const siteTemplateDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	description: z.string().optional(),
	criteria: z
		.object({
			absLatitude: z.tuple([
				z
					.number()
					.min(0)
					.max(Math.PI / 2),
				z
					.number()
					.min(0)
					.max(Math.PI / 2)
			]),
			seaEast: z.boolean().optional(),
			inland: z.boolean().optional(),
			island: z.boolean().optional(),
			minElevation: z.number().min(0).max(1).optional(),
			seaDistance: z.number().positive().optional()
		})
		.refine((c) => c.absLatitude[0] <= c.absLatitude[1], 'absLatitude must be [min, max]')
		.refine(
			(c) => !(c.seaEast && c.inland) && !(c.island && c.inland),
			'inland excludes seaEast and island'
		)
});

/** The soft criteria, dropped in this order when no spot meets them all (ADR 0177 point 3). */
export const RELAX_ORDER = ['island', 'seaEast', 'inland', 'minElevation'] as const;
export type SoftCriterion = (typeof RELAX_ORDER)[number];

export interface ResolvedSite {
	latitude: number;
	longitude: number;
	/** Criteria dropped to find a spot. */
	relaxed: SoftCriterion[];
}

/** What a resolution reads: the world's terrain seed and the body's radius. */
export interface TerrainProbe {
	seed: number;
	radius: number;
}

interface Probe {
	map: PlanetMap;
	shift: number;
	radius: number;
}

const probeOf = (t: TerrainProbe): Probe => ({
	// The map without zones: a zone clears its spot to grass, which would hide coasts and sea.
	map: cachedPlanetMap(TERRAIN_MAP_WIDTH, { seed: t.seed, zones: [] }),
	shift: terrainShift(t.seed),
	radius: t.radius
});

/** Biome map elevation at a latitude and longitude, read where the terrain reads it (the warped spot). */
function elevationAt(p: Probe, latitude: number, longitude: number): number {
	const [la, lo] = warpedLatLon(latLonDirection(latitude, longitude), p.radius, p.shift);
	return sampleMap(p.map, la, lo)[0];
}

const isLand = (p: Probe, la: number, lo: number): boolean =>
	elevationAt(p, la, lo) >= TERRAIN_SHAPE.landFull;
const isSea = (p: Probe, la: number, lo: number): boolean =>
	elevationAt(p, la, lo) < TERRAIN_SHAPE.landStart;

/** What the ground is at a spot (plan 236's branch picker): sea, coast or land, and its map elevation 0..1. */
export interface TerrainReadout {
	ground: 'sea' | 'coast' | 'land';
	elevation: number;
}

/** The terrain at a latitude and longitude, read where the terrain reads it (the same probe as the templates). */
export function terrainReadout(
	latitude: number,
	longitude: number,
	terrain: TerrainProbe
): TerrainReadout {
	const p = probeOf(terrain);
	const elevation = elevationAt(p, latitude, longitude);
	return {
		ground: isSea(p, latitude, longitude)
			? 'sea'
			: isLand(p, latitude, longitude)
				? 'land'
				: 'coast',
		elevation
	};
}

/** The point `distance` m from (la, lo) along `bearing` (rad from north, east positive). */
export function travel(
	la: number,
	lo: number,
	bearing: number,
	distance: number,
	radius: number
): [number, number] {
	const d = distance / radius;
	const lat2 = Math.asin(
		Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(bearing)
	);
	const lon2 =
		lo +
		Math.atan2(
			Math.sin(bearing) * Math.sin(d) * Math.cos(la),
			Math.cos(d) - Math.sin(la) * Math.sin(lat2)
		);
	return [lat2, lon2];
}

/** Whether sea lies within `distance` along `bearing` (samples every 25 km). */
function seaAlong(p: Probe, la: number, lo: number, bearing: number, distance: number): boolean {
	for (let s = 25_000; s <= distance; s += 25_000) {
		const [a, b] = travel(la, lo, bearing, s, p.radius);
		if (isSea(p, a, b)) return true;
	}
	return false;
}

const FLAT_PROBE = 8_000; // m: the flat radius plus a margin, all land

function meets(
	p: Probe,
	la: number,
	lo: number,
	c: SiteTemplateCriteria,
	dropped: ReadonlySet<SoftCriterion>
): boolean {
	if (!isLand(p, la, lo)) return false;
	for (let k = 0; k < 8; k++) {
		const [a, b] = travel(la, lo, (k * Math.PI) / 4, FLAT_PROBE, p.radius);
		if (!isLand(p, a, b)) return false;
	}
	const dist = c.seaDistance ?? 300_000;
	if (
		c.minElevation !== undefined &&
		!dropped.has('minElevation') &&
		elevationAt(p, la, lo) < c.minElevation
	)
		return false;
	if (c.seaEast && !dropped.has('seaEast') && !seaAlong(p, la, lo, Math.PI / 2, dist)) return false;
	if (c.island && !dropped.has('island')) {
		for (let k = 0; k < 4; k++) if (!seaAlong(p, la, lo, (k * Math.PI) / 2, dist)) return false;
	}
	if (c.inland && !dropped.has('inland')) {
		for (let k = 0; k < 8; k++) if (seaAlong(p, la, lo, (k * Math.PI) / 4, dist)) return false;
	}
	return true;
}

/** Lower is better: near the middle of the band, then near longitude 0 (ADR 0177 point 3). */
function score(c: SiteTemplateCriteria, la: number, lo: number): number {
	const mid = (c.absLatitude[0] + c.absLatitude[1]) / 2;
	return Math.abs(Math.abs(la) - mid) * 4 + Math.abs(lo) / Math.PI;
}

/**
 * The template's spot on a world (ADR 0177 point 3): a coarse grid (1° × 2°) in the band, both
 * hemispheres, then a 0.1° refinement around the best. Soft criteria are dropped in `RELAX_ORDER`
 * until a spot exists; the band and land are always kept. Deterministic from the seed.
 */
export function resolveSiteTemplate(
	template: Pick<SiteTemplateDefinition, 'criteria'>,
	terrain: TerrainProbe
): ResolvedSite {
	const c = template.criteria;
	const p = probeOf(terrain);
	const [lo0, hi0] = c.absLatitude;
	const relaxed: SoftCriterion[] = [];
	const dropped = new Set<SoftCriterion>();
	for (let round = 0; round <= RELAX_ORDER.length; round++) {
		let best: { la: number; lo: number; s: number } | undefined;
		for (let a = Math.ceil(lo0 / DEG); a <= Math.floor(hi0 / DEG); a++) {
			for (const sign of a === 0 ? [1] : [1, -1]) {
				const la = sign * a * DEG;
				for (let b = -180; b < 180; b += 2) {
					const lo = b * DEG;
					if (!meets(p, la, lo, c, dropped)) continue;
					const s = score(c, la, lo);
					if (!best || s < best.s) best = { la, lo, s };
				}
			}
		}
		if (best) {
			let fine = best;
			for (let i = -10; i <= 10; i++) {
				for (let j = -20; j <= 20; j++) {
					const la = best.la + i * 0.1 * DEG;
					const lo = best.lo + j * 0.1 * DEG;
					if (Math.abs(la) < lo0 || Math.abs(la) > hi0) continue;
					if (!meets(p, la, lo, c, dropped)) continue;
					const s = score(c, la, lo);
					if (s < fine.s) fine = { la, lo, s };
				}
			}
			return { latitude: fine.la, longitude: fine.lo, relaxed };
		}
		const next = RELAX_ORDER.find((k) => !dropped.has(k) && c[k] !== undefined && c[k] !== false);
		if (!next) break;
		dropped.add(next);
		relaxed.push(next);
	}
	throw new RangeError('resolveSiteTemplate: no land in the latitude band');
}

export type Downrange = 'sea' | 'land' | 'mixed';

export interface SiteConsequences {
	/** Eastward speed the ground gives a launch, m/s: ω R cos φ. */
	rotationBoost: number;
	/** Lowest inclination reachable without a plane change, rad: |φ|. */
	minInclination: number;
	/** What lies east of the site out to 1 000 km. */
	downrange: Downrange;
	/** Great-circle distance to the nearest other site on the body, m (null when there is none). */
	nearestSite: number | null;
}

/** Downrange east: every 25 km sample sea, every one land, or both (ADR 0177 point 4). */
export function downrangeEast(
	latitude: number,
	longitude: number,
	terrain: TerrainProbe,
	distance = 1_000_000
): Downrange {
	const p = probeOf(terrain);
	let sea = 0;
	let land = 0;
	for (let s = 25_000; s <= distance; s += 25_000) {
		const [a, b] = travel(latitude, longitude, Math.PI / 2, s, p.radius);
		if (isSea(p, a, b)) sea++;
		else land++;
	}
	return sea === 0 ? 'land' : land === 0 ? 'sea' : 'mixed';
}

const arc = (
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number }
): number => {
	const u = latLonDirection(a.latitude, a.longitude);
	const v = latLonDirection(b.latitude, b.longitude);
	return Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y + u.z * v.z)));
};

/** The consequences of a site's place (ADR 0177 point 4). */
export function siteConsequences(
	site: { latitude: number; longitude: number },
	body: { radius: number; rotationPeriod: number },
	seed: number,
	others: ReadonlyArray<{ latitude: number; longitude: number }> = []
): SiteConsequences {
	const omega = (2 * Math.PI) / body.rotationPeriod;
	const nearest =
		others.length === 0 ? null : Math.min(...others.map((o) => arc(site, o) * body.radius));
	return {
		rotationBoost: omega * body.radius * Math.cos(site.latitude),
		minInclination: Math.abs(site.latitude),
		downrange: downrangeEast(site.latitude, site.longitude, { seed, radius: body.radius }),
		nearestSite: nearest
	};
}

/** Great-circle distance between two sites on a body of `radius`, m. */
export const siteDistance = (
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number },
	radius: number
): number => arc(a, b) * radius;
