import { expect, test } from 'bun:test';
import {
	describeModule,
	NODE_SIZES,
	nodeSize,
	nodeSizesMatch,
	parseModuleConfig,
	powerBudget
} from '@orbital/sdk';
import beforeSizes from './fixtures/node-sizes-before-289.json';
import { loaded } from './helpers.ts';

/**
 * Every stock part in registration order with its key fields (plan 207). Splitting the parts into
 * one file per family must not change this snapshot; adding a part changes it on purpose.
 */
test('stock part ids, masses, costs and modules match the snapshot', () => {
	const parts = loaded.registries.parts.list().map((part) => ({
		id: part.id,
		mass: part.mass,
		cost: part.cost,
		modules: (part.modules ?? []).map(([moduleId, config]) => [moduleId, config])
	}));
	expect(parts).toMatchSnapshot();
});

test('every stack node of a stock part declares its size (plan 207, ADR 0212)', () => {
	const missing: string[] = [];
	for (const part of loaded.registries.parts.list()) {
		if (part.shape?.kind !== 'cylinder') continue;
		for (const [name, node] of Object.entries(part.attach ?? {})) {
			const axial = Math.abs(node.dir[1]) > 0.999;
			if (axial && node.size === undefined) missing.push(`${part.id}/${name}`);
		}
	}
	expect(missing).toEqual([]);
});

test('the stock power budget: two batteries, an RTG and a probe core (plan 208)', () => {
	const b = powerBudget(
		['stock.battery-medium', 'stock.battery-medium', 'stock.rtg', 'stock.probe-core'],
		loaded.registries
	);
	// 0.75 EC/s from the RTG, 0.025 EC/s to the core; 400 + 400 + the core's own 20 EC
	expect(b.day).toBeCloseTo(0.725, 12);
	expect(b.night).toBeCloseTo(0.725, 12);
	expect(b.capacity).toBe(820);
});

test('every stock module describes itself with a valid descriptor (plan 208 found solar "other")', () => {
	for (const part of loaded.registries.parts.list()) {
		for (const [moduleId, config] of part.modules ?? []) {
			const def = loaded.registries.modules.get(moduleId)!;
			const parsed = parseModuleConfig(def, config);
			if (!parsed.ok || !def.describe) continue;
			const state = def.state ? def.state(parsed.value) : undefined;
			expect(
				() => describeModule(def, parsed.value, state),
				`${part.id}/${moduleId}`
			).not.toThrow();
		}
	}
});

test('plan 289: every stock part keeps the node sizes it had before the seven classes', () => {
	const before = beforeSizes as Record<string, Record<string, number>>;
	const changed: string[] = [];
	for (const [id, nodes] of Object.entries(before)) {
		const part = loaded.registries.parts.get(id);
		if (!part) {
			changed.push(`${id}: missing`);
			continue;
		}
		for (const [name, size] of Object.entries(nodes)) {
			const now = nodeSize(part, name);
			if (now !== size) changed.push(`${id}/${name}: ${size} -> ${now}`);
		}
	}
	expect(Object.keys(before).length).toBeGreaterThan(50);
	expect(changed).toEqual([]);
});

test('plan 289: every node of a new stock part is one of the seven classes (ADR 0256)', () => {
	const before = beforeSizes as Record<string, unknown>;
	const off: string[] = [];
	const added = loaded.registries.parts.list().filter((p) => !(p.id in before) && p.attach);
	expect(added.length).toBeGreaterThanOrEqual(32);
	for (const part of added) {
		for (const name of Object.keys(part.attach ?? {})) {
			const size = nodeSize(part, name);
			if (size !== undefined && !NODE_SIZES.some((c) => nodeSizesMatch(c, size))) {
				off.push(`${part.id}/${name}: ${size}`);
			}
		}
	}
	expect(off).toEqual([]);
});
