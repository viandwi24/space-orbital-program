import { loadPlugins, type PartLookup } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import type { Catalog } from './messages';

/**
 * The same plugins the worker boots, loaded on the main thread for screens that need content but
 * no simulation (the VAB). `loadPlugins` is pure data work: no physics, no Worker.
 */
export function loadCatalog(): Catalog {
	const { registries, report } = loadPlugins([Stock]);
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
