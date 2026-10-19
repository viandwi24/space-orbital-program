/**
 * Founding a branch space center (plan 236, ADR 0229): the picker's map of the home planet, what a
 * spot means and why it is refused, the rules `found-branch` checks in the sim. Pure.
 */
import {
	MAX_TERRAIN_ZONES,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
	siteConsequences,
	siteDistance,
	terrainReadout,
	type BuildingDefinition,
	type Site,
	type SiteConsequences,
	type TerrainProbe,
	type TerrainReadout
} from '@orbital/core';

/** The picker map's size, px: equirectangular, longitude 0 in the middle. */
export const MAP_WIDTH = 360;
export const MAP_HEIGHT = 180;

/** Pixel to latitude and longitude, rad (centre of the pixel). */
export const mapToLatLon = (x: number, y: number, w = MAP_WIDTH, h = MAP_HEIGHT) => ({
	latitude: (0.5 - (y + 0.5) / h) * Math.PI,
	longitude: ((x + 0.5) / w - 0.5) * 2 * Math.PI
});
/** Latitude and longitude to the map, px. */
export const latLonToMap = (latitude: number, longitude: number, w = MAP_WIDTH, h = MAP_HEIGHT) => {
	const lon = ((((longitude + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
	return { x: (lon / (2 * Math.PI) + 0.5) * w, y: (0.5 - latitude / Math.PI) * h };
};

const SEA: readonly [number, number, number] = [32, 58, 92];
const COAST: readonly [number, number, number] = [196, 182, 128];
/** Land shades from the lowland green to the highland grey by elevation. */
const LOW: readonly [number, number, number] = [74, 112, 64];
const HIGH: readonly [number, number, number] = [150, 146, 136];

/** The RGBA pixels of the map (row 0 is the north). */
export function branchMapPixels(
	terrain: TerrainProbe,
	w = MAP_WIDTH,
	h = MAP_HEIGHT,
	/** Sites whose flat zone and blend are drawn as land (the ground there is shaped to it). */
	zones: readonly Pick<Site, 'latitude' | 'longitude' | 'flatRadius' | 'blendWidth'>[] = []
): Uint8ClampedArray<ArrayBuffer> {
	const out = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const { latitude, longitude } = mapToLatLon(x, y, w, h);
			const r = terrainReadout(latitude, longitude, terrain);
			const shaped = zones.some(
				(z) =>
					siteDistance(z, { latitude, longitude }, terrain.radius) <= z.flatRadius + z.blendWidth
			);
			let c: readonly number[];
			if (shaped) c = LOW;
			else if (r.ground === 'sea') c = SEA;
			else if (r.ground === 'coast') c = COAST;
			else {
				const k = Math.min(1, Math.max(0, (r.elevation - 0.5) / 0.4));
				c = LOW.map((v, i) => v + (HIGH[i]! - v) * k);
			}
			const o = (y * w + x) * 4;
			out[o] = c[0]!;
			out[o + 1] = c[1]!;
			out[o + 2] = c[2]!;
			out[o + 3] = 255;
		}
	return out;
}

/** The closest a new site's centre may come to a site, m (the zones and blends must not meet). */
export const keepOut = (s: Pick<Site, 'flatRadius' | 'blendWidth'>): number =>
	SITE_FLAT_RADIUS + SITE_BLEND_WIDTH + s.flatRadius + s.blendWidth;

export interface BranchSpot {
	latitude: number;
	longitude: number;
	terrain: TerrainReadout;
	consequences: SiteConsequences;
	/** Why `found-branch` would refuse it, in words, or null. */
	problem: string | null;
}

export interface BranchContext {
	/** The world's sites on every body. */
	sites: readonly Site[];
	home: { id: string; radius: number; rotationPeriod: number };
	terrain: TerrainProbe;
	hq: Pick<BuildingDefinition, 'levels'> | undefined;
	/** Funds with the economy on, else undefined. */
	funds?: number;
}

/** A spot on the home planet: what it is and the first rule it breaks. */
export function branchSpot(latitude: number, longitude: number, ctx: BranchContext): BranchSpot {
	const here = { latitude, longitude };
	const onHome = ctx.sites.filter((s) => s.body === ctx.home.id);
	const terrain = terrainReadout(latitude, longitude, ctx.terrain);
	const consequences = siteConsequences(here, ctx.home, ctx.terrain.seed, onHome);
	const cost = ctx.hq?.levels[0]?.cost ?? 0;
	let problem: string | null = null;
	const near = onHome.find((s) => siteDistance(s, here, ctx.home.radius) < keepOut(s));
	if (!ctx.hq) problem = 'No branch HQ building is loaded';
	else if (onHome.length >= MAX_TERRAIN_ZONES)
		problem = `The home planet has ${onHome.length} sites, the most it takes`;
	else if (near)
		problem = `Too close to ${near.name} (${Math.round(siteDistance(near, here, ctx.home.radius) / 1000)} km; at least ${Math.ceil(keepOut(near) / 1000)} km)`;
	// read without the zones, which flatten a site's spot to land (the sites are checked first)
	else if (terrain.ground === 'sea') problem = 'On the sea: a branch needs land';
	else if (ctx.funds !== undefined && cost > ctx.funds)
		problem = `Needs ${Math.round(cost).toLocaleString('en-US')} funds, ${Math.round(Math.max(0, ctx.funds)).toLocaleString('en-US')} available`;
	return { latitude, longitude, terrain, consequences, problem };
}

/** A new site id that is not taken: `branch-1`, `branch-2`, ... */
export function branchId(sites: readonly Pick<Site, 'id'>[]): string {
	for (let n = 1; ; n++) if (!sites.some((s) => s.id === `branch-${n}`)) return `branch-${n}`;
}

/** `12.3° N, 45.6° W`. */
export function latLonText(latitude: number, longitude: number): string {
	const d = (r: number) => ((Math.abs(r) * 180) / Math.PI).toFixed(1);
	return `${d(latitude)}° ${latitude >= 0 ? 'N' : 'S'}, ${d(longitude)}° ${longitude >= 0 ? 'E' : 'W'}`;
}

/** The sites for the switcher and the Mission Center: kind in words and whether it is a station. */
export interface SiteRow {
	id: string;
	name: string;
	kind: string;
	place: string;
	station: string;
}

const KIND_TEXT: Record<Site['kind'], string> = {
	'space-center': 'Headquarters',
	branch: 'Branch',
	base: 'Base',
	outpost: 'Outpost'
};

export function siteRows(
	sites: readonly Site[],
	stations: readonly { id: string; range: number }[] | undefined,
	bodyName: (id: string) => string
): SiteRow[] {
	return sites.map((s) => {
		const station = stations?.find((x) => x.id === `site:${s.id}`);
		return {
			id: s.id,
			name: s.name,
			kind: KIND_TEXT[s.kind],
			place: `${bodyName(s.body)} · ${latLonText(s.latitude, s.longitude)}`,
			station:
				stations === undefined
					? 'Comms off'
					: station
						? `Ground station · ${Math.round(station.range / 1000).toLocaleString('en-US')} km`
						: 'No ground station'
		};
	});
}
