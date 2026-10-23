/**
 * What Create World is generated from (plan 087): the rules, presets and bodies of the plugins this
 * page runs (stock plus the enabled mods), so mod rules appear without UI work.
 */
import {
	calendarOf,
	loadPlugins,
	type AchievementDefinition,
	type ScenarioDefinition,
	type BodyDefinition,
	type Calendar,
	type SaveMod,
	type SiteTemplateDefinition,
	type Plugin,
	type SystemVariantDefinition
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { BUILTIN_PLUGINS } from '../builtins';
import { activePlugins } from '../mods/runtime';
import type { RuleCatalog } from './world-model';

export interface WorldCatalog extends RuleCatalog {
	bodies: readonly BodyDefinition[];
	calendar: Calendar;
	/** The stock system (the default a new world uses, ADR 0143). */
	system: { id: string; version: string; label: string; variants: readonly string[] };
	/** Every system a world may use (plan 124, ADR 0184): stock first, then the declared ones. */
	systems: readonly WorldSystem[];
	mods: SaveMod[];
	/** Quick-start sites (plan 092, ADR 0177). */
	siteTemplates: readonly SiteTemplateDefinition[];
	/** Achievements of stock and the enabled mods (plan 102, ADR 0147). */
	achievements: readonly AchievementDefinition[];
	/** Mission packs (plan 100, ADR 0151). */
	scenarios: readonly ScenarioDefinition[];
}

/** A system Create World offers, with its bodies, calendar and variants. */
export interface WorldSystem {
	id: string;
	version: string;
	label: string;
	bodies: readonly BodyDefinition[];
	calendar: Calendar;
	/** `default` alone for stock; a declared system's variants with their facts (ADR 0184 point 1). */
	variants: ReadonlyArray<{
		variant: string;
		label: string;
		description?: string;
		facts?: SystemVariantDefinition['facts'];
		/** The variant's declared home body (its Space Center stands there); else core's rule. */
		home?: string;
	}>;
	/** A mod's own card art and icon for the system (ADR 0273), from its first variant that has one. */
	illustration?: string;
	icon?: string;
}

export function loadWorldCatalog(): WorldCatalog {
	const plugins = [...BUILTIN_PLUGINS, ...activePlugins()];
	const { registries } = loadPlugins(plugins, { system: { id: 'stock' } });
	const bodies = registries.bodies.list();
	const systems = systemsOf(plugins);
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
		systems,
		mods: plugins.map((p) => ({ id: p.meta.id, version: p.meta.version })),
		siteTemplates: registries.siteTemplates.list(),
		achievements: registries.achievements.list(),
		scenarios: registries.scenarios.list()
	};
}

/** The first `illustration` and `icon` a system's variants give (ADR 0273 point 4). */
const art = (
	variants: readonly SystemVariantDefinition[]
): { illustration?: string; icon?: string } => {
	const illustration = variants.find((v) => v.illustration)?.illustration;
	const icon = variants.find((v) => v.icon)?.icon;
	return { ...(illustration ? { illustration } : {}), ...(icon ? { icon } : {}) };
};

/** Stock, then every system a plugin declares (plan 124, ADR 0184), each with its own bodies. */
export function systemsOf(plugins: readonly Plugin[]): WorldSystem[] {
	const { registries } = loadPlugins(plugins, { system: { id: 'stock' } });
	const bodies = registries.bodies.list();
	const declared = loadPlugins(plugins).registries.systemVariants.list();
	const systems: WorldSystem[] = [
		{
			id: Stock.meta.id,
			version: Stock.meta.version,
			label: 'Stock system',
			bodies,
			calendar: calendarOf(bodies),
			variants: [{ variant: 'default', label: 'Stock' }]
		}
	];
	for (const id of [...new Set(declared.map((v) => v.system))]) {
		const variants = declared.filter((v) => v.system === id);
		const own = loadPlugins(plugins, { system: { id, variant: variants[0]!.variant } }).registries;
		const plugin = plugins.find((p) => p.meta.id === id);
		const systemBodies = own.bodies.list();
		systems.push({
			id,
			version: plugin?.meta.version ?? '0.0.0',
			label: plugin?.meta.title ?? id,
			bodies: systemBodies,
			calendar: calendarOf(systemBodies),
			variants: variants.map((v) => ({
				variant: v.variant,
				label: v.label,
				description: v.description,
				facts: v.facts,
				...(v.home ? { home: v.home } : {})
			})),
			...art(variants)
		});
	}
	return systems;
}
