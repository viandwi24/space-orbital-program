import { loadPlugins, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { moonShot } from './examples';
import {
	customMembers,
	groupActions,
	setGroupMember,
	stockGroupParts,
	stockGroupsOf
} from './groups';
import { createEditor, deleteSubtree, undo } from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const LEGS = 5;
const legs = { part: LEGS, module: 'stock.landing-leg', action: 'setDeployed' };

describe('the Hangar action group editor (plan 218)', () => {
	it('lists a part’s switches and the stock groups it is in', () => {
		const s = createEditor(moonShot(), content);
		expect(groupActions(s.design, content, LEGS).map((a) => a.id)).toEqual(['setDeployed']);
		expect(stockGroupParts(s.design, content, 'stock.landing-gear')).toEqual([LEGS]);
		const ids = stockGroupsOf(s.design, content, registries.actionGroups.list()).map((g) => g.id);
		expect(ids).toContain('stock.landing-gear');
		expect(ids).toContain('stock.engines');
	});

	it('puts the legs in Custom 1 as one undo step; the design still resolves', () => {
		const s0 = createEditor(moonShot(), content);
		const s1 = setGroupMember(s0, content, 1, legs, true);
		expect(customMembers(s1.design, 1)).toEqual([legs]);
		expect(s1.design.groups?.[0]?.label).toBe('Custom 1');
		expect(resolveVesselDesign(s1.design, content.parts).ok).toBe(true);
		expect(undo(s1).design.groups).toBeUndefined();
		const out = setGroupMember(s1, content, 1, legs, false);
		expect(out.design.groups).toBeUndefined();
	});

	it('takes the symmetry group along, and a deleted member leaves its group', () => {
		const s0 = createEditor(moonShot(), content);
		const booster = { part: 21, module: 'stock.engine', action: 'setActive' };
		const s1 = setGroupMember(s0, content, 2, booster, true);
		expect(customMembers(s1.design, 2).map((m) => m.part)).toEqual([21, 24, 27, 30]);
		const s2 = setGroupMember(s1, content, 3, legs, true);
		const gone = deleteSubtree(s2, content, 21, { single: true });
		expect(customMembers(gone.design, 2).map((m) => m.part)).toEqual([24, 27, 30]);
		expect(customMembers(gone.design, 3)).toEqual([legs]);
		// the legs hold the lower stack: deleting them takes the boosters and both groups go
		const none = deleteSubtree(s2, content, LEGS, { single: true });
		expect(none.design.groups).toBeUndefined();
	});

	it('refuses a control the part does not have', () => {
		const s0 = createEditor(moonShot(), content);
		expect(() => setGroupMember(s0, content, 1, { ...legs, action: 'nope' }, true)).toThrow();
		expect(() => setGroupMember(s0, content, 11, legs, true)).toThrow();
	});
});
