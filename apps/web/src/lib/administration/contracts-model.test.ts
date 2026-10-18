/** Plan 099 (ADR 0186): the Administration Contracts tab from `Snapshot.contracts`. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@orbital/core';
import ContractsTab from './ContractsTab.svelte';
import {
	agencyStrip,
	contractCommand,
	contractDetail,
	contractRows,
	objectiveLabel
} from './contracts-model';

const DAY = 21_600;
const base = {
	template: 'stock.contract-orbit',
	key: 'k',
	brief: 'Put any vessel on an orbit.',
	advance: [{ currency: 'funds' as const, amount: 2_000 }],
	reward: [
		{ currency: 'funds' as const, amount: 10_000 },
		{ currency: 'reputation' as const, amount: 5 }
	],
	penalty: [
		{ currency: 'funds' as const, amount: -5_000 },
		{ currency: 'reputation' as const, amount: -3 }
	],
	deadline: 45 * DAY,
	estimate: { deltaV: 3_400, cost: 26_000 },
	offeredAt: 0,
	value: -14_000
};
const snap = {
	t: 10 * DAY,
	economy: { enabled: true, funds: 125_000, science: 12, reputation: 40 },
	contracts: {
		enabled: true,
		slots: 3,
		used: 1,
		offers: [
			{
				...base,
				id: 'gen.4',
				tier: 1,
				title: 'Orbit Home between 75 km and 300 km',
				objectives: {
					objective: 'stock.reach-orbit',
					params: { minPeriapsis: 75_000, maxApoapsis: 300_000 }
				},
				expires: 14 * DAY
			}
		],
		contracts: [
			{
				...base,
				id: 'gen.2',
				tier: 3,
				title: 'Land on Cinder and come home',
				objectives: {
					sequence: [
						{ objective: 'stock.land', params: { body: 'stock.cinder' } },
						{ objective: 'stock.return-home', params: {} }
					]
				},
				expires: 5 * DAY,
				instance: 'o1',
				status: 'active',
				acceptedAt: 2 * DAY,
				deadlineAt: 22 * DAY
			},
			{
				...base,
				id: 'gen.1',
				tier: 1,
				title: 'Reach 40 km above Home',
				objectives: { objective: 'stock.reach-altitude', params: { min: 40_000 } },
				expires: 3 * DAY,
				instance: 'o0',
				status: 'done',
				acceptedAt: DAY,
				deadlineAt: 31 * DAY
			}
		]
	},
	objectives: [
		{
			id: 'o1',
			source: { kind: 'contract', id: 'gen.2' },
			status: 'active',
			progress: 0.5,
			leaves: [
				{ path: '0.0', objective: 'stock.land', status: 'done', progress: 1 },
				{ path: '0.1', objective: 'stock.return-home', status: 'active', progress: 0 }
			]
		}
	]
} as unknown as Snapshot;

describe('Administration contracts (plan 099)', () => {
	it('the agency strip shows the balances and the slots in use', () => {
		expect(agencyStrip(snap)).toEqual({
			funds: '125,000 funds',
			reputation: '40',
			science: '12',
			contracts: '1 of 3 active'
		});
	});

	it('lists Offered, Active and Completed with stars, reward and time', () => {
		expect(contractRows(snap.contracts, 'offered', snap.t, DAY)).toEqual([
			{
				id: 'gen.4',
				title: 'Orbit Home between 75 km and 300 km',
				stars: 1,
				reward: '10,000 funds',
				status: 'Expires in 4 days'
			}
		]);
		expect(contractRows(snap.contracts, 'active', snap.t, DAY)[0]).toMatchObject({
			id: 'gen.2',
			stars: 3,
			status: '12 days left'
		});
		expect(contractRows(snap.contracts, 'completed', snap.t, DAY)[0]).toMatchObject({
			id: 'gen.1',
			status: 'Done'
		});
	});

	it('an offer details its terms and expected value, and can be accepted or declined', () => {
		const d = contractDetail(snap, 'gen.4', DAY)!;
		expect(d.objectives).toEqual([
			{ label: 'Orbit with periapsis ≥ 75 km and apoapsis ≤ 300 km', done: false }
		]);
		expect(d.terms).toEqual([
			{ label: 'Advance', value: '2,000 funds' },
			{ label: 'Reward', value: '10,000 funds · +5 reputation' },
			{ label: 'Penalty', value: '-5,000 funds · -3 reputation' },
			{ label: 'Deadline', value: '45 days after accepting' }
		]);
		expect(d.value).toBe(
			'Expected value −14,000 funds (estimate: a launch of about 26,000 funds for 3,400 m/s of Δv)'
		);
		expect(d.actions).toEqual(['accept', 'decline']);
		expect(contractCommand('accept', 'gen.4')).toEqual({ type: 'contract-accept', offer: 'gen.4' });
		expect(contractCommand('cancel', 'gen.2')).toEqual({
			type: 'contract-cancel',
			contract: 'gen.2'
		});
	});

	it('an active contract ticks its finished objectives and can be cancelled', () => {
		const d = contractDetail(snap, 'gen.2', DAY)!;
		expect(d.objectives).toEqual([
			{ label: 'Land on Cinder', done: true },
			{ label: 'Land back home', done: false }
		]);
		expect(d.actions).toEqual(['cancel']);
		expect(d.terms.at(-1)).toEqual({ label: 'Deadline', value: '12 days left' });
		expect(objectiveLabel(snap, { kind: 'contract', id: 'gen.2' })).toBe(
			'Land on Cinder and come home'
		);
		expect(objectiveLabel(snap, { kind: 'mission', id: 'stock.first-launch' })).toBe(
			'First launch'
		);
	});

	it('renders the list and the detail with Accept and Decline', () => {
		const html = render(ContractsTab, {
			props: {
				snapshot: snap,
				day: DAY,
				tab: 'offered',
				selected: null,
				ontab: () => {},
				onselect: () => {},
				onaction: () => {}
			}
		}).body;
		expect(html).toContain('Orbit Home between 75 km and 300 km');
		expect(html).toContain('★☆☆');
		expect(html).toContain('data-testid="contract-accept"');
		expect(html).toContain('data-testid="contract-decline"');
		expect(html).toContain('Expected value −14,000 funds');
	});
});
