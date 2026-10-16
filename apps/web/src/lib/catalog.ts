import { loadPlugins, type PartLookup } from '@orbital/core';
import type { PartShape } from '@orbital/renderer';
import Stock from '@orbital/mod-stock';
import type { ContentLookups } from './delta-v';
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

/** Catalog plus the registries the HUD's stage maths needs (module definitions carry the store accessors). */
export function loadContent(): { catalog: Catalog; content: ContentLookups } {
	const { registries, report } = loadPlugins([Stock]);
	return {
		catalog: {
			plugins: [...report.order],
			parts: registries.parts.list(),
			bodies: registries.bodies.list(),
			resources: registries.resources.list()
		},
		content: {
			parts: registries.parts,
			modules: registries.modules,
			resources: registries.resources
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
