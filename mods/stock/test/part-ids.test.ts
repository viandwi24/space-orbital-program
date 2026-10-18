import { expect, test } from 'bun:test';
import { describeModule, parseModuleConfig, powerBudget } from '@orbital/sdk';
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
