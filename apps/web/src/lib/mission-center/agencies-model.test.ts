/** Plan 126 (ADR 0190): the agency strip and news in the Mission Center. */
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@orbital/core';
import { newsRows, rivalRows } from './agencies-model';

const DAY = 21_600;
const snap = {
	t: 10 * DAY,
	agencies: {
		agencies: [
			{
				id: 'stock.meridian',
				name: 'Meridian Space Authority',
				funds: 1,
				reputation: 5,
				objects: [
					{ vessel: 4, kind: 'relay', rent: 400, rented: true },
					{ vessel: 9, kind: 'satellite', rent: null, rented: false }
				],
				nextDay: 140
			}
		],
		news: [
			{
				time: 10 * DAY - 10,
				agency: 'stock.meridian',
				name: 'Meridian Space Authority',
				text: 'Meridian Space Authority placed a relay at 2400 km.'
			},
			{
				time: 7 * DAY,
				agency: 'stock.meridian',
				name: 'Meridian Space Authority',
				text: "Meridian Space Authority's satellite launch failed."
			}
		]
	}
} as unknown as Snapshot;

describe('rivals in the Mission Center (plan 126)', () => {
	it('lists each agency with its objects, rentals and next launch', () => {
		expect(rivalRows(snap)).toEqual([
			{
				id: 'stock.meridian',
				name: 'Meridian Space Authority',
				sub: '2 objects in orbit · 1 rented to you · next launch on day 140'
			}
		]);
		expect(rivalRows(null)).toEqual([]);
	});

	it('shows the news newest first with how long ago', () => {
		expect(newsRows(snap, DAY).map((n) => [n.text, n.when])).toEqual([
			['Meridian Space Authority placed a relay at 2400 km.', 'today'],
			["Meridian Space Authority's satellite launch failed.", '3 days ago']
		]);
	});
});
