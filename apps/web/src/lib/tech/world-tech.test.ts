/** A world's tech tree on the page (plan 105, ADR 0154 point 4): the verdict and Launch. */
import { loadPlugins, partId, SCIENCE_RULES, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import type { ContentLookups } from '../delta-v';
import { blocksLaunch, checkDesign, verdictOf } from '../editor/checks';
import { createEditor, replaceDesign } from '../editor/state';
import { designStats } from '../editor/stats';
import { designLocks, NO_TREE, worldTechOf } from './world-tech';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const nodes = registries.techNodes.list();
// the reference rocket with its first tank swapped for a tier-1 one (Structures)
const reference = referenceTwoStage();
const swap = reference.parts.find((p) => p.part === 'stock.tank-small')!.index;
const design = {
	...reference,
	parts: reference.parts.map((p) =>
		p.index === swap ? { ...p, part: partId('stock.tank-medium') } : p
	)
};

describe('a world tech tree on the page (plan 105)', () => {
	it('a design with a locked part names the node in the pre-flight verdict, and blocks Launch', () => {
		const tech = { on: true, researched: [] };
		const locks = designLocks(design, nodes, registries.parts, tech);
		expect(locks).toEqual([{ parts: [swap], title: 'Medium Fuel Tank', node: 'Structures' }]);
		const s = replaceDesign(createEditor(design, content), content, design);
		const checks = checkDesign(
			s,
			content,
			designStats(s.design, content, 'sea-level', 9.81),
			undefined,
			locks
		);
		const locked = checks.find((c) => c.id === 'locked')!;
		expect(locked.level).toBe('no-go');
		expect(locked.text).toContain(locks[0]!.title);
		expect(locked.hint).toContain(`"${locks[0]!.node}"`);
		expect(locked.parts).toEqual(locks.flatMap((l) => l.parts));
		expect(verdictOf(checks)).toBe('no-go');
		// the Launch screen refuses while any lock is left (its button and launch() read the same list)
		expect(blocksLaunch(checks)).toBe(true);
	});

	it('every node researched, or the tree off, locks nothing', () => {
		const all = { on: true, researched: nodes.map((n) => n.id) };
		expect(designLocks(design, nodes, registries.parts, all)).toEqual([]);
		expect(designLocks(design, nodes, registries.parts, NO_TREE)).toEqual([]);
	});

	it('the tree is on from the world rules; research comes from the save', () => {
		const info = { rules: { [SCIENCE_RULES.techTree]: true } } as unknown as WorldInfo;
		expect(worldTechOf(undefined, info)).toEqual({ on: true, researched: [] });
		const save = {
			sim: { worldInfo: { rules: {} }, tech: { researched: ['stock.tech.basics'] } }
		} as never;
		expect(worldTechOf(save, info)).toEqual({ on: false, researched: ['stock.tech.basics'] });
	});
});
