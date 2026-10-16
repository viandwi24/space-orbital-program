/** Stock part data for the renderer tests (the stock mod is a test-only dependency, like in scripting). */
import { loadPlugins, type PartDefinition, type PartVisual } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import type { PartNode, PartShape } from '../src/parts/types.ts';

export const stockParts = (): PartDefinition[] => loadPlugins([Stock]).registries.parts.list();

export function stockMaps(): {
	shapes: Map<string, PartShape>;
	visuals: Map<string, PartVisual>;
	attach: Map<string, Record<string, PartNode>>;
	byId: Map<string, PartDefinition>;
} {
	const shapes = new Map<string, PartShape>();
	const visuals = new Map<string, PartVisual>();
	const attach = new Map<string, Record<string, PartNode>>();
	const byId = new Map<string, PartDefinition>();
	for (const p of stockParts()) {
		byId.set(p.id, p);
		if (p.shape?.kind === 'cylinder') {
			shapes.set(p.id, { kind: 'cylinder', radius: p.shape.radius, height: p.shape.height });
		} else if (p.shape?.kind === 'box') {
			const [x, y, z] = p.shape.size;
			shapes.set(p.id, { kind: 'box', size: { x, y, z } });
		}
		if (p.visual) visuals.set(p.id, p.visual);
		if (p.attach) attach.set(p.id, p.attach);
	}
	return { shapes, visuals, attach, byId };
}
