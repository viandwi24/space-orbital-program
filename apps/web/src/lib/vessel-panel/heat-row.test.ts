/** Plan 212 (ADR 0204 point 6): a hot part's temperature bar with its value in text. */
import { loadPlugins, type VesselSnapshot } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VesselPanel from './VesselPanel.svelte';
import { heatOf, vesselView } from './vessel-model';

const { registries } = loadPlugins([Stock]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	groups: registries.actionGroups.list()
};

describe('temperature rows', () => {
	it('show from 400 K or half the limit, with the value in text', () => {
		expect(heatOf({ temperature: 300, maxTemperature: 2000 })).toBeUndefined();
		expect(heatOf({ temperature: 700, maxTemperature: 3300 })).toEqual({
			temperature: 700,
			max: 3300
		});
		expect(heatOf({ temperature: 390, maxTemperature: 600 })).toEqual({
			temperature: 390,
			max: 600
		});
		const vessel = {
			id: 1,
			parts: [
				{
					id: 4,
					definition: 'stock.heat-shield',
					modules: { 'stock.heat-shield': { ablator: 90 } },
					temperature: 701.4,
					maxTemperature: 3300
				}
			]
		} as unknown as VesselSnapshot;
		const view = vesselView(vessel, content);
		expect(view.parts[0]!.heat).toEqual({ temperature: 701.4, max: 3300 });
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
		expect(html).toMatch(/data-testid="part-4-temperature"[^>]*>701 K of 3300 K</);
	});
});
