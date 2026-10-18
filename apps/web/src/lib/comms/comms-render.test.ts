/** Plan 115: an occluded link shows "Occluded by Cinder" in the HUD badge and the Comms tab, rendered. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import LinkBadge from '../hud/LinkBadge.svelte';
import VesselPanel from '../vessel-panel/VesselPanel.svelte';
import { linkBudget } from '@orbital/core';
import { commsTab, linkBadge } from './network-model';

const snap: Record<string, unknown> = {
	t: 0,
	bodies: [],
	vessels: [{ id: 2, name: 'Probe', soi: 'stock.cinder', position: { x: 0, y: 0, z: 0 } }],
	network: {
		stations: [
			{
				id: 'stock.ksc',
				label: 'KSC Dish',
				body: 'stock.home',
				position: { x: 0, y: 0, z: 0 },
				range: 1
			}
		],
		vessels: [
			{ vessel: 2, to: null, reason: 'blocked by stock.cinder', control: 'none', blackout: 0 }
		]
	}
};

describe('the comms interface rendered (plan 115)', () => {
	it('the badge and the Comms tab name the occluding moon', () => {
		const badge = render(LinkBadge, { props: { link: linkBadge(snap as never, 2)! } }).body;
		expect(badge).toContain('Occluded by Cinder');
		expect(badge).toContain('data-state="lost"');
		const panel = render(VesselPanel, {
			props: {
				vessel: 2 as never,
				name: 'Probe',
				view: { groups: [], parts: [] },
				comms: commsTab(snap as never, 2, 'Probe'),
				transmitters: [],
				initialTab: 'comms',
				oncommand: () => {},
				onhighlight: () => {}
			}
		}).body;
		expect(panel).toContain('Occluded by Cinder');
		expect(panel).toContain('KSC Dish');
		expect(panel).toContain('No antenna on board.');
	});

	it('the link inspector lists each term of the budget with its value (plan 116)', () => {
		const budget = linkBudget({
			power: 5,
			txGain: 2,
			rxGain: 44.85,
			distance: 2e6,
			band: { id: 'stock.s', label: 'S band', frequency: 2.25e9, noiseTemperature: 100 }
		});
		const linked = {
			...snap,
			network: {
				...(snap.network as object),
				vessels: [
					{
						vessel: 2,
						to: 'stock.ksc',
						reason: null,
						control: 'full',
						blackout: 0,
						rate: budget.rate,
						margin: budget.margin
					}
				],
				inspector: { vessel: 2, to: 'stock.ksc', budget }
			}
		} as never;
		const tab = commsTab(linked, 2, 'Probe')!;
		expect(tab.rate).toBe('1 Gbit/s');
		expect(tab.bars).toBe(4);
		const html = render(VesselPanel, {
			props: {
				vessel: 2 as never,
				name: 'Probe',
				view: { groups: [], parts: [] },
				comms: tab,
				transmitters: [],
				initialTab: 'comms',
				oncommand: () => {},
				onhighlight: () => {}
			}
		}).body;
		expect(html).toContain('data-testid="comms-budget"');
		const terms: Array<[string, string]> = [
			['Band', 'S band · 2.25 GHz'],
			['Transmit power', '7.0 dBW'],
			['Transmit gain', '2.0 dBi'],
			['Distance', '2 000 km'],
			['Comms scale', '× 1'],
			['Effective distance', '2 000 km'],
			['Free-space loss', `${(-budget.pathLoss).toFixed(1)} dB`],
			['Receive gain', '44.9 dBi'],
			['Received power', `${budget.received.toFixed(1)} dBW`],
			['Noise temperature', '100 K'],
			['Noise density', '-208.6 dBW/Hz'],
			['Carrier to noise (C/N0)', `${budget.cn0.toFixed(1)} dB-Hz`],
			['Required Eb/N0', '3.0 dB'],
			['Margin at 1 kbit/s', `${budget.margin.toFixed(1)} dB`],
			['Data rate', '1 Gbit/s']
		];
		for (const [label, value] of terms) {
			expect(html).toContain(`>${label}</dt>`);
			expect(html).toContain(`>${value}</dd>`);
		}
	});
});
