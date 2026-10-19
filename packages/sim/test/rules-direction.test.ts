/** Plan 230 / ADR 0229: rules change during play only toward easier, and the changelog shows it. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { rapier } from './helpers/vessels.ts';

const world = (preset: string): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '0b9e7d1c-3f4a-4e2b-8c6d-5a7f9e1b2c3d',
	preset
});
const make = (preset: string) =>
	createSim({ plugins: [Stock], backendFactory: rapier(8), world: world(preset) });

describe('rule direction (plan 230)', () => {
	test('Hardcore: allow-revert can be turned on, not back off; the changelog has one entry', async () => {
		const sim = await make('stock.career-hardcore');
		expect(sim.snapshot().rules!['stock.allow-revert']).toBe(false);
		expect(sim.snapshot().rules!['stock.allow-quickload']).toBe(false);
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.allow-revert', value: true }).ok).toBe(
			true
		);
		const back = sim.dispatch({ type: 'set-rule', rule: 'stock.allow-revert', value: false });
		expect(back.ok).toBe(false);
		expect(back.ok ? '' : back.reason).toBe(
			'Allow revert: a rule can only be made easier during play'
		);
		expect(sim.worldInfo.changelog).toHaveLength(1);
		expect(sim.worldInfo.changelog[0]).toMatchObject({ rule: 'stock.allow-revert', to: true });
		sim.dispose();
	});

	test('numbers and enums follow their easier direction; a rule without one is fixed', async () => {
		const sim = await make('stock.career');
		const set = (rule: string, value: boolean | number | string) =>
			sim.dispatch({ type: 'set-rule', rule, value }).ok;
		expect(set('stock.reentry-heating', 0.5)).toBe(true); // lower is easier
		expect(set('stock.reentry-heating', 0.8)).toBe(false);
		expect(set('stock.crew-death', 'return')).toBe(true); // permanent → return → off
		expect(set('stock.crew-death', 'permanent')).toBe(false);
		expect(set('stock.cost-multiplier', 2)).toBe(false); // higher costs are harder
		const fixed = sim.dispatch({ type: 'set-rule', rule: 'stock.contracts', value: false });
		expect(fixed.ok ? '' : fixed.reason).toContain('fixed once the world is made');
		sim.dispose();
	});

	test('in debug mode (and in Sandbox, where the tools are always on) any change is allowed', async () => {
		const career = await make('stock.career');
		expect(career.dispatch({ type: 'debug-mode', on: true }).ok).toBe(true);
		expect(career.dispatch({ type: 'set-rule', rule: 'stock.cost-multiplier', value: 2 }).ok).toBe(
			true
		);
		career.dispose();
		const sandbox = await make('stock.sandbox');
		expect(sandbox.dispatch({ type: 'set-rule', rule: 'stock.contracts', value: false }).ok).toBe(
			true
		);
		sandbox.dispose();
	});
});
