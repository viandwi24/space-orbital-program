import { describe, expect, it } from 'vitest';
import {
	categoryKey,
	isOpenRow,
	partKey,
	partSummary,
	withRow,
	type OpenRows
} from './part-summary';
import type { PartRow } from './vessel-model';

const part = (over: Partial<PartRow> = {}): PartRow =>
	({
		entity: 7,
		title: 'Medium Fuel Tank',
		category: 'stock.tanks',
		controls: [],
		readouts: [],
		resources: [],
		groups: [],
		...over
	}) as PartRow;

describe('a collapsed part row (plan 256)', () => {
	it('says the heat while the part is hot, in a warning and then a danger tone', () => {
		expect(partSummary(part({ heat: { temperature: 300, max: 2000 } })).text).toBe('No controls');
		const warm = partSummary(part({ heat: { temperature: 1100, max: 2000 } }));
		expect(warm).toEqual({ text: 'Hot 1100 K of 2000 K', tone: 'warn' });
		expect(partSummary(part({ heat: { temperature: 1700, max: 2000 } })).tone).toBe('danger');
	});
	it('says its fullest store as a percentage, and how many more it has', () => {
		const tank = part({
			resources: [
				{ resource: 'stock.liquid-fuel', amount: 450, capacity: 900 },
				{ resource: 'stock.oxidizer', amount: 100, capacity: 200 }
			] as PartRow['resources']
		});
		expect(partSummary(tank).text).toMatch(/50 % · \+1$/);
		const one = part({
			resources: [
				{ resource: 'stock.liquid-fuel', amount: 900, capacity: 900 }
			] as PartRow['resources']
		});
		expect(partSummary(one).text).toMatch(/100 %$/);
	});
	it('else the first readout, else the number of controls', () => {
		expect(
			partSummary(part({ readouts: [{ id: 'a', label: 'Armed', value: 'Yes', module: 'm' }] })).text
		).toBe('Armed Yes');
		const c = (n: number) =>
			part({ controls: Array.from({ length: n }, () => ({})) as PartRow['controls'] });
		expect(partSummary(c(1)).text).toBe('1 control');
		expect(partSummary(c(3)).text).toBe('3 controls');
	});
});

describe('the rows the player opened (plan 256)', () => {
	const none: OpenRows = new Map();
	it('rows follow their default until touched, per vessel', () => {
		expect(isOpenRow(none, '1', partKey(7), false)).toBe(false);
		expect(isOpenRow(none, '1', categoryKey('Tanks'), true)).toBe(true);
		const s = withRow(none, '1', partKey(7), true);
		expect(isOpenRow(s, '1', partKey(7), false)).toBe(true);
		expect(isOpenRow(s, '2', partKey(7), false)).toBe(false);
		expect(isOpenRow(s, '1', partKey(8), false)).toBe(false);
	});
	it('closing a row that opens by default is remembered too, and a later choice wins', () => {
		let s = withRow(none, '1', categoryKey('Tanks'), false);
		expect(isOpenRow(s, '1', categoryKey('Tanks'), true)).toBe(false);
		s = withRow(s, '1', categoryKey('Tanks'), true);
		expect(isOpenRow(s, '1', categoryKey('Tanks'), false)).toBe(true);
	});
	it('does not change the state it was given', () => {
		const s = withRow(none, '1', partKey(7), true);
		withRow(s, '1', partKey(7), false);
		expect(isOpenRow(s, '1', partKey(7), false)).toBe(true);
	});
});
