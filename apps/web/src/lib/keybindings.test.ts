import { describe, expect, it } from 'vitest';
import { BINDING_GROUPS, bindingClashes, type BindingGroup } from './keybindings';

describe('keybinding list', () => {
	it('has no clashing key within a mode (the map view counts as flight)', () => {
		expect(bindingClashes()).toEqual([]);
	});
	it('detects a clash (the test catches what it guards)', () => {
		const dup: BindingGroup[] = [
			{ id: 'a', title: 'A', mode: 'flight', rows: [{ keys: ['Z'], action: 'one' }] },
			{ id: 'b', title: 'B', mode: 'map', rows: [{ keys: ['Z'], action: 'two' }] }
		];
		expect(bindingClashes(dup)).toHaveLength(1);
	});
	it('covers the documented flight keys', () => {
		const all = BINDING_GROUPS.flatMap((g) => g.rows.flatMap((r) => r.keys));
		for (const key of ['Space', 'Z', 'X', 'T', 'M', 'V', ',', '.', 'F5', 'F9', 'Esc', '?', 'Tab']) {
			expect(all).toContain(key);
		}
	});
	it('every row has an action and at least one key', () => {
		for (const g of BINDING_GROUPS)
			for (const r of g.rows) {
				expect(r.action.length).toBeGreaterThanOrEqual(3);
				expect(r.keys.length).toBeGreaterThan(0);
			}
	});
});
