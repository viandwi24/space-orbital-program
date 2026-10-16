import { describe, expect, test } from 'bun:test';
import {
	deg,
	entityId,
	kN,
	km,
	minutes,
	partId,
	pluginId,
	tonnes,
	toDegrees
} from '../src/index.ts';

describe('units', () => {
	test('helpers return SI numbers', () => {
		expect(km(2)).toBe(2000);
		expect(tonnes(3)).toBe(3000);
		expect(kN(60)).toBe(60_000);
		expect(minutes(2)).toBe(120);
		expect(deg(180)).toBeCloseTo(Math.PI, 15);
		expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 12);
	});
});

describe('ids', () => {
	test('valid ids pass through unchanged', () => {
		expect(String(partId('stock.engine-lv'))).toBe('stock.engine-lv');
		expect(String(pluginId('acme.nuclear'))).toBe('acme.nuclear');
		expect(String(pluginId('stock'))).toBe('stock');
		expect(Number(entityId(0))).toBe(0);
	});

	test('invalid ids throw an actionable error', () => {
		expect(() => partId('Stock.Engine')).toThrow(/Invalid part id "Stock.Engine"/);
		expect(() => partId('engine')).toThrow(/<plugin>\.<name>/);
		expect(() => pluginId('has space')).toThrow();
		expect(() => entityId(-1)).toThrow();
		expect(() => entityId(1.5)).toThrow();
	});
});
