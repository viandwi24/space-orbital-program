/** The Home last-world card (plan 089): honest placeholders without a flight. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { legacyWorldRecord } from '../save/world-record';
import LastWorldCard from './LastWorldCard.svelte';

const world = legacyWorldRecord(1_000, [], { saves: 0, vessel: null, simTime: 0 });

describe('last-world card', () => {
	it('renders [—] for a world without a flight summary', () => {
		const html = render(LastWorldCard, {
			props: { world, mode: 'Sandbox', newest: null, now: 2_000 }
		}).body;
		expect(html).toContain('Legacy world');
		expect(html).toContain('No flight yet');
		// vessel, altitude, velocity, delta-v and mission time are all unknown
		expect(html.split('[—]').length - 1).toBe(5);
	});

	it('shows the newest save: vessel, altitude, mission time; velocity and delta-v stay [—]', () => {
		const newest = {
			format: 'orbital-game-save',
			formatVersion: 3,
			id: 'auto-1',
			name: 'Autosave',
			kind: 'auto',
			createdAt: 1_000,
			summary: {
				vessel: 'Kestrel',
				mode: 'on-rails',
				altitude: 82_000,
				simTime: 3_725,
				vessels: 2,
				warp: 1
			}
		} as never;
		const html = render(LastWorldCard, {
			props: { world, mode: 'Sandbox', newest, now: 7_201_000 }
		}).body;
		expect(html).toContain('Kestrel');
		expect(html).toContain('On rails');
		expect(html).toContain('Autosave · 2 h ago');
		expect(html).toContain('T+1:02:05');
		expect(html.split('[—]').length - 1).toBe(2);
	});
});
