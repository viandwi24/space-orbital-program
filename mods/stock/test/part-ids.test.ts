import { expect, test } from 'bun:test';
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
