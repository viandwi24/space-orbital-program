/** Plan 378 (ADR 0315): selection as a silhouette outline, the inside-mode veil, the section plane. */
import { describe, expect, it } from 'bun:test';
import {
	AlwaysStencilFunc,
	Mesh,
	NotEqualStencilFunc,
	ReplaceStencilOp,
	Vector3,
	type Material
} from 'three';
import { PartModelFactory } from '../src/parts/factory.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { HighlightMaterials, OUTLINES, SECTION_OFF_CONSTANT } from '../src/vab/highlight.ts';
import { PartLayer } from '../src/vab/part-layer.ts';
import type { VabScene } from '../src/vab/scene-model.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
function layer(scene: VabScene) {
	const highlights = new HighlightMaterials();
	const l = new PartLayer(
		new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			attach: maps.attach,
			detail: detailOf(PRESETS.high)
		}),
		highlights
	);
	l.sync(scene);
	return { l, highlights };
}
const scene = (extra: Partial<VabScene['parts'][number]> = {}): VabScene => ({
	groups: [{ id: 'main', x: 0, z: 0 }],
	nodes: [],
	parts: [
		{
			key: '0',
			definition: 'stock.tank-small',
			position: [0, 0, 0],
			group: 'main',
			role: 'solid',
			...extra
		},
		{
			key: '1',
			definition: 'stock.tank-small',
			position: [0, -1.2, 0],
			group: 'main',
			role: 'solid'
		}
	]
});
const overlayMaterials = (l: PartLayer, key: string): Material[] => {
	const out: Material[] = [];
	l.parts.get(key)!.model.root.traverse((o) => {
		if (o instanceof Mesh && o.userData.overlay) out.push(o.material as Material);
	});
	return out;
};

describe('selection outline (plan 378)', () => {
	it('is a stencil footprint and two rings drawn only outside it, never a fill', () => {
		const h = new HighlightMaterials();
		const [mask, behind, front] = h.outline('select');
		expect(mask!.colorWrite).toBe(false);
		expect(mask!.stencilFunc).toBe(AlwaysStencilFunc);
		expect(mask!.stencilZPass).toBe(ReplaceStencilOp);
		for (const ring of [behind!, front!]) {
			expect(ring.stencilFunc).toBe(NotEqualStencilFunc);
			expect(ring.stencilRef).toBe(OUTLINES.select.ref);
			expect(ring.uniforms.uWidth!.value).toBe(OUTLINES.select.width);
		}
		expect(behind!.depthTest).toBe(false);
		expect(front!.depthTest).toBe(true);
		// the footprint draws before the rings
		expect(mask!.userData.renderOrder).toBeLessThan(behind!.userData.renderOrder);
	});

	it('a selected part gets the outline passes and no additive fill', () => {
		const { l, highlights } = layer(scene());
		l.applyHighlights(null, new Set(['0']), new Set());
		const mats = overlayMaterials(l, '0');
		const outline = highlights.outline('select');
		expect(mats.length).toBeGreaterThan(0);
		expect(mats.every((m) => (outline as Material[]).includes(m))).toBe(true);
		expect(mats).not.toContain(highlights.get('select'));
	});

	it('hover is thinner than the selection', () => {
		expect(OUTLINES.hover.width).toBeLessThan(OUTLINES.select.width);
		expect(OUTLINES.hover.ref).not.toBe(OUTLINES.select.ref);
	});
});

describe('inside mode looks (plan 378)', () => {
	it('the entered shell is a veil: own materials hidden, reached through', () => {
		const { l, highlights } = layer(scene({ veil: true, holds: ['1'] }));
		l.applyHighlights(null, new Set(), new Set());
		const e = l.parts.get('0')!;
		expect(e.veil).toBe(true);
		expect(e.reach).toBe(true);
		expect(e.seeThrough).toBe(true);
		expect(overlayMaterials(l, '0')).toContain(highlights.veil);
	});

	it('a dimmed part gets the dim overlay; an open shell reaches what it holds', () => {
		const { l, highlights } = layer({
			...scene({ reach: true, holds: ['1'] }),
			parts: [
				{ ...scene().parts[0]!, reach: true, holds: ['1'] },
				{ ...scene().parts[1]!, dim: true }
			]
		});
		l.applyHighlights(null, new Set(), new Set());
		expect(l.parts.get('0')!.reach).toBe(true);
		expect(l.parts.get('0')!.seeThrough).toBe(false);
		expect(overlayMaterials(l, '1')).toContain(highlights.dim);
	});
});

describe('section plane (plan 378)', () => {
	it('every part material clips by the one plane, which cuts nothing while off', () => {
		const { l } = layer(scene());
		const plane = l.section[0]!;
		expect(plane.constant).toBe(SECTION_OFF_CONSTANT);
		// a point anywhere in the Hangar is on the kept side
		expect(plane.distanceToPoint(new Vector3(50, 20, 50))).toBeGreaterThan(0);
		expect(plane.distanceToPoint(new Vector3(-50, -20, -50))).toBeGreaterThan(0);
		l.parts.get('0')!.model.root.traverse((o) => {
			if (o instanceof Mesh && !o.userData.overlay) {
				const ms = Array.isArray(o.material) ? o.material : [o.material];
				for (const m of ms) expect(m.clippingPlanes).toBe(l.section);
			}
		});
	});
});
