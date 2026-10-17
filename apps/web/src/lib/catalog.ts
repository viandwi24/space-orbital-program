import {
	loadPlugins,
	type CategoryDefinition,
	type MissionDefinition,
	type PanelDefinition,
	type PartLookup
} from '@orbital/core';
import type { PartShape } from '@orbital/renderer';
import Stock from '@orbital/mod-stock';
import type { ContentLookups } from './delta-v';
import type { Catalog } from './messages';
import { activePlugins } from './mods/runtime';

/**
 * The same plugins the worker boots (stock plus the enabled mods that loaded, plan 046), loaded on the main thread for screens that need content but
 * no simulation (the VAB). `loadPlugins` is pure data work: no physics, no Worker.
 */
export function loadCatalog(): Catalog {
	const { registries, report } = loadPlugins([Stock, ...activePlugins()]);
	return {
		plugins: [...report.order],
		parts: registries.parts.list(),
		bodies: registries.bodies.list(),
		resources: registries.resources.list()
	};
}

export function partLookup(catalog: Catalog): PartLookup {
	const byId = new Map(catalog.parts.map((p) => [p.id as string, p]));
	return { get: (id) => byId.get(id) };
}

/** Catalog plus the registries the HUD's stage maths needs (module definitions carry the store accessors). */
export function loadContent(): {
	catalog: Catalog;
	content: ContentLookups;
	/** Catalogue categories (plan 069, ADR 0146), in registration order. */
	categories: CategoryDefinition[];
	/** Dock panels of stock and the enabled mods (plan 112, ADR 0149). */
	panels: PanelDefinition[];
	/** Missions and objective labels for the tracker (plan 100, ADR 0151). */
	missions: MissionDefinition[];
	objectiveLabels: Record<string, string>;
} {
	const { registries, report } = loadPlugins([Stock, ...activePlugins()]);
	return {
		catalog: {
			plugins: [...report.order],
			parts: registries.parts.list(),
			bodies: registries.bodies.list(),
			resources: registries.resources.list()
		},
		categories: registries.categories.list(),
		panels: registries.panels.list(),
		missions: registries.missions.list(),
		objectiveLabels: Object.fromEntries(registries.objectives.list().map((o) => [o.id, o.label])),
		content: {
			parts: registries.parts,
			modules: registries.modules,
			resources: registries.resources,
			science: {
				dossierEntries: registries.dossierEntries.list(),
				labelOf: (id) =>
					(registries.situations.get(id) ?? registries.experiments.get(id))?.label.toLowerCase() ??
					id
			}
		}
	};
}

/** Physics shapes of the catalogue parts in the renderer's form (host-supplied, ADR 0012). */
export function partShapesOf(catalog: Catalog): Map<string, PartShape> {
	const shapes = new Map<string, PartShape>();
	for (const p of catalog.parts) {
		const s = p.shape;
		if (!s) continue;
		shapes.set(
			p.id,
			s.kind === 'box'
				? { kind: 'box', size: { x: s.size[0], y: s.size[1], z: s.size[2] } }
				: { kind: 'cylinder', radius: s.radius, height: s.height }
		);
	}
	return shapes;
}
