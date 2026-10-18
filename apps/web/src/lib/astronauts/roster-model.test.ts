/** The Astronaut Complex (plan 108, ADR 0152): filters, the recruit, its cost. */
import { RECRUIT_DAYS, SALARY_BASE } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { applicants, profileOf, recruitCost, rosterRows } from './roster-model';

const newSim = () =>
	createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 4
	});

describe('Astronaut Complex', () => {
	it('recruiting adds a member and books the cost; the roster filters by profession', async () => {
		const sim = await newSim();
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: true }).ok).toBe(true);
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.crew-salaries', value: true }).ok).toBe(
			true
		);
		sim.step(0.02);
		const before = sim.snapshot().economy?.funds ?? 0;
		const rules = sim.snapshot().rules;
		expect(recruitCost('pilot', rules)).toBe(SALARY_BASE.pilot * RECRUIT_DAYS);
		expect(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }).ok).toBe(true);
		expect(sim.dispatch({ type: 'crew-hire', profession: 'engineer' }).ok).toBe(true);
		sim.step(0.02);
		const snap = sim.snapshot();
		expect(snap.crew).toHaveLength(2);
		expect(snap.economy!.funds).toBeCloseTo(
			before - recruitCost('pilot', rules) - recruitCost('engineer', rules),
			6
		);
		expect(rosterRows(snap.crew, 'roster', 'all')).toHaveLength(2);
		expect(rosterRows(snap.crew, 'roster', 'pilot').map((m) => m.profession)).toEqual(['pilot']);
		expect(rosterRows(snap.crew, 'roster', 'scientist')).toEqual([]);
		expect(rosterRows(snap.crew, 'lost', 'all')).toEqual([]);
		const p = profileOf(snap.crew![0]!, () => null);
		expect(p.chips).toContain('At the Space Center');
		expect(p.stats.find((s) => s.label === 'Radio')?.value).toBeNull();
	});

	it('applicants are the professions, free while the economy is off', () => {
		expect(applicants({}, 'all').map((a) => [a.profession, a.cost])).toEqual([
			['pilot', 0],
			['engineer', 0],
			['scientist', 0],
			['tourist', 0]
		]);
		expect(applicants({ 'stock.economy': true }, 'scientist')).toEqual([
			{ profession: 'scientist', cost: SALARY_BASE.scientist * RECRUIT_DAYS }
		]);
	});
});
