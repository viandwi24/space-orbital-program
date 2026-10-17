/**
 * What Create World is generated from (plan 087): the rules, presets and bodies of the plugins this
 * page runs (stock plus the enabled mods), so mod rules appear without UI work.
 */
import {
	calendarOf,
	loadPlugins,
	type BodyDefinition,
	type Calendar,
	type SaveMod,
	type SiteTemplateDefinition
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { activePlugins } from '../mods/runtime';
import type { RuleCatalog } from './world-model';

export interface WorldCatalog extends RuleCatalog {
	bodies: readonly BodyDefinition[];
	calendar: Calendar;
	/** The star system a new world uses: the stock one (no system registry yet, ADR 0143). */
	system: { id: string; version: string; label: string; variants: readonly string[] };
	mods: SaveMod[];
	/** Quick-start sites (plan 092, ADR 0177). */
	siteTemplates: readonly SiteTemplateDefinition[];
}

export function loadWorldCatalog(): WorldCatalog {
	const plugins = [Stock, ...activePlugins()];
	const { registries } = loadPlugins(plugins);
	const bodies = registries.bodies.list();
	return {
		rules: registries.rules.list(),
		presets: registries.presets.list(),
		bodies,
		calendar: calendarOf(bodies),
		system: {
			id: Stock.meta.id,
			version: Stock.meta.version,
			label: 'Stock system',
			variants: ['default']
		},
		mods: plugins.map((p) => ({ id: p.meta.id, version: p.meta.version })),
		siteTemplates: registries.siteTemplates.list()
	};
}
