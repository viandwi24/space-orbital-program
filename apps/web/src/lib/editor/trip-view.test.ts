import { describe, expect, it } from 'vitest';
import type { DeltaVReport } from '../delta-v';
import type { Destination } from './trip';
import { budgetsOf, tripView } from './trip-view';

const dest: Destination = {
	id: 'moon:landing',
	label: 'Moon landing',
	body: 'moon',
	kind: 'landing',
	legs: [
		{ id: 'ascent', label: 'Launch', dv: 3_400, atmospheric: true },
		{ id: 'transfer', label: 'Transfer', dv: 900, atmospheric: false },
		{ id: 'capture', label: 'Capture', dv: 700, atmospheric: false }
	],
	total: 5_000
};

/** Only the fields the planner reads of a stage. */
const report = (stages: [number, number][]): DeltaVReport =>
	({
		stages: stages.map(([sl, vac], stage) => ({ stage, dvSeaLevel: sl, dvVacuum: vac })),
		totalVacuum: stages.reduce((s, [, v]) => s + v, 0),
		totalSeaLevel: stages.reduce((s, [sl]) => s + sl, 0)
	}) as unknown as DeltaVReport;

describe('trip view states', () => {
	it('empty: no parts, every leg idle, nothing covered', () => {
		const v = tripView(dest, null, 0);
		expect(v.state).toBe('empty');
		expect(v.rows.map((r) => r.status)).toEqual(['idle', 'idle', 'idle']);
		expect(v.needed).toBe(5_000);
		expect(v.share).toBe(0);
		expect(v.covered).toBe(0);
	});

	it('no propulsion: parts but no stage with delta-v', () => {
		const v = tripView(dest, report([[0, 0]]), 3);
		expect(v.state).toBe('no-propulsion');
		expect(v.rows.every((r) => r.status === 'idle')).toBe(true);
		expect(v.short).toBe(5_000);
	});

	it('covered: names the stage on each leg and the spare', () => {
		const v = tripView(
			dest,
			report([
				[2_400, 3_000],
				[3_800, 4_000]
			]),
			12
		);
		expect(v.state).toBe('covered');
		expect(v.rows.map((r) => r.status)).toEqual(['covered', 'covered', 'covered']);
		expect(v.rows[0]!.covers).toEqual([
			{ label: 'Stage 1', dv: 2_400, seaLevel: true },
			{ label: 'Stage 2', dv: 1_000, seaLevel: false }
		]);
		expect(v.spare).toBeCloseTo(1_400, 9);
		expect(v.share).toBe(1);
		expect(v.short).toBe(0);
	});

	it('short: the leg the stages run out on is partial, the ones after it are short', () => {
		const v = tripView(
			dest,
			report([
				[2_400, 3_000],
				[1_500, 1_500]
			]),
			12
		);
		expect(v.state).toBe('short');
		expect(v.rows.map((r) => r.status)).toEqual(['covered', 'partial', 'short']);
		expect(v.rows[1]!.covers.map((c) => c.label)).toEqual(['Stage 2']);
		expect(v.rows[1]!.covers[0]!.dv).toBeCloseTo(500, 9);
		expect(v.rows[1]!.short).toBeCloseTo(400, 9);
		expect(v.rows[2]!.short).toBe(700);
		expect(v.short).toBeCloseTo(1_100, 9);
		expect(v.spare).toBeCloseTo(0, 9);
		expect(v.share).toBeCloseTo(3_900 / 5_000, 9);
	});

	it('short with nothing left at all marks the later legs short, not partial', () => {
		const v = tripView(
			dest,
			report([
				[2_400, 3_000],
				[1_000, 1_000]
			]),
			12
		);
		expect(v.rows.map((r) => r.status)).toEqual(['covered', 'short', 'short']);
		expect(v.short).toBe(1_600);
	});

	it('budgetsOf keeps the firing order and both figures', () => {
		expect(budgetsOf(null)).toEqual([]);
		expect(budgetsOf(report([[1, 2]]))).toEqual([{ stage: 0, dvSeaLevel: 1, dvVacuum: 2 }]);
	});
});
