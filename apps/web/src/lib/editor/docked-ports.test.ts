/** Plan 356 (ADR 0300): a docking port goes on another port's face turned over, face to face. */
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

const tankWithPort = () => {
	let s = createEditor(
		{
			formatVersion: 4,
			name: 'Carrier',
			parts: [{ index: 0, part: partId('stock.tank-small'), parent: null }],
			stages: []
		},
		content
	);
	const t = attachTargets(s.design, singlePart('stock.docking-port', 1), content.parts).find(
		(x) => x.parent?.index === 0 && x.parent.parentNode === 'top'
	)!;
	s = attachNew(s, content, 'stock.docking-port', t);
	return s;
};

describe('ports built docked (plan 356)', () => {
	it("a port's face offers a port only turned over, its face on the face", () => {
		const s = tankWithPort();
		const onFace = attachTargets(
			s.design,
			singlePart('stock.docking-port', 2),
			content.parts
		).filter((t) => t.parent?.index === 1 && t.parent.parentNode === 'top');
		expect(onFace).toHaveLength(1);
		expect(onFace[0]!.node).toBe('top');
		expect(Math.abs(onFace[0]!.tilt!.x)).toBeCloseTo(Math.PI, 9);
	});

	it('the pair resolves face to face, and what goes on the payload port stacks above it', () => {
		let s = tankWithPort();
		const t = attachTargets(s.design, singlePart('stock.docking-port', 2), content.parts).find(
			(x) => x.parent?.index === 1 && x.parent.parentNode === 'top'
		)!;
		s = attachNew(s, content, 'stock.docking-port', t);
		const above = attachTargets(s.design, singlePart('stock.tank-small', 3), content.parts).find(
			(x) => x.parent?.index === 2 && x.parent.parentNode === 'bottom'
		)!;
		expect(above).toBeDefined();
		s = attachNew(s, content, 'stock.tank-small', above);
		const resolved = resolveVesselDesign(s.design, content.parts as PartLookup);
		if (!resolved.ok) throw new Error(resolved.errors.join('; '));
		const [carrierPort, payloadPort] = [1, 2].map((i) =>
			resolved.parts.find((p) => p.index === i)!
		);
		// both 0.3 m ports: centres 0.3 m apart, the faces meet between them
		expect(payloadPort!.position.y - carrierPort!.position.y).toBeCloseTo(0.3, 6);
		const payload = resolved.parts.find((p) => p.index === 3)!;
		expect(payload.position.y).toBeGreaterThan(payloadPort!.position.y);
	});

	it('a plain stack part on a port face is offered as before', () => {
		const s = tankWithPort();
		const onFace = attachTargets(s.design, singlePart('stock.tank-small', 2), content.parts).filter(
			(t) => t.parent?.index === 1 && t.parent.parentNode === 'top'
		);
		expect(onFace.map((t) => [t.node, t.tilt])).toEqual([['bottom', undefined]]);
	});
});
