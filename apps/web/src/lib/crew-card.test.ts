/** The crew card (plan 107, ADR 0181 point 8): condition, causes and time left. */
import type { Snapshot, VesselSnapshot } from '@orbital/core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { crewCard } from './crew-card';
import { broadcastOffers, suitRadio } from './comms/suit-radio';
import CrewPanel from './hud/CrewPanel.svelte';

const DAY = 21_600;
const snap = { t: 1_000, crew: [{ id: 'c1', name: 'Ada Vega' }] } as unknown as Snapshot;
const vessel = {
	crew: [
		{
			member: 'c1',
			part: 2,
			abilities: {},
			morale: 0.8,
			fatigue: 0.25,
			dose: 0.1234,
			performance: 0.8,
			shortages: [{ resource: 'stock.supplies', since: 400 }]
		},
		{ member: 'c2', part: 2, abilities: {}, morale: 1 }
	],
	lifeSupport: {
		mode: 'simple',
		crew: 2,
		consumables: [{ resource: 'stock.supplies', amount: 0, rate: 1, timeLeft: 0 }]
	}
} as unknown as VesselSnapshot;

describe('crew card', () => {
	it('names each effect with its cause and says how long until the grace ends', () => {
		const card = crewCard(snap, vessel, DAY)!;
		expect(card.rows[0]).toEqual({
			member: 'c1',
			name: 'Ada Vega',
			stats: ['Morale 80 %', 'Fatigue 25 %', 'Dose 0.12 mSv', 'Performance 80 %'],
			causes: [
				'Morale falls with time aboard',
				'Crowded: 2 aboard',
				'Tired from working in flight',
				// 3 days of grace from t = 400, now t = 1 000
				'Out of supplies: 17:50:00 to live'
			]
		});
		expect(card.rows[1]!.name).toBe('c2');
		expect(card.supplies).toEqual(['Supplies out']);
		expect(crewCard(snap, { crew: [] } as unknown as VesselSnapshot, DAY)).toBeNull();
	});

	it('renders rows when crew is aboard, and the placeholder without', () => {
		const html = render(CrewPanel, { props: { card: crewCard(snap, vessel, DAY) } }).body;
		expect(html).toContain('Ada Vega');
		expect(html).toContain('Out of supplies: 17:50:00 to live');
		expect(render(CrewPanel, { props: {} }).body).toContain('No crew aboard.');
	});

	it('offers EVA per member, and while outside the walk, flag and board buttons (plan 109)', () => {
		const card = crewCard(snap, vessel, DAY);
		const inside = render(CrewPanel, { props: { card, oneva: () => {} } }).body;
		expect(inside).toContain('data-testid="crew-eva-');
		const outside = render(CrewPanel, {
			props: { card, eva: { suit: 9, name: 'Ada Vega', walking: false }, oneva: () => {} }
		}).body;
		expect(outside).toContain('Ada Vega is outside');
		for (const id of ['eva-walk-N', 'eva-walk-E', 'eva-flag', 'eva-board']) {
			expect(outside).toContain(`data-testid="${id}"`);
		}
		// one member outside at a time: no EVA buttons on the rows meanwhile
		expect(outside).not.toContain('data-testid="crew-eva-');
	});

	it('plan 108: lists the focused vessel crew, each with an IVA chip and the radio bars', () => {
		const card = crewCard(snap, vessel, DAY)!;
		const html = render(CrewPanel, { props: { card } }).body;
		expect(html.match(/data-testid="crew-row"/g)).toHaveLength(card.rows.length);
		expect(html.match(/data-testid="crew-suit"[^>]*>IVA</g)).toHaveLength(card.rows.length);
		// no comms network in this snapshot: the bars are offline and say why (plan 121)
		expect(html).toContain('No comms');
		expect(html).toContain('Ada Vega');
	});
});

describe('crew radios and broadcasts (plan 121, ADR 0193)', () => {
	const link = (vessel: number, to: string | null, reason: string | null, rate: number | null) => ({
		vessel,
		to,
		reason,
		rate,
		control: 'full',
		blackout: 0,
		margin: null,
		route: to ? [to] : [],
		latency: null,
		mode: { kind: 'auto' },
		channel: 0,
		encrypted: false,
		interference: 0
	});
	const net = (suit: ReturnType<typeof link>) =>
		({
			t: 1_000,
			crew: [{ id: 'c1', name: 'Ada Vega' }],
			vessels: [{ id: 4, name: 'Lander' }],
			network: {
				stations: [{ id: 'site:legacy', label: 'Home station' }],
				vessels: [link(4, 'site:legacy', null, 1e7), suit],
				licences: [],
				broadcasts: [
					{
						milestone: 'crewed-landing:stock.cinder',
						label: 'First crewed landing at stock.cinder',
						vessel: 4,
						until: 3_400,
						rate: 1e7,
						needs: 1e5
					},
					{
						milestone: 'crewed-eva:stock.cinder',
						label: 'First crewed eva at stock.cinder',
						vessel: 9,
						until: 3_500,
						rate: null,
						needs: 1e5
					}
				]
			}
		}) as unknown as Snapshot;
	const inside = { ...vessel, id: 4 } as unknown as VesselSnapshot;
	const eva = (s: Snapshot) => ({
		suit: 9,
		name: 'Ada Vega',
		walking: false,
		radio: suitRadio(s, 9)
	});

	it('shows the suit radio relayed through the lander, then cut behind a ridge with the reason', () => {
		const relayed = net(link(9, 'vessel:4', null, 1e9));
		let html = render(CrewPanel, {
			props: { card: crewCard(relayed, inside, DAY), eva: eva(relayed) }
		}).body;
		expect(html).toMatch(
			/data-testid="suit-radio"[\s\S]*?data-level="4"[\s\S]*?Suit radio · via Lander/
		);
		// the crew rows inside show the lander's own link
		expect(html).toMatch(/<span[^>]*data-tip="via Home station"[^>]*data-testid="crew-radio"/);
		const cut = net(link(9, null, 'blocked by terrain', null));
		html = render(CrewPanel, { props: { card: crewCard(cut, inside, DAY), eva: eva(cut) } }).body;
		expect(html).toMatch(
			/data-testid="suit-radio"[\s\S]*?No signal[\s\S]*?Suit radio · Blocked by terrain/
		);
	});

	it('offers a live broadcast when the route has the rate, and says what is missing otherwise', () => {
		const s = net(link(9, 'vessel:4', null, 1e9));
		const offers = broadcastOffers(s);
		expect(offers).toEqual([
			{
				milestone: 'crewed-landing:stock.cinder',
				label: 'First crewed landing at stock.cinder',
				ready: true,
				detail: '10 Mbit/s home · 40 min left'
			},
			{
				milestone: 'crewed-eva:stock.cinder',
				label: 'First crewed eva at stock.cinder',
				ready: false,
				detail: 'Needs 100 kbit/s; no link to the ground'
			}
		]);
		const html = render(CrewPanel, { props: { broadcasts: offers, onbroadcast: () => {} } }).body;
		expect(html).toMatch(
			/<button[^>]*data-testid="broadcast-crewed-landing:stock.cinder"[^>]*>Broadcast live/
		);
		expect(html).toMatch(
			/<button[^>]*disabled[^>]*data-testid="broadcast-crewed-eva:stock.cinder"/
		);
	});
});
