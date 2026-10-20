import { describe, expect, test } from 'bun:test';
import { stepped } from './stepper';

describe('stepped', () => {
	test('moves by the control step and stays in range', () => {
		expect(stepped({ value: 50, min: 0, max: 100, step: 10 }, 1)).toBe(60);
		expect(stepped({ value: 50, min: 0, max: 100, step: 10 }, -1)).toBe(40);
		expect(stepped({ value: 100, min: 0, max: 100, step: 10 }, 1)).toBe(100);
		expect(stepped({ value: 0, min: 0, max: 100, step: 10 }, -1)).toBe(0);
	});
	test('lands on the grid and without float dust', () => {
		expect(stepped({ value: 0.1, min: 0, max: 1, step: 0.1 }, 1)).toBe(0.2);
		expect(stepped({ value: 0.7, min: 0, max: 1, step: 0.1 }, -1)).toBe(0.6);
	});
	test('a control without a step moves a twentieth of its range', () => {
		expect(stepped({ value: 0.5, min: 0, max: 1 }, 1)).toBeCloseTo(0.55, 9);
	});
});
