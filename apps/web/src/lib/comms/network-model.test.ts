/** Comms tier 1 on the page (plan 115, ADR 0158): the badge, the Comms tab, the Network layer. */
import type { Snapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { commsTab, linkBadge, linkText, networkLines, networkStations } from './network-model';

const snap = (vessels: NonNullable<Snapshot['network']>['vessels']) =>
	({
		t: 0,
		bodies: [
			{ id: 'stock.home', position: { x: 1000, y: 0, z: 0 } },
			{ id: 'stock.cinder', position: { x: 5000, y: 0, z: 0 } }
		],
		vessels: [
			{ id: 1, name: 'Relay', soi: 'stock.home', position: { x: 10, y: 0, z: 0 } },
			{ id: 2, name: 'Probe', soi: 'stock.cinder', position: { x: 0, y: 20, z: 0 } }
		],
		network: {
			stations: [
				{
					id: 'stock.ksc',
					label: 'KSC Dish',
					body: 'stock.home',
					position: { x: 1600, y: 0, z: 0 },
					range: 1
				}
			],
			vessels
		}
	}) as unknown as Snapshot;

describe('comms on the page (plan 115)', () => {
	it('an occluded link says which body is in the way, in the badge and the tab', () => {
		const s = snap([
			{
				vessel: 2 as never,
				to: null,
				reason: 'blocked by stock.cinder',
				control: 'none',
				blackout: 0
			}
		]);
		expect(linkBadge(s, 2)).toEqual({
			state: 'lost',
			text: 'Occluded by Cinder',
			bars: 0,
			blackout: 0
		});
		expect(commsTab(s, 2, 'Probe')).toMatchObject({
			linked: false,
			reason: 'Occluded by Cinder',
			path: ['Probe'],
			endpoints: [{ id: 'stock.ksc', label: 'KSC Dish', body: 'Home', current: false }]
		});
	});

	it('every reason has words; a link names its endpoint, a partial one shows fewer bars', () => {
		expect(
			['no antenna', 'antennas off', 'plasma blackout', 'out of range', 'blocked by terrain'].map(
				linkText
			)
		).toEqual([
			'No antenna',
			'Antenna off',
			'Plasma blackout',
			'Out of range',
			'Blocked by terrain'
		]);
		const s = snap([
			{ vessel: 1 as never, to: 'stock.ksc', reason: null, control: 'full', blackout: 0 },
			{ vessel: 2 as never, to: 'vessel:1', reason: null, control: 'partial', blackout: 0 }
		]);
		expect(linkBadge(s, 1)).toMatchObject({ state: 'linked', text: 'Linked to KSC Dish', bars: 4 });
		expect(linkBadge(s, 2)).toMatchObject({ state: 'partial', text: 'Linked to Relay', bars: 2 });
		expect(commsTab(s, 2, 'Probe')!.path).toEqual(['Probe', 'Relay']);
		expect(linkBadge({ ...s, network: undefined } as Snapshot, 1)).toBeNull();
	});

	it('the Network layer gets one line per link, in the system frame, and the stations', () => {
		const s = snap([
			{ vessel: 1 as never, to: 'stock.ksc', reason: null, control: 'full', blackout: 0 },
			{ vessel: 2 as never, to: 'vessel:1', reason: null, control: 'partial', blackout: 0 }
		]);
		expect(networkLines(s)).toEqual([
			{ key: '1', from: { x: 1010, y: 0, z: 0 }, to: { x: 1600, y: 0, z: 0 }, state: 'full' },
			{ key: '2', from: { x: 5000, y: 20, z: 0 }, to: { x: 1010, y: 0, z: 0 }, state: 'partial' }
		]);
		const down = snap([
			{ vessel: 1 as never, to: null, reason: 'out of range', control: 'none', blackout: 0 }
		]);
		expect(networkLines(down)).toEqual([]);
		expect(networkStations(s).map((x) => x.label)).toEqual(['KSC Dish']);
	});
});
