/** The vessel panel (plan 111, ADR 0153): controls from descriptors, group clicks. */
import { loadPlugins, type VesselSnapshot } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { defineModule, definePart, definePlugin, z } from '@orbital/sdk';
import { createSim } from '@orbital/sim';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import VesselPanel from './VesselPanel.svelte';
import { controlCommand, groupCommand, vesselView } from './vessel-model';

const Dial = defineModule({
	id: 'fix.dial',
	config: z.object({}),
	describe: (_config, view) => ({
		actions: [
			{
				id: 'setLevel',
				label: 'Level',
				kind: 'value',
				value: (view as { level?: number } | undefined)?.level ?? 0,
				min: 0,
				max: 10,
				step: 1,
				unit: 'kN',
				enabled: true
			}
		]
	}),
	actions: { setLevel: () => {} }
});
const fixture = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: [],
	setup(ctx) {
		ctx.modules.register(Dial);
		ctx.parts.register(
			definePart({ id: 'fix.dial-part', title: 'Dial', mass: 10, modules: [[Dial, {}]] })
		);
	}
});

describe('vessel panel', () => {
	it('a mod module with a value action renders a slider and sends `action` with the new value', () => {
		const { registries } = loadPlugins([fixture]);
		const content = {
			parts: registries.parts,
			modules: registries.modules,
			groups: registries.actionGroups.list()
		};
		const vessel = {
			id: 1,
			parts: [{ id: 5, definition: 'fix.dial-part', modules: { 'fix.dial': { level: 3 } } }]
		} as unknown as VesselSnapshot;
		const view = vesselView(vessel, content);
		const c = view.parts[0]!.controls[0]!;
		expect(c).toMatchObject({
			kind: 'value',
			value: 3,
			min: 0,
			max: 10,
			unit: 'kN',
			module: 'fix.dial'
		});
		const html = render(VesselPanel, {
			props: {
				vessel: 1 as never,
				name: 'Probe',
				view,
				oncommand: () => {},
				onhighlight: () => {},
				initialTab: 'parts'
			}
		}).body;
		expect(html).toContain('type="range"');
		expect(html).toContain('3 kN');
		expect(controlCommand(1 as never, 5 as never, c, 7)).toEqual({
			command: {
				type: 'action',
				vessel: 1,
				part: 5,
				module: 'fix.dial',
				action: 'setLevel',
				args: 7
			}
		});
		expect(controlCommand(1 as never, 5 as never, c, 11)).toHaveProperty('reason');
	});

	it('the engines group is mixed with one of two engines on, and one click turns both off', async () => {
		const plugins = [Stock];
		const { registries } = loadPlugins(plugins);
		const content = {
			parts: registries.parts,
			modules: registries.modules,
			groups: registries.actionGroups.list()
		};
		const sim = await createSim({
			plugins,
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			seed: 2
		});
		const r = sim.dispatch({ type: 'load-vessel', design: referenceTwoStage() });
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		for (let i = 0; i < 5; i++) sim.step(0.02);
		const vessel = () => sim.snapshot().vessels.find((v) => v.id === id)!;
		const engines = () =>
			vesselView(vessel(), content).groups.find((g) => g.id === 'stock.engines')!;
		expect(engines()).toMatchObject({ state: 'mixed', parts: 2 });
		const cmd = groupCommand(id, engines());
		expect(cmd).toEqual({ type: 'action-group', vessel: id, group: 'stock.engines', value: false });
		expect(sim.dispatch(cmd).ok).toBe(true);
		sim.step(0.02);
		expect(engines().state).toBe('off');
	});
});
