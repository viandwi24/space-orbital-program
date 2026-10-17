/** Science maths (plan 103, ADR 0178). */
import { describe, expect, test } from 'bun:test';
import {
	bodyScience,
	nextValue,
	situationOf,
	subjectCap,
	subjectId,
	type SituationDefinition
} from '../src/index.ts';

const S = (
	id: string,
	order: number,
	matches: SituationDefinition['matches']
): SituationDefinition => ({ id, label: id, order, matches });
const situations = [
	S('space-high', 5, () => true),
	S('landed', 0, (v) => v.landed && !v.splashed),
	S('flying-low', 2, (v) => v.altitude < v.atmosphereHeight && v.altitude < v.flyingHigh)
];

describe('science maths', () => {
	test('the first matching situation by order wins', () => {
		const base = {
			splashed: false,
			atmosphereHeight: 70_000,
			flyingHigh: 18_000,
			spaceHigh: 250_000
		};
		expect(situationOf(situations, { ...base, landed: true, altitude: 0 })!.id).toBe('landed');
		expect(situationOf(situations, { ...base, landed: false, altitude: 5_000 })!.id).toBe(
			'flying-low'
		);
		expect(situationOf(situations, { ...base, landed: false, altitude: 400_000 })!.id).toBe(
			'space-high'
		);
	});

	test('body thresholds default from the atmosphere and the radius', () => {
		expect(bodyScience({ radius: 600_000, atmosphere: { height: 70_000 } })).toEqual({
			flyingHigh: 17_500,
			spaceHigh: 240_000,
			multiplier: 1
		});
		expect(bodyScience({ radius: 190_000, science: { spaceHigh: 60_000, multiplier: 2 } })).toEqual(
			{ flyingHigh: 0, spaceHigh: 60_000, multiplier: 2 }
		);
	});

	test('the value curve: base × r^n, never past the cap', () => {
		const e = { baseValue: 10, repeatFactor: 0.5, capFactor: 1.6 };
		const cap = subjectCap(e, 2);
		expect(cap).toBe(32);
		const subject = { count: 0, produced: 0, cap };
		const values: number[] = [];
		for (let i = 0; i < 4; i++) {
			const v = nextValue(e, 2, subject);
			values.push(v);
			subject.count++;
			subject.produced += v;
		}
		expect(values).toEqual([20, 10, 2, 0]); // 20 + 10 + 5 would pass 32: the third is cut to 2
		expect(subjectId('stock.thermometer', 'stock.home', 'landed')).toBe(
			'stock.thermometer@stock.home:landed:global'
		);
	});
});
