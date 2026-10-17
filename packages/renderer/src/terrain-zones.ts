/**
 * The world's terrain on the GPU (plan 084, ADR 0142): the uniforms of `terrainZonesGLSL` and the
 * seed's lattice shift, filled from the same seed and zones the core height function uses.
 */
import {
	LEGACY_TERRAIN_SEED,
	LEGACY_ZONE,
	MAX_TERRAIN_ZONES,
	checkTerrainZones,
	latLonDirection,
	terrainShift,
	type TerrainZone
} from '@orbital/core';
import { Uniform, Vector4 } from 'three';

/** A world's home terrain: its seed and flat zones (primary site first). */
export interface WorldTerrainSpec {
	seed: number;
	zones: readonly TerrainZone[];
}

export const LEGACY_TERRAIN: WorldTerrainSpec = { seed: LEGACY_TERRAIN_SEED, zones: [LEGACY_ZONE] };

export interface ZoneUniforms {
	uZones: Uniform<Vector4[]>;
	uZoneBlend: Uniform<number[]>;
	uZoneCount: Uniform<number>;
	uTerrainShift: Uniform<number>;
}

/** Fresh uniforms holding `terrain` (default the Legacy terrain). */
export function zoneUniforms(terrain: WorldTerrainSpec = LEGACY_TERRAIN): ZoneUniforms {
	const u: ZoneUniforms = {
		uZones: new Uniform(Array.from({ length: MAX_TERRAIN_ZONES }, () => new Vector4())),
		uZoneBlend: new Uniform(new Array<number>(MAX_TERRAIN_ZONES).fill(0)),
		uZoneCount: new Uniform(0),
		uTerrainShift: new Uniform(0)
	};
	setZoneUniforms(u, terrain);
	return u;
}

/** Writes `terrain` into uniforms made by `zoneUniforms` (or a material's copies of them). */
export function setZoneUniforms(u: ZoneUniforms, terrain: WorldTerrainSpec): void {
	checkTerrainZones(terrain.zones);
	terrain.zones.forEach((z, i) => {
		const d = latLonDirection(z.latitude, z.longitude);
		u.uZones.value[i]!.set(d.x, d.y, d.z, z.flatRadius);
		u.uZoneBlend.value[i] = z.blendWidth;
	});
	u.uZoneCount.value = terrain.zones.length;
	u.uTerrainShift.value = terrainShift(terrain.seed);
}
