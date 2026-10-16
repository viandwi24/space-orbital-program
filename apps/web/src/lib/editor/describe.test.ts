import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, referenceTwoStage } from '../design';
import { describeStack } from './describe';
import { attachNew, attachTargets, createEditor, radialTarget, singlePart } from './state';

const { registries } = loadPlugins([Stock]);
const parts = registries.parts;
const ec = { parts: registries.parts, modules: registries.modules };

describe('describeStack', () => {
	it('names an empty vessel', () => {
		expect(describeStack(emptyDesign(), parts)).toBe('The vessel is empty.');
	});

	it('lists the stack from the top and the stages', () => {
		const text = describeStack(referenceTwoStage(), parts);
		expect(text).toContain('Two-stage: 7 parts.');
		expect(text).toContain(
			'Stack from the top: Command Pod, Reaction Wheel, Small Fuel Tank, LV-T30 Liquid Engine, Stack Decoupler, Small Fuel Tank and LV-T30 Liquid Engine.'
		);
		expect(text).toContain('2 stages: stage 1 fires LV-T30 Liquid Engine');
	});

	it('describes a symmetric group on the side with what it carries', () => {
		let s = createEditor(referenceTwoStage(), ec);
		const t = radialTarget(
			s.design,
			singlePart('stock.radial-decoupler', s.nextIndex),
			parts,
			5,
			0,
			0
		)!;
		s = attachNew(s, ec, 'stock.radial-decoupler', t, 4);
		const first = s.design.parts.find((p) => p.part === 'stock.radial-decoupler')!;
		const outer = attachTargets(s.design, singlePart('stock.booster', s.nextIndex), parts).find(
			(x) => x.parent?.index === first.index && x.parent.parentNode === 'outer'
		)!;
		s = attachNew(s, ec, 'stock.booster', outer);
		const text = describeStack(s.design, parts);
		expect(text).toMatch(
			/4 Radial Decouplers on the side of the Small Fuel Tank, evenly around it, each carrying BST-1 Booster\./
		);
		// The boosters are not part of the stack sentence.
		expect(text.split('Stack from the top:')[1]!.split('.')[0]).not.toContain('Booster');
	});
});
