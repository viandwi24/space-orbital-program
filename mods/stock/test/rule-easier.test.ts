/** Plan 230 / ADR 0230: the rules World settings can change declare which way is easier. */
import { describe, expect, test } from 'bun:test';
import type { RuleDefinition } from '@orbital/sdk';
import { STOCK_RULES } from '../src/rules.ts';

/** Feature switches, not difficulty: fixed once the world is made (shown as fixed in the dialog). */
const FIXED_DURING_PLAY = ['stock.contracts', 'stock.science-depth', 'stock.crew-experience'];

describe('stock rules and their easier direction', () => {
	const rules = STOCK_RULES as readonly RuleDefinition[];
	test('every rule World settings can change declares easier', () => {
		const missing = rules
			.filter((r) => r.changeable && !FIXED_DURING_PLAY.includes(r.id))
			.filter((r) => r.easier === undefined)
			.map((r) => r.id);
		expect(missing).toEqual([]);
		for (const id of FIXED_DURING_PLAY)
			expect(rules.find((r) => r.id === id)?.easier).toBeUndefined();
	});

	test('revert and quickload are new rules, off in Hardcore, easier when on', () => {
		for (const id of ['stock.allow-revert', 'stock.allow-quickload']) {
			const r = rules.find((x) => x.id === id)!;
			expect(r).toMatchObject({ type: 'boolean', default: true, easier: true, changeable: true });
			expect(r.presets?.['stock.career-hardcore']).toBe(false);
		}
	});
});
