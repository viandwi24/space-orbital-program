/** Plan 095 / ADR 0113: charges, projection, recovery factor. */
import { describe, expect, test } from 'bun:test';
import {
	chargeOn,
	projectBalances,
	recoveryFactor,
	greatCircle,
	type ChargeDefinition
} from '../src/index.ts';

const budget: ChargeDefinition = {
	id: 't.budget',
	label: 'Budget',
	currency: 'funds',
	amount: 24_000,
	everyDays: 30,
	when: { rule: 'agency', equals: 'government' },
	scaleBy: ['mult']
};
const ops: ChargeDefinition = {
	id: 't.ops',
	label: 'Operations',
	currency: 'funds',
	amount: -4_000,
	everyDays: 30
};
const rules: Record<string, string | number> = { agency: 'government', mult: 1.5 };
const rule = (id: string) => rules[id];

describe('chargeOn', () => {
	test('applies on positive multiples of everyDays, when its rule holds, scaled', () => {
		expect(chargeOn(budget, 0, rule)).toBeNull();
		expect(chargeOn(budget, 29, rule)).toBeNull();
		expect(chargeOn(budget, 30, rule)).toBe(36_000);
		expect(chargeOn(budget, 60, rule)).toBe(36_000);
		expect(chargeOn(budget, 30, (id) => (id === 'agency' ? 'company' : undefined))).toBeNull();
		expect(chargeOn(ops, 90, () => undefined)).toBe(-4_000);
	});
});

describe('projectBalances', () => {
	test('90 days of budget and operations match the hand table, with reputation decay', () => {
		const days = projectBalances(
			{ funds: 100_000, science: 0, reputation: 500 },
			[budget, ops],
			rule,
			0,
			90
		);
		expect(days).toHaveLength(90);
		// Day 29: nothing yet; days 30, 60, 90: +36 000 − 4 000 each.
		expect(days[28]!.funds).toBe(100_000);
		expect(days[29]!.funds).toBe(132_000);
		expect(days[59]!.funds).toBe(164_000);
		expect(days[89]!.funds).toBe(196_000);
		// Reputation e^(−30/365) per 30 days.
		const k = Math.exp(-30 / 365);
		expect(days[29]!.reputation).toBeCloseTo(500 * k, 9);
		expect(days[89]!.reputation).toBeCloseTo(500 * k ** 3, 9);
	});
});

describe('recovery factor', () => {
	test('0.98 at the site, falls linearly to 0.1 at half the circumference', () => {
		const R = 600_000;
		expect(recoveryFactor(0, R)).toBe(0.98);
		expect(recoveryFactor(40_000, R)).toBeCloseTo(0.98 - 0.88 * (40_000 / (Math.PI * R)), 12);
		expect(recoveryFactor(Math.PI * R, R)).toBeCloseTo(0.1, 12);
		expect(recoveryFactor(10 * R, R)).toBeCloseTo(0.1, 12);
	});

	test('great-circle distance on the sphere', () => {
		const R = 600_000;
		const lon = 40_000 / R;
		const d = greatCircle({ x: 1, y: 0, z: 0 }, { x: Math.cos(lon), y: 0, z: -Math.sin(lon) }, R);
		expect(d).toBeCloseTo(40_000, 6);
	});
});
