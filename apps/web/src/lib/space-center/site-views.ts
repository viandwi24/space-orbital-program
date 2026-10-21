/**
 * The renderer's building list for a site (plan 091, ADR 0117), shared by the Space Center and
 * Flight so the launch site shows the buildings the player built. Pure, so vitest covers it.
 */
import type { BuildingDefinition, Snapshot } from '@orbital/core';
import type { SiteBuildingView } from '@orbital/renderer';

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
