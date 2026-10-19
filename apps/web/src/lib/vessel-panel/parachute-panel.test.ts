/** Plan 209: a parachute's part panel says its state and the airflow in text, with its four buttons. */
import { loadPlugins, type VesselSnapshot } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VesselPanel from './VesselPanel.svelte';
import { vesselView } from './vessel-model';

const { registries } = loadPlugins([Stock]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	groups: registries.actionGroups.list()
};

/** A capsule falling fast under an armed main chute that waits for the air to slow it. */
const descent = {
	id: 1,
	parts: [
		{
			id: 7,
			definition: 'stock.parachute',
			modules: {
				'stock.parachute': {
					status: 'armed',
					mode: 'when-safe',
					minPressure: 0.04,
					deployHeight: 1000,
					opening: 0,
					safety: 'unsafe',
					canopy: 0,
					open: false
				}
			}
		}
	]
} as unknown as VesselSnapshot;

describe('parachute panel', () => {
	it('reads Armed and Unsafe as text and offers Deploy, Force deploy, Disarm and Cut', () => {
		const view = vesselView(descent, content);
		const part = view.parts[0]!;
		expect(part.readouts.map((r) => [r.label, r.value])).toEqual([
			['Parachute', 'Armed'],
			['Airflow', 'Unsafe']
		]);
		const triggers = part.controls.filter((c) => c.kind === 'trigger');
		expect(triggers.map((c) => [c.label, c.enabled])).toEqual([
			['Deploy', false],
			['Force deploy', true],
			['Disarm', true],
			['Cut', false]
		]);
		expect(triggers.find((c) => c.id === 'deploy')!.group).toBe('stock.parachutes');
		const html = render(VesselPanel, {
			props: {
				vessel: 1 as never,
				name: 'Capsule',
				view,
				oncommand: () => {},
				onhighlight: () => {},
				initialTab: 'parts'
			}
		}).body;
		expect(html).toContain('data-testid="part-7-safety"');
		expect(html).toMatch(/data-testid="part-7-safety"[^>]*>Unsafe</);
		for (const label of ['Deploy', 'Force deploy', 'Disarm', 'Cut'])
			expect(html).toContain(`>${label}<`);
	});
});
