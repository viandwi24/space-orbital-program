/** The comms planning panel's data (plan 118, ADR 0163 point 6). */
import { resonantDeployment } from '@orbital/kepler';
import { describe, expect, it } from 'vitest';
import type { PlanNode } from './geometry';
import {
	coveragePixels,
	defaultReceiver,
	deploymentRows,
	peerChoices,
	vesselChoices,
	windowRows
} from './planning-model';

const station = (id: string, range: number): PlanNode => ({
	kind: 'station',
	id,
	label: id,
	body: 'b',
	dir: { x: 1, y: 0, z: 0 },
	radius: 1,
	range
});
const vessel = (id: string, range: number): PlanNode => ({
	kind: 'vessel',
	id,
	label: `V ${id}`,
	body: 'b',
	r: { x: 1, y: 0, z: 0 },
	v: { x: 0, y: 0, z: 1 },
	t0: 0,
	range
});

describe('planning panel model', () => {
	it('offers vessels with antennas, and every station and other linked vessel as peers', () => {
		const nodes = [station('site:a', 2e9), vessel('vessel:1', 5e5), vessel('vessel:2', 0)];
		expect(vesselChoices(nodes)).toEqual([{ value: 'vessel:1', label: 'V vessel:1' }]);
		expect(peerChoices(nodes, 'vessel:1')).toEqual([
			{ value: 'site:a', label: 'site:a (station)' }
		]);
	});

	it('assumes the weakest antenna as the coverage receiver', () => {
		expect(
			defaultReceiver([
				{ id: 'dish', label: 'Dish', range: 2e9 },
				{ id: 'whip', label: 'Whip', range: 5e5 }
			])?.id
		).toBe('whip');
		expect(defaultReceiver([])).toBeUndefined();
	});

	it('places the windows on the horizon bar and says when they start', () => {
		const rows = windowRows(
			{
				a: 'vessel:1',
				b: 'site:a',
				from: 100,
				to: 1100,
				windows: [
					{ start: 100, end: 200, open: false },
					{ start: 600, end: 1100, open: true }
				],
				events: [],
				linkedFraction: 0.6
			},
			100
		);
		expect(rows.map((r) => [r.when, r.left, r.width])).toEqual([
			['now', 0, 10],
			[expect.stringMatching(/^in /), 50, 50]
		]);
		expect(rows[1]!.length.endsWith('+')).toBe(true);
	});

	it('paints covered cells brighter and opaque', () => {
		const px = coveragePixels({
			body: 'b',
			width: 2,
			height: 1,
			values: new Float32Array([0, 1]),
			mean: 0.5
		});
		expect(px[3]).toBe(40);
		expect(px[7]).toBe(255);
	});

	it('shows the constellation plan with altitudes and the ratio', () => {
		const plan = resonantDeployment({
			mu: 3.5316e12,
			bodyRadius: 600_000,
			radius: 1_600_000,
			count: 3
		});
		const rows = deploymentRows(plan, 600_000);
		expect(rows.find((r) => r.label === 'Period')!.value).toContain('4/3');
		expect(rows.find((r) => r.label === 'Spacing')!.value).toBe('120°');
		expect(rows.find((r) => r.label === 'Each satellite circularises')!.value).toMatch(
			/^\d[\d,]* \S+/
		);
	});
});
