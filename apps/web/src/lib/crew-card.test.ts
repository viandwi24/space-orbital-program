/** The crew card (plan 107, ADR 0181 point 8): condition, causes and time left. */
import type { Snapshot, VesselSnapshot } from '@orbital/core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { crewCard } from './crew-card';
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
		expect(render(CrewPanel, { props: {} }).body).toContain('Crew comes with plan 108.');
	});
});
