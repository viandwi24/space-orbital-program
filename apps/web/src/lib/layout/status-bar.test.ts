/** Plan 204: the status bar from a snapshot fixture and the bell's unread count. */
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@orbital/core';
import { connection, createBellFeed, savedAgo, statusItems } from './status-bar';

const snap = (extra: Partial<Snapshot>): Snapshot => ({ t: 0, vessels: [], bodies: [], ...extra });

describe('status bar', () => {
	it('shows funds, science and reputation from the snapshot', () => {
		const s = snap({
			economy: { enabled: true, funds: 123456.7, science: 12.34, reputation: 40.4 }
		});
		expect(statusItems(s)).toEqual({
			funds: '123,457',
			science: '12.3',
			reputation: '40',
			contracts: null
		});
	});

	it('hides the money with the economy off', () => {
		const s = snap({ economy: { enabled: false, funds: 0, science: 5, reputation: 0 } });
		expect(statusItems(s)).toMatchObject({ funds: null, science: '5.0', reputation: null });
		expect(statusItems(null).funds).toBeNull();
	});

	it('counts active contracts (BASE_LAYOUT §4)', () => {
		const s = snap({ contracts: { enabled: true, used: 2, slots: 3 } as Snapshot['contracts'] });
		expect(statusItems(s).contracts).toBe('2 active');
	});

	it('shows the connection: comms off, the network, the focused link or its loss', () => {
		expect(connection(null)).toEqual({ online: true, text: 'Connected', detail: 'Comms off' });
		const station = {
			id: 'ksc',
			label: 'KSC',
			body: 'kerbin',
			position: { x: 0, y: 0, z: 0 },
			range: 1
		};
		const link = { vessel: 4, to: 'ksc', reason: null, route: ['r1', 'r2', 'ksc'] };
		const s = snap({
			network: { stations: [station, { ...station, id: 'b' }], vessels: [link] }
		} as unknown as Partial<Snapshot>);
		expect(connection(s)).toMatchObject({ online: true, detail: '2 stations' });
		expect(connection(s, 4)).toMatchObject({ online: true, detail: '2 stations · 2 relays' });
		const lost = snap({
			network: { stations: [station], vessels: [{ ...link, to: null, reason: 'Out of range' }] }
		} as unknown as Partial<Snapshot>);
		expect(connection(lost, 4)).toEqual({
			online: false,
			text: 'No signal',
			detail: 'Out of range'
		});
	});

	it('says how long ago the world was saved', () => {
		expect(savedAgo(null, 0)).toBe('Not saved yet');
		expect(savedAgo(1000, 13_400)).toBe('Saved 12 s ago');
		expect(savedAgo(0, 180_000)).toBe('Saved 3 min ago');
	});
});

describe('bell', () => {
	it('counts unread entries, newest first, and clears them', () => {
		const bell = createBellFeed(3, () => 7);
		bell.push({ source: 'sim', text: 'a' });
		bell.push({ source: 'sim', text: 'b' });
		expect(bell.unread).toBe(2);
		expect(bell.entries.map((e) => e.text)).toEqual(['b', 'a']);
		bell.markAllRead();
		expect(bell.unread).toBe(0);
		for (const t of ['c', 'd', 'e']) bell.push({ source: 'sim', text: t });
		expect(bell.entries.map((e) => e.text)).toEqual(['e', 'd', 'c']);
		expect(bell.unread).toBe(3);
	});
});
