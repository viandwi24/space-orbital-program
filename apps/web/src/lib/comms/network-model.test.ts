/** Comms tier 1 on the page (plan 115, ADR 0158): the badge, the Comms tab, the Network layer. */
import { linkBudget, type Snapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import {
	barsForRate,
	commsTab,
	linkBadge,
	linkText,
	linkState,
	networkLines,
	projectNetwork,
	WEAK_MARGIN_DB,
	networkStations,
	rateText
} from './network-model';

type NetworkVessel = NonNullable<Snapshot['network']>['vessels'][number];
/** Network vessels; `rate`, `margin` (116), `route`, `latency` and `mode` (117) have defaults. */
const snap = (
	list: Array<
		Omit<
			NetworkVessel,
			'rate' | 'margin' | 'route' | 'latency' | 'mode' | 'channel' | 'encrypted' | 'interference'
		> &
			Partial<NetworkVessel>
	>
) => {
	const vessels = list.map((v) => ({
		rate: null,
		margin: null,
		route: v.to ? [v.to] : [],
		latency: null,
		mode: { kind: 'auto' as const },
		channel: v.to ? 0 : null,
		encrypted: false,
		interference: 0,
		...v
	}));
	return withNetwork(vessels);
};
const withNetwork = (vessels: NetworkVessel[]) =>
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

	it('a link is drawn weak while its margin is thin, partial while control is partial (plan 258)', () => {
		expect(linkState('full', null)).toBe('full');
		expect(linkState('full', 12)).toBe('full');
		expect(linkState('full', WEAK_MARGIN_DB)).toBe('full');
		expect(linkState('full', 3)).toBe('weak');
		expect(linkState('partial', 30)).toBe('partial');
		const s = snap([
			{ vessel: 1 as never, to: 'stock.ksc', reason: null, control: 'full', blackout: 0, margin: 2 }
		]);
		expect(networkLines(s)[0]!.state).toBe('weak');
	});

	it('bars and words follow the rate (plan 116, ADR 0185 point 9)', () => {
		expect([null, 0, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9].map(barsForRate)).toEqual([
			4, 1, 1, 2, 2, 3, 3, 4, 4
		]);
		expect([0, 1e3, 1e5, 1e6, 1e9].map(rateText)).toEqual([
			'Commands only',
			'1 kbit/s',
			'100 kbit/s',
			'1 Mbit/s',
			'1 Gbit/s'
		]);
		const s = snap([
			{
				vessel: 2 as never,
				to: 'stock.ksc',
				reason: null,
				control: 'full',
				blackout: 0,
				rate: 1e5,
				margin: 25
			}
		]);
		expect(linkBadge(s, 2)!.bars).toBe(2);
		expect(commsTab(s, 2, 'Probe')).toMatchObject({ bars: 2, rate: '100 kbit/s', budget: null });
	});

	it('a relayed route shows every hop, its light time and the mode buttons (plan 117)', () => {
		const s = snap([
			{
				vessel: 2 as never,
				to: 'vessel:1',
				reason: null,
				control: 'full',
				blackout: 0,
				route: ['vessel:1', 'stock.ksc'],
				latency: 3,
				mode: { kind: 'manual', via: ['vessel:1', 'stock.ksc'] }
			}
		]);
		expect(linkBadge(s, 2)!.text).toBe('Linked to Relay · 3.0 s');
		const tab = commsTab(s, 2, 'Probe')!;
		expect(tab.path).toEqual(['Probe', 'Relay', 'KSC Dish']);
		expect(tab.route).toBe('manual');
		expect(tab.routeLabel).toBe('Pinned');
		expect(tab.latency).toBe('3.0 s');
		expect(tab.modes.map((m) => [m.label, m.active])).toEqual([
			['Auto', false],
			['Fewest hops', false],
			['Lowest latency', false],
			['Pinned', true]
		]);
		expect(tab.modes[0]!.command).toEqual({
			type: 'comms-route',
			vessel: 2,
			mode: { kind: 'auto' }
		});
		expect(tab.endpoints[0]!.current).toBe(true);
		expect(linkText('route broken at vessel:1')).toBe('Pinned route broken at vessel 1');
	});

	it('the radio queue shows each item sent, its arrival and the next contact (plan 119)', () => {
		const s = snap([
			{ vessel: 2 as never, to: null, reason: 'out of range', control: 'full', blackout: 0 }
		]) as Snapshot;
		(s as { t: number }).t = 100;
		s.network!.queues = [
			{
				vessel: 2 as never,
				custody: null,
				nextContact: 820,
				items: [
					{
						id: '7:0',
						kind: 'stock.science',
						bits: 1e7,
						sent: 2.5e6,
						origin: 2 as never,
						eta: 8_320
					},
					{ id: '7:1', kind: 'stock.bulk', bits: 5e5, sent: 0, origin: 2 as never, eta: null }
				]
			}
		];
		const tab = commsTab(s, 2, 'Probe')!;
		expect(tab.contact).toBe('Next contact in 12 min 0 s');
		expect(tab.queue.map((q) => [q.label, q.progress, q.eta])).toEqual([
			['Science · 10 Mbit', 0.25, 'Arrives in 137 min 0 s'],
			['Bulk · 500 kbit', 0, 'Waits for a contact']
		]);
		expect(tab.queue[0]!.cancel).toEqual({ type: 'transmission-cancel', vessel: 2, item: '7:0' });
	});

	it('the channel line and a licence to buy for an unlicensed channel (plan 120)', () => {
		const s = snap([
			{
				vessel: 2 as never,
				to: 'stock.ksc',
				reason: null,
				control: 'full',
				blackout: 0,
				channel: 2,
				encrypted: true,
				interference: 3
			}
		]) as Snapshot;
		const net = s.network as unknown as Record<string, unknown>;
		net.licences = [];
		const budget = linkBudget({
			power: 5,
			txGain: 2,
			rxGain: 44.85,
			distance: 2e6,
			band: { id: 'stock.s', label: 'S band', frequency: 2.25e9, noiseTemperature: 100 }
		});
		net.inspector = {
			vessel: 2,
			to: 'stock.ksc',
			budget: { ...budget, channel: 2, encrypted: true, interference: 3 }
		};
		const tab = commsTab(s, 2, 'Probe')!;
		expect(tab.channel).toBe('S band channel 2 · encrypted · −3 dB interference');
		expect(tab.licence).toEqual({
			label: 'Buy a licence for S band channel 2',
			command: { type: 'licence-buy', band: 'stock.s', channel: 2 }
		});
		net.licences = [{ band: 'stock.s', channel: 2 }];
		expect(commsTab(s, 2, 'Probe')!.licence).toBeNull();
	});
});

describe('the station names follow the gate of the caller (plan 382)', () => {
	const net = {
		network: {
			stations: [
				{
					id: 'site',
					label: 'Space Center',
					body: 'stock.home',
					position: { x: 0, y: 0, z: 0 },
					range: 1
				}
			],
			vessels: []
		},
		vessels: [],
		bodies: []
	} as never;
	const project = () => ({ x: 5, y: 6, hidden: false });
	it('the marker stays and the name is hidden when the gate says the body is far', () => {
		const far = projectNetwork(net, project, () => false);
		expect(far.stations).toEqual([
			{ id: 'site', label: 'Space Center', x: 5, y: 6, showLabel: false }
		]);
		expect(projectNetwork(net, project, (body) => body === 'stock.home').stations[0]!.showLabel).toBe(true);
		expect(projectNetwork(net, project).stations[0]!.showLabel).toBe(true);
	});
});
