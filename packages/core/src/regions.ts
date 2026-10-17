/**
 * Science regions on bodies (plan 104, ADR 0180): the biome classes of the planet map, seeded
 * cells, or latitude bands. Pure functions of the body definition and the world's terrain.
 */
import type { BodyDefinition } from './definitions.ts';
import type { Vec3 } from './math.ts';
import {
	classifyBiome,
	cachedPlanetMap,
	LEGACY_TERRAIN_SEED,
	sampleMap,
	type Biome
} from './planet-map.ts';
import { createRng } from './rng.ts';
import { GLOBAL_REGION } from './science.ts';
import { TERRAIN_MAP_WIDTH, terrainShift, warpedLatLon, type TerrainZone } from './terrain.ts';

export type BodyRegions = NonNullable<BodyDefinition['regions']>;

export interface RegionInfo {
	id: string;
	label: string;
	multiplier: number;
}

/** The world's part of a biome map: its terrain seed and the sites on the body (ADR 0142). */
export interface RegionWorld {
	seed?: number;
	zones?: readonly TerrainZone[];
}

const BIOMES: ReadonlyArray<[Biome, string]> = [
	['ocean', 'Ocean'],
	['beach', 'Shores'],
	['grass', 'Grasslands'],
	['forest', 'Forests'],
	['desert', 'Deserts'],
	['rock', 'Mountains'],
	['snow', 'Ice caps']
];

/** Every region of a body, in a fixed order; `[global]` without regions. */
export function regionsOf(body: Pick<BodyDefinition, 'regions'>): RegionInfo[] {
	const r = body.regions;
	if (!r) return [{ id: GLOBAL_REGION, label: 'Global', multiplier: 1 }];
	switch (r.kind) {
		case 'biomes':
			return BIOMES.map(([id, label]) => {
				const o = r.regions?.find((x) => x.id === id);
				return { id, label: o?.label ?? label, multiplier: o?.multiplier ?? 1 };
			});
		case 'cells':
			return r.regions.map((x) => ({ id: x.id, label: x.label, multiplier: x.multiplier ?? 1 }));
		case 'bands':
			return [
				...r.bands.map((x) => ({ id: x.id, label: x.label, multiplier: x.multiplier ?? 1 })),
				{ id: GLOBAL_REGION, label: 'Global', multiplier: 1 }
			];
	}
}

const cellCache = new Map<string, Vec3[]>();

/** The seed points of a `cells` body: uniform on the sphere from the seed. */
export function cellPoints(seed: number, count: number): Vec3[] {
	const key = `${seed}|${count}`;
	let points = cellCache.get(key);
	if (!points) {
		const rng = createRng(seed);
		points = [];
		for (let k = 0; k < count; k++) {
			const y = rng.range(-1, 1);
			const a = rng.range(0, 2 * Math.PI);
			const r = Math.sqrt(1 - y * y);
			points.push({ x: r * Math.cos(a), y, z: r * Math.sin(a) });
		}
		cellCache.set(key, points);
	}
	return points;
}

/**
 * The region id under the body-fixed unit direction `d` (ADR 0180 point 1). On a `biomes` body it
 * is the biome the ground shader colours there: the same map, read at the same warped coordinates.
 */
export function regionAt(
	body: Pick<BodyDefinition, 'regions' | 'radius'>,
	d: Vec3,
	world: RegionWorld = {}
): string {
	const r = body.regions;
	if (!r) return GLOBAL_REGION;
	const latitude = Math.asin(Math.max(-1, Math.min(1, d.y)));
	switch (r.kind) {
		case 'biomes': {
			const map = cachedPlanetMap(TERRAIN_MAP_WIDTH, {
				...(world.seed === undefined ? {} : { seed: world.seed }),
				...(world.zones && world.zones.length > 0 ? { zones: world.zones } : {})
			});
			// where the ground shader reads the map: the warped latitude and longitude (ADR 0043)
			const [lat, lon] = warpedLatLon(
				d,
				body.radius,
				terrainShift(world.seed ?? LEGACY_TERRAIN_SEED)
			);
			const [e, m, t, k] = sampleMap(map, lat, lon);
			return classifyBiome(e, m, t, k);
		}
		case 'cells': {
			const points = cellPoints(r.seed, r.cells ?? 4 * r.regions.length);
			let best = 0;
			let bestDot = -Infinity;
			points.forEach((p, k) => {
				const dot = p.x * d.x + p.y * d.y + p.z * d.z;
				if (dot > bestDot) {
					bestDot = dot;
					best = k;
				}
			});
			return r.regions[best % r.regions.length]!.id;
		}
		case 'bands':
			return (
				r.bands.find(
					(b) => latitude >= Math.min(b.from, b.to) && latitude <= Math.max(b.from, b.to)
				)?.id ?? GLOBAL_REGION
			);
	}
}

/** The multiplier of a region of a body (1 when unknown). */
export const regionMultiplier = (body: Pick<BodyDefinition, 'regions'>, region: string): number =>
	regionsOf(body).find((r) => r.id === region)?.multiplier ?? 1;
