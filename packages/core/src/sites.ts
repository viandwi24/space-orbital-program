/**
 * Sites (plan 084, ADRs 0097 and 0142): world data that says where the Space Center and later bases
 * are. A site's flat zone shapes the terrain; its pads are where vessels are placed.
 */
import * as z from 'zod';
import { LEGACY_TERRAIN_SEED } from './planet-map.ts';
import {
	MAX_TERRAIN_ZONES,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
	type TerrainZone
} from './terrain.ts';
import {
	CELL_SIZE,
	footprint,
	LEGACY_LAYOUT,
	placedBuildingSchema,
	roadsSchema,
	workingLevel,
	type BuildingDefinition
} from './buildings.ts';
import type { WorldInfo } from './world.ts';

/**
 * `space-center` is the HQ, `branch` another space center on the home planet (plan 236, ADR 0229),
 * `base` a site on another body (plan 128), `outpost` a landed vessel's.
 */
export const SITE_KINDS = ['space-center', 'branch', 'base', 'outpost'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** A pad: metres east and north of the site centre on its tangent plane. */
export const sitePadSchema = z.object({ east: z.number(), north: z.number() });

export const siteSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	/** Body the site is on. */
	body: z.string().min(1),
	kind: z.enum(SITE_KINDS),
	/** Centre, rad, body-fixed (+Y north, longitude 0 on +X). */
	latitude: z
		.number()
		.min(-Math.PI / 2)
		.max(Math.PI / 2),
	longitude: z.number().refine(Number.isFinite, 'expected a finite number'),
	/** Exactly flat within this many metres of arc, then blended to the terrain over `blendWidth`. */
	flatRadius: z.number().positive(),
	blendWidth: z.number().positive(),
	pads: z.array(sitePadSchema).min(1),
	/** Placed buildings and road cells (plan 090, ADR 0115); absent = none. */
	buildings: z.array(placedBuildingSchema).optional(),
	roads: roadsSchema.optional(),
	/** Landed vessels that are outposts of this site (plan 128, ADR 0125 point 4); absent = none. */
	members: z.array(z.int().nonnegative()).optional()
});

export type Site = z.infer<typeof siteSchema>;
export type SitePad = z.infer<typeof sitePadSchema>;

/** The Legacy site (ADR 0142 point 1): today's launch site at (0, 0), its pad at the centre. */
export const LEGACY_SITE: Site = {
	id: 'legacy',
	name: 'Space Center',
	body: 'stock.home',
	kind: 'space-center',
	latitude: 0,
	longitude: 0,
	flatRadius: SITE_FLAT_RADIUS,
	blendWidth: SITE_BLEND_WIDTH,
	pads: [{ east: 0, north: 0 }],
	buildings: LEGACY_LAYOUT.buildings,
	roads: LEGACY_LAYOUT.roads
};

/** A world's sites; a world without any (format-5 saves from before plan 084) has the Legacy site. */
export const sitesOf = (info: Pick<WorldInfo, 'sites'>): readonly Site[] =>
	info.sites.length > 0 ? info.sites : [LEGACY_SITE];

/** The terrain seed of a world: the Legacy seed for the Legacy world, else the world seed (ADR 0142 point 2). */
export const terrainSeedOf = (info: Pick<WorldInfo, 'id' | 'seed'>): number =>
	info.id === 'legacy' ? LEGACY_TERRAIN_SEED : info.seed;

/**
 * The flat zones on a body, in site order (the first site on the body is its primary zone).
 * Throws when a body has more than `MAX_TERRAIN_ZONES` sites (ADR 0142 point 4).
 */
export function zonesOf(sites: readonly Site[], body: string): TerrainZone[] {
	const zones = sites
		.filter((s) => s.body === body)
		.map((s) => ({
			latitude: s.latitude,
			longitude: s.longitude,
			flatRadius: s.flatRadius,
			blendWidth: s.blendWidth
		}));
	if (zones.length > MAX_TERRAIN_ZONES) {
		throw new RangeError(`body ${body} has ${zones.length} sites; at most ${MAX_TERRAIN_ZONES}`);
	}
	return zones;
}

/**
 * Latitude and longitude of a pad of a site on a body of `radius` m: the pad's east and north
 * metres turned into angles at the site (pads lie within a few km, where this is exact to millimetres).
 */
export function padLatLon(site: Site, pad: SitePad, radius: number): [number, number] {
	const latitude = site.latitude + pad.north / radius;
	const longitude = site.longitude + pad.east / (radius * Math.max(Math.cos(site.latitude), 1e-6));
	return [latitude, longitude];
}

/**
 * Where a vessel stands when no spot was chosen (a quick launch, a script): the centre of the
 * site's first working pad, or runway for an aircraft, as the Launch screen places it; else the
 * site's first pad. A world made from a site template has its site far from (0, 0), so a launch
 * without a spot must still start here, where the Space Center and its station are.
 */
export function defaultLaunchSpot(
	site: Pick<Site, 'buildings' | 'pads'>,
	registry: {
		get(kind: string): Pick<BuildingDefinition, 'size' | 'provides'> | undefined;
	},
	aircraft = false
): SitePad {
	const want = aircraft ? 'runway' : 'launch-pad';
	let fallback: SitePad | undefined;
	for (const b of site.buildings ?? []) {
		if (workingLevel(b) === null) continue;
		const def = registry.get(b.kind);
		if (!def || !(def.provides.includes('launch-pad') || def.provides.includes('runway'))) continue;
		const cells = footprint(def.size, b.cell, b.rotation);
		const spot = {
			east: (cells.reduce((s, c) => s + c.i, 0) / cells.length) * CELL_SIZE,
			north: (cells.reduce((s, c) => s + c.j, 0) / cells.length) * CELL_SIZE
		};
		if (def.provides.includes(want)) return spot;
		fallback ??= spot;
	}
	return fallback ?? site.pads[0] ?? { east: 0, north: 0 };
}

/**
 * The home body among `bodies` (plan 122, ADR 0119 point 1): the primary site's body when it is
 * one of them, else the first body that is not a star and orbits a star or nothing. Hosts with
 * the sim's catalog use its `home`; this is the same rule for a catalog loaded without a sim.
 */
export function homeBodyOf<
	T extends { id: string; parent?: string | undefined; star?: boolean | undefined }
>(bodies: readonly T[], info?: Pick<WorldInfo, 'sites'>): T | undefined {
	const site = sitesOf(info ?? { sites: [] })[0]?.body;
	const bySite = site === undefined ? undefined : bodies.find((b) => b.id === site);
	if (bySite) return bySite;
	const byId = new Map(bodies.map((b) => [b.id, b]));
	return (
		bodies.find((b) => !b.star && (b.parent === undefined || byId.get(b.parent)?.star === true)) ??
		bodies[0]
	);
}
