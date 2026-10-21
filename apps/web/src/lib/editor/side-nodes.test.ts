/** Plan 308: a part attaches to a sideways node (a hub's side port), turned to face it. */
import { loadPlugins, resolveVesselDesign, partId, type PartLookup } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { attachNew, attachTargets, createEditor, singlePart } from './state';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

const hubOnly = () =>
	createEditor(
		{
			formatVersion: 4,
			name: 'Hub',
			parts: [{ index: 0, part: partId('stock.hub'), parent: null }],
			stages: []
		},
		content
	);

describe('sideways nodes (plan 308)', () => {
	it('the hub offers its four side ports to a stack part, with a turn', () => {
		const s = hubOnly();
		const targets = attachTargets(s.design, singlePart('stock.airlock', 1), content.parts);
		const sides = targets.filter(
			(t) =>
				t.parent?.index === 0 && ['east', 'west', 'north', 'south'].includes(t.parent.parentNode)
		);
		expect(new Set(sides.map((t) => t.parent!.parentNode))).toEqual(
			new Set(['east', 'west', 'north', 'south'])
		);
		expect(sides.every((t) => t.tilt !== undefined)).toBe(true);
		// the plain stack nodes still come without a turn, and nothing is offered upside down
		const top = targets.filter((t) => t.parent?.parentNode === 'top');
		expect(top.map((t) => t.node)).toEqual(['bottom']);
		expect(top[0]!.tilt).toBeUndefined();
	});

	it('an airlock on the east port sits outside the hub, its top pointing east', () => {
		const s = hubOnly();
		const t = attachTargets(s.design, singlePart('stock.airlock', 1), content.parts).find(
			(x) => x.parent?.parentNode === 'east' && x.node === 'bottom'
		)!;
		const after = attachNew(s, content, 'stock.airlock', t);
		const resolved = resolveVesselDesign(after.design, content.parts as PartLookup);
		if (!resolved.ok) throw new Error(resolved.errors.join('; '));
		const airlock = resolved.parts.find((p) => p.definition.id === 'stock.airlock')!;
		// the hub's east port is at x 1.35; the 1 m airlock's centre half a metre further out
		expect(airlock.position.x).toBeCloseTo(1.35 + 0.5, 6);
		expect(Math.abs(airlock.position.y)).toBeLessThan(1e-6);
	});
});
