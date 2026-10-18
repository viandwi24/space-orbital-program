/** Part reliability on the page (plan 130, ADR 0156 point 8). */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import {
	modelRows,
	partReliabilityLine,
	reportRows,
	worldReliabilityOf
} from './reliability-model';

const { registries } = loadPlugins([Stock]);
const part = (id: string) => registries.parts.get(id);
const mode = (id: string) => registries.failureModes.get(id);
const modes = registries.failureModes.list();

describe('reliability on the page (plan 130)', () => {
	it('the test stand lists models and reports, newest report first', () => {
		const snap = {
			models: [
				{ part: 'stock.engine-lv', experience: 3, grade: 'proven' as const, reliability: 0.97 }
			],
			reports: [
				{
					id: 'anomaly-1',
					part: 'stock.engine-lv',
					mode: 'stock.engine-shutdown',
					time: 1,
					fixed: true
				},
				{
					id: 'anomaly-2',
					part: 'stock.decoupler',
					mode: 'stock.decoupler-stuck',
					time: 2,
					vessel: 4,
					fixed: false
				}
			],
			failed: []
		};
		const rows = modelRows(snap, part);
		expect(rows[0]).toMatchObject({ part: 'stock.engine-lv', grade: 'proven', experience: 3 });
		expect(rows[0]!.fireCost).toBe(part('stock.engine-lv')!.cost! / 4);
		const reports = reportRows(snap, part, mode);
		expect(reports.map((r) => [r.id, r.mode, r.where])).toEqual([
			['anomaly-2', 'Decoupler stuck', 'In flight'],
			['anomaly-1', 'Engine shutdown', 'Test stand']
		]);
	});

	it('the Hangar line shows only in a world with the rule on, for parts that can fail', () => {
		const on = worldReliabilityOf(undefined, { rules: { 'stock.reliability': true } } as never);
		const engine = part('stock.engine-lv')!;
		expect(partReliabilityLine(on, engine, modes)).toBe('Reliability 92.0 % · standard · 0 trials');
		expect(partReliabilityLine(on, part('stock.tank-small')!, modes)).toBeNull();
		const off = worldReliabilityOf(undefined, { rules: {} } as never);
		expect(partReliabilityLine(off, engine, modes)).toBeNull();
	});
});
