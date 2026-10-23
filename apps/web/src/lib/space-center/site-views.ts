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

/** The renderer's building list for a site. */
export function siteViews(
	site: SiteState | undefined,
	registry: BuildingLookup
): SiteBuildingView[] {
	if (!site) return [];
	return site.buildings.flatMap((b) => {
		const def = registry.get(b.kind);
		if (!def) return [];
		return [
			{
				id: b.id,
				generator: def.visual.kind === 'generator' ? def.visual.generator : 'block',
				size: { ...def.size },
				cell: { ...b.cell },
				rotation: b.rotation
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
	snapshot: Pick<Snapshot, 'sites'>,
	sites: readonly Pick<Site, 'id' | 'body' | 'latitude' | 'longitude'>[],
	registry: BuildingLookup,
	homeBody: string | undefined
): SiteDraw[] {
	const out: SiteDraw[] = [];
	for (const live of snapshot.sites ?? []) {
		const site = sites.find((x) => x.id === live.id);
		if (!site || (homeBody !== undefined && site.body !== homeBody)) continue;
		out.push({ place: sitePlace(site), views: siteViews(live, registry), roads: live.roads ?? [] });
	}
	return out;
}
