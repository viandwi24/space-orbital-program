import { describe, expect, test } from 'bun:test';
import {
	NODE_SIZES,
	nodeSize,
	nodeSizeClass,
	nodeSizesMatch,
	partDefinitionSchema
} from '../src/index.ts';

const stack = (size?: number) => ({
	top: {
		pos: [0, 1, 0] as [number, number, number],
		dir: [0, 1, 0] as [number, number, number],
		size
	},
	side: {
		pos: [-0.6, 0, 0] as [number, number, number],
		dir: [-1, 0, 0] as [number, number, number]
	}
});

describe('attach node size (plan 207)', () => {
	test('the part schema takes an optional positive size on a node', () => {
		const base = {
			id: 'mod.p',
			title: 'P',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.625, height: 2 }
		};
		expect(partDefinitionSchema.safeParse({ ...base, attach: stack(2.5) }).success).toBe(true);
		expect(partDefinitionSchema.safeParse({ ...base, attach: stack() }).success).toBe(true);
		expect(partDefinitionSchema.safeParse({ ...base, attach: stack(-1) }).success).toBe(false);
	});

	test('a declared size wins', () => {
		const part = {
			shape: { kind: 'cylinder' as const, radius: 0.625, height: 2 },
			attach: stack(2.5)
		};
		expect(nodeSize(part, 'top')).toBe(2.5);
	});

	test('an older mod part without sizes gets its diameter class on stack nodes only', () => {
		const part = { shape: { kind: 'cylinder' as const, radius: 0.6, height: 2 }, attach: stack() };
		expect(nodeSize(part, 'top')).toBe(1.25);
		expect(nodeSize(part, 'side')).toBeUndefined();
		expect(nodeSize(part, 'missing')).toBeUndefined();
		const box = {
			shape: { kind: 'box' as const, size: [1, 1, 1] as [number, number, number] },
			attach: stack()
		};
		expect(nodeSize(box, 'top')).toBeUndefined();
	});

	test('the seven classes of ADR 0256 (plan 289)', () => {
		expect([...NODE_SIZES]).toEqual([0.625, 1.25, 1.875, 2.5, 3.75, 5, 7.5]);
		for (const size of NODE_SIZES) expect(nodeSizeClass(size)).toBe(size);
	});

	test('a size-less 1.9 m cylinder infers 1.875 (it inferred 2.5 before plan 289)', () => {
		const part = { shape: { kind: 'cylinder' as const, radius: 0.95, height: 2 }, attach: stack() };
		expect(nodeSize(part, 'top')).toBe(1.875);
		expect(nodeSizeClass(1.5)).toBe(1.25);
		expect(nodeSizeClass(1.6)).toBe(1.875);
		expect(nodeSizeClass(2.2)).toBe(2.5);
	});

	test('classes and matching', () => {
		expect(nodeSizeClass(0.6)).toBe(0.625);
		expect(nodeSizeClass(2.2)).toBe(2.5);
		expect(nodeSizeClass(4)).toBe(3.75);
		expect(nodeSizeClass(9)).toBe(7.5);
		expect(nodeSizesMatch(1.25, 1.2505)).toBe(true);
		expect(nodeSizesMatch(1.25, 0.625)).toBe(false);
		expect(nodeSizesMatch(undefined, 0.625)).toBe(true);
	});
});
