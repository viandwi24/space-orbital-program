/** Plan 078 / ADR 0111: world rule values, presets, `set-rule`, the changelog and resume. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type Plugin, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { definePlugin, defineSystem } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { rapier, twoStage } from './helpers/vessels.ts';

const world = (extra: Partial<WorldInfo> = {}): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '7d1e4c3b-2a9f-4b8e-8c6d-1f0a2b3c4d5e',
	...extra
});
const make = (extra: Partial<WorldInfo> = {}, plugins: Plugin[] = [Stock]) =>
	createSim({ plugins, backendFactory: rapier(16), world: world(extra) });

describe('rule values of a world', () => {
	test("come from the preset, with the world's own values first", async () => {
		const career = await make({ preset: 'stock.career', rules: { 'stock.comms-scale': 2 } });
		const rules = career.snapshot().rules!;
		expect(rules['stock.economy']).toBe(true);
		expect(rules['stock.life-support']).toBe('simple');
		expect(rules['stock.control-without-signal']).toBe('none');
		expect(rules['stock.comms-scale']).toBe(2);
		expect(rules['stock.reliability']).toBe(false);
		career.dispose();
		const hard = await make({ preset: 'stock.career-hardcore' });
		expect(hard.snapshot().rules!['stock.life-support']).toBe('full');
		expect(hard.snapshot().rules!['stock.crew-rest']).toBe(true);
		hard.dispose();
		const sandbox = await make();
		expect(sandbox.snapshot().rules!['stock.economy']).toBe(false);
		expect(sandbox.snapshot().rules!['stock.control-without-signal']).toBe('full');
		expect(sandbox.snapshot().rules!['stock.agency-count']).toBe(0);
		sandbox.dispose();
	});

	test('a rule from a mod that is not loaded is kept in the save and reported', async () => {
		const sim = await make({ rules: { 'ghost.weather': 'stormy' } });
		expect(sim.unknownRules).toEqual(['ghost.weather']);
		expect(sim.save().worldInfo.rules['ghost.weather']).toBe('stormy');
		expect(sim.snapshot().rules!['ghost.weather']).toBeUndefined();
		sim.dispose();
	});

	test('a value of the wrong type refuses the run', async () => {
		await expect(make({ rules: { 'stock.economy': 'yes' } })).rejects.toThrow(
			/stock.economy: expected true or false/
		);
	});

	test('systems read the values through their context', async () => {
		const seen: unknown[] = [];
		const Probe = definePlugin({
			meta: { id: 'probe', version: '1.0.0', api: '^0.1' },
			setup(ctx) {
				ctx.systems.register(
					defineSystem({
						id: 'probe.read',
						phase: 'pre-physics',
						update: (_w, _dt, c) =>
							void seen.push(c.rules.get('stock.economy'), c.rules.get('ghost.x'))
					})
				);
			}
		});
		const sim = await make({ preset: 'stock.career' }, [Stock, Probe]);
		sim.dispatch({ type: 'load-vessel', design: twoStage() });
		sim.step(0.02);
		expect(seen.slice(0, 2)).toEqual([true, undefined]);
		sim.dispose();
	});
});

describe('set-rule', () => {
	test('a changeable rule changes from the next step, with one changelog entry and one event', async () => {
		const sim = await make();
		for (let i = 0; i < 10; i++) sim.step(0.02);
		const events: unknown[] = [];
		sim.events.on('world:rule-changed', (e) => events.push(e));
		const t = sim.time;
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: true })).toEqual({
			ok: true
		});
		sim.step(0.02);
		expect(sim.snapshot().rules!['stock.economy']).toBe(true);
		expect(sim.worldInfo.rules['stock.economy']).toBe(true);
		expect(sim.worldInfo.changelog).toEqual([
			{ time: t, rule: 'stock.economy', from: false, to: true }
		]);
		expect(events).toEqual([{ rule: 'stock.economy', from: false, to: true, time: t }]);
		// The same value again is accepted and logs nothing.
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: true }).ok).toBe(true);
		expect(sim.worldInfo.changelog).toHaveLength(1);
		sim.dispose();
	});

	test('identity rules, unknown rules and wrong values are refused with a reason', async () => {
		const sim = await make();
		const reason = (rule: string, value: boolean | number | string) => {
			const r = sim.dispatch({ type: 'set-rule', rule, value });
			return r.ok ? 'accepted' : r.reason;
		};
		expect(reason('gravityModel', 'n-body')).toBe('identity rule');
		expect(reason('seed', 3)).toBe('identity rule');
		expect(reason('stock.agency-type', 'company')).toBe('identity rule');
		expect(reason('stock.nothing', 1)).toBe('unknown rule "stock.nothing"');
		expect(reason('stock.agency-count', 2.5)).toMatch(/invalid value.*whole number from 0 to 6/);
		expect(reason('stock.life-support', 'luxury')).toMatch(/one of off, simple, full/);
		expect(sim.worldInfo.changelog).toEqual([]);
		sim.dispose();
	});
});

describe('resume after a rule change', () => {
	test('the save resumes with the same value and changelog, byte for byte', async () => {
		const sim = await make({ preset: 'stock.career' });
		sim.step(0.5);
		sim.dispatch({ type: 'set-rule', rule: 'stock.life-support', value: 'full' });
		sim.step(0.5);
		sim.dispatch({ type: 'set-rule', rule: 'stock.funds-multiplier', value: 2.5 });
		const text = JSON.stringify(sim.save());
		const resumed = await createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			resume: JSON.parse(text)
		});
		expect(JSON.stringify(resumed.save())).toBe(text);
		expect(resumed.snapshot().rules!['stock.life-support']).toBe('full');
		expect(resumed.snapshot().rules!['stock.funds-multiplier']).toBe(2.5);
		expect(resumed.worldInfo.changelog.map((c) => [c.rule, c.from, c.to])).toEqual([
			['stock.life-support', 'simple', 'full'],
			['stock.funds-multiplier', 1, 2.5]
		]);
		expect(resumed.worldInfo.preset).toBe('stock.career');
		sim.dispose();
		resumed.dispose();
	});
});
