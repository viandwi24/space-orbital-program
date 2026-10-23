import { DESIGN_FORMAT_VERSION } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { loadCatalog, partLookup } from './catalog';
import {
	addPart,
	emptyDesign,
	freeNodes,
	parseDesign,
	referenceTwoStage,
	removePart,
	serialiseDesign,
	setPartStage,
	stageOf
} from './design';

const parts = partLookup(loadCatalog());

describe('design editing', () => {
	it('builds a stack part by part with the first part as root', () => {
		let d = addPart(emptyDesign(), 'stock.command-pod', null);
		d = addPart(d, 'stock.tank-small', { index: 0, parentNode: 'bottom', node: 'top' });
		expect(d.parts.map((p) => p.index)).toEqual([0, 1]);
		expect(d.parts[1]!.parent).toEqual({ index: 0, parentNode: 'bottom', node: 'top' });
		expect(() => addPart(d, 'stock.engine-lv', null)).toThrow(/only the first part/);
		expect(() =>
			addPart(emptyDesign(), 'stock.engine-lv', { index: 0, parentNode: 'a', node: 'b' })
		).toThrow(/root/);
	});

	it('removes a part together with its subtree and its stage entries', () => {
		const d = removePart(referenceTwoStage(), 4);
		expect(d.parts.map((p) => p.index)).toEqual([0, 1, 2, 3]);
		expect(d.stages).toEqual([[], [3]]); // 6 left with the subtree, 4 and 3: only 3 remains
	});

	it('assigns and clears stages, trimming empty trailing stages', () => {
		let d = referenceTwoStage();
		d = setPartStage(d, 3, 0);
		expect(stageOf(d, 3)).toBe(0);
		expect(d.stages).toEqual([[6, 3], [4]]);
		d = setPartStage(d, 4, null);
		expect(d.stages).toEqual([[6, 3]]);
		expect(() => setPartStage(d, 99, 0)).toThrow(/no part/);
	});

	it('lists the nodes still free on a part', () => {
		const d = referenceTwoStage();
		expect(freeNodes(d, parts, 0)).toEqual(['top']);
		expect(freeNodes(d, parts, 6)).toEqual(['bottom']);
		expect(freeNodes(d, parts, 1)).toEqual([]);
		expect(freeNodes(d, parts, 99)).toEqual([]);
	});
});

describe('design serialisation', () => {
	it('round trips the reference vessel through JSON and validates it against the registries', () => {
		const original = referenceTwoStage();
		const parsed = parseDesign(serialiseDesign(original), parts);
		expect(parsed).toEqual({
			ok: true,
			design: { ...original, formatVersion: DESIGN_FORMAT_VERSION }
		});
	});

	it('rejects invalid JSON, wrong shapes and semantically bad designs with messages', () => {
		const bad = parseDesign('{nope', parts);
		expect(bad.ok).toBe(false);
		const shape = parseDesign(JSON.stringify({ formatVersion: 2 }), parts);
		expect(shape.ok).toBe(false);
		const unknown = referenceTwoStage();
		unknown.parts[2] = { ...unknown.parts[2]!, part: 'stock.missing' as never };
		const semantic = parseDesign(JSON.stringify(unknown), parts);
		expect(semantic.ok).toBe(false);
		if (!semantic.ok) expect(semantic.errors.join(' ')).toContain('stock.missing');
	});
});
