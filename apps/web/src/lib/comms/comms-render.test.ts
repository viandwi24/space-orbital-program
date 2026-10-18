/** Plan 115: an occluded link shows "Occluded by Cinder" in the HUD badge and the Comms tab, rendered. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import LinkBadge from '../hud/LinkBadge.svelte';
import VesselPanel from '../vessel-panel/VesselPanel.svelte';
import { commsTab, linkBadge } from './network-model';

const snap = {
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
} as never;

describe('the comms interface rendered (plan 115)', () => {
	it('the badge and the Comms tab name the occluding moon', () => {
		const badge = render(LinkBadge, { props: { link: linkBadge(snap, 2)! } }).body;
		expect(badge).toContain('Occluded by Cinder');
		expect(badge).toContain('data-state="lost"');
		const panel = render(VesselPanel, {
			props: {
				vessel: 2 as never,
				name: 'Probe',
				view: { groups: [], parts: [] },
				comms: commsTab(snap, 2, 'Probe'),
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
});
