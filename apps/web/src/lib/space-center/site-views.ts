/**
 * The renderer's building list for a site (plan 091, ADR 0117), shared by the Space Center and
 * Flight so the launch site shows the buildings the player built. Pure, so vitest covers it.
 */
import type { BuildingDefinition, Site, Snapshot } from '@orbital/core';
import type { SiteBuildingView, SitePlace } from '@orbital/renderer';

export interface BuildingLookup {
	get(id: string): BuildingDefinition | undefined;
	list(): BuildingDefinition[];
}

type SiteState = NonNullable<Snapshot['sites']>[number];

/**
 * How far a building's construction is, 0 to 1, in twentieths (the site is redrawn when it moves
 * on), or undefined when the building stands (plan 388). A planned one has not begun.
 */
export function constructionOf(
	b: { state: string; readyDay?: number },
	def: Pick<BuildingDefinition, 'levels'>,
	today: number | undefined
): number | undefined {
	if (b.state === 'planned') return 0;
	if (b.state !== 'building') return undefined;
	const total = def.levels[0]?.buildDays ?? 0;
	if (b.readyDay === undefined || today === undefined || total <= 0) return 0;
	const done = Math.min(1, Math.max(0, 1 - (b.readyDay - today) / total));
	return Math.floor(done * 20) / 20;
}

/** The renderer's building list for a site; `today` (the tick day) gives the construction's progress. */
export function siteViews(
	site: SiteState | undefined,
	registry: BuildingLookup,
	today?: number
): SiteBuildingView[] {
	if (!site) return [];
	return site.buildings.flatMap((b) => {
		const def = registry.get(b.kind);
		if (!def) return [];
		const construction = constructionOf(b, def, today);
		return [
			{
				id: b.id,
				generator: def.visual.kind === 'generator' ? def.visual.generator : 'block',
				size: { ...def.size },
				cell: { ...b.cell },
				rotation: b.rotation,
				...(construction !== undefined ? { construction } : {})
			}
		];
	});
}

/** One site's buildings for the renderer, with its place (plan 384, ADR 0321). */
export interface SiteDraw {
	place: SitePlace;
	views: SiteBuildingView[];
	roads: { i: number; j: number }[];
}

/** A world site's place for the renderer. */
export const sitePlace = (site: Pick<Site, 'id' | 'latitude' | 'longitude'>): SitePlace => ({
	id: site.id,
	latitude: site.latitude,
	longitude: site.longitude
});

/**
 * Every space center on the home body (the HQ and its branches), each at its own place, as the
 * running sim has its buildings (plan 384, ADR 0321). A base on another body is not drawn here.
 */
export function homeSiteDraws(
	snapshot: Pick<Snapshot, 'sites' | 'day'>,
	sites: readonly Pick<Site, 'id' | 'body' | 'latitude' | 'longitude'>[],
	registry: BuildingLookup,
	homeBody: string | undefined
): SiteDraw[] {
	const out: SiteDraw[] = [];
	for (const live of snapshot.sites ?? []) {
		const site = sites.find((x) => x.id === live.id);
		if (!site || (homeBody !== undefined && site.body !== homeBody)) continue;
		out.push({
			place: sitePlace(site),
			views: siteViews(live, registry, snapshot.day),
			roads: live.roads ?? []
		});
	}
	return out;
}

/**
 * The bases on other bodies (plan 386), each at its own place on its body: the renderer stands them
 * on that body's flat ground and carries them with it. Home sites are `homeSiteDraws`.
 */
export function offWorldSiteDraws(
	snapshot: Pick<Snapshot, 'sites' | 'day'>,
	sites: readonly Pick<Site, 'id' | 'body' | 'latitude' | 'longitude'>[],
	registry: BuildingLookup,
	homeBody: string | undefined
): SiteDraw[] {
	const out: SiteDraw[] = [];
	for (const live of snapshot.sites ?? []) {
		const site = sites.find((x) => x.id === live.id);
		if (!site || homeBody === undefined || site.body === homeBody) continue;
		out.push({
			place: { ...sitePlace(site), body: site.body },
			views: siteViews(live, registry, snapshot.day),
			roads: live.roads ?? []
		});
	}
	return out;
}
