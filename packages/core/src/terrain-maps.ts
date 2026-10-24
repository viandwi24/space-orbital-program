/**
 * The maps of mod planets (plan 406, ADR 0346): a hills body whose `terrain.map` names an image in
 * its mod's package gets that image as its biome map, so the sim's ground and the renderer's bake
 * read the same data. The host (the sim Worker and the page) calls `installTerrainMaps` once per
 * world, before the sim or the renderer asks for a ground.
 */
import { decodePng } from './png.ts';
import { clearMapOverrides, setMapOverride } from './planet-map.ts';
import { loadPlugins, type Plugin } from './plugin.ts';
import type { PlanetMap } from './planet-map.ts';

/** The widths a map may have: twice as wide as high, within these sides. */
export const TERRAIN_MAP_MIN = 128;
export const TERRAIN_MAP_MAX = 4096;

/** Checks a decoded image as a planet map; a string is the reason it is not one. */
export function checkTerrainMap(image: { width: number; height: number }): string | undefined {
	if (image.width !== image.height * 2)
		return `a ${image.width} x ${image.height} map is not twice as wide as it is high`;
	if (image.width < TERRAIN_MAP_MIN || image.width > TERRAIN_MAP_MAX)
		return `a ${image.width} texel wide map is outside ${TERRAIN_MAP_MIN} to ${TERRAIN_MAP_MAX}`;
	return undefined;
}

export interface TerrainMapProblem {
	mod: string;
	body: string;
	path: string;
	message: string;
}

/**
 * Decodes every hills body's `terrain.map` of the mods and makes it that terrain seed's map. A map
 * that is missing or not readable leaves the body with its generated continents and is reported;
 * nothing throws. `assets`: each mod's decoded files by mod id then path (`resolveMods`'s).
 */
export async function installTerrainMaps(
	plugins: readonly Plugin[],
	assets: ReadonlyMap<string, ReadonlyMap<string, { bytes: Uint8Array }>>
): Promise<TerrainMapProblem[]> {
	clearMapOverrides();
	const problems: TerrainMapProblem[] = [];
	let loaded;
	try {
		loaded = loadPlugins(plugins);
	} catch {
		return problems;
	}
	const owner = new Map(loaded.report.registered.body.map((b) => [b.id, b.by]));
	for (const body of loaded.registries.bodies.list()) {
		const t = body.terrain;
		if (t?.kind !== 'hills' || t.map === undefined || t.seed === undefined) continue;
		const mod = owner.get(body.id) ?? '';
		const fail = (message: string): void => {
			problems.push({ mod, body: body.id, path: t.map!, message });
		};
		const file = assets.get(mod)?.get(t.map);
		if (!file) {
			fail('the image is not in the mod package');
			continue;
		}
		const image = await decodePng(file.bytes);
		if (typeof image === 'string') {
			fail(image);
			continue;
		}
		const bad = checkTerrainMap(image);
		if (bad) {
			fail(bad);
			continue;
		}
		const map: PlanetMap = { width: image.width, height: image.height, data: image.data };
		setMapOverride(t.seed, map);
	}
	return problems;
}
