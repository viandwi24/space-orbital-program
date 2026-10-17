import { describe, expect, test } from 'bun:test';
import { createRegistries, dataValueAt, dataValueFactor, RegistryError } from '../src/index.ts';

describe('data kinds (plan 083)', () => {
	test('validate priority and the value curve', () => {
		const r = createRegistries();
		r.dataKinds.register(
			{
				id: 'a.ok',
				label: 'OK',
				priority: 2,
				valueCurve: [
					[0, 1],
					[10, 0.5]
				]
			},
			'a'
		);
		expect(() => r.dataKinds.register({ id: 'a.frac', label: 'X', priority: 1.5 }, 'a')).toThrow(
			RegistryError
		);
		expect(() =>
			r.dataKinds.register(
				{
					id: 'a.order',
					label: 'X',
					priority: 1,
					valueCurve: [
						[10, 1],
						[5, 0.5]
					]
				},
				'a'
			)
		).toThrow(/ascending/);
		expect(() =>
			r.dataKinds.register({ id: 'a.factor', label: 'X', priority: 1, valueCurve: [[0, 1.5]] }, 'a')
		).toThrow(RegistryError);
	});

	test('dataValueAt interpolates between points and holds after the last', () => {
		const kind = {
			valueCurve: [
				[0, 1],
				[100, 0.5],
				[200, 0]
			] as Array<[number, number]>
		};
		expect(dataValueFactor(kind, 0)).toBe(1);
		expect(dataValueFactor(kind, 50)).toBeCloseTo(0.75, 12);
		expect(dataValueFactor(kind, 150)).toBeCloseTo(0.25, 12);
		expect(dataValueFactor(kind, 1e9)).toBe(0);
		expect(dataValueAt(kind, { value: 8, time: 1000 }, 1050)).toBeCloseTo(6, 12);
		expect(dataValueAt({}, { value: 8, time: 0 }, 1e9)).toBe(8); // no curve: always its value
	});
});
