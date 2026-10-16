import { describe, expect, test } from 'bun:test';
import { add, cross, dot, length, normalize, scale, sub, vec3 } from '../src/index.ts';

describe('vec3', () => {
	const a = vec3(1, 2, 3);
	const b = vec3(-4, 5, 0.5);

	test('arithmetic', () => {
		expect(add(a, b)).toEqual({ x: -3, y: 7, z: 3.5 });
		expect(sub(a, b)).toEqual({ x: 5, y: -3, z: 2.5 });
		expect(scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
		expect(dot(a, b)).toBe(7.5);
	});

	test('cross product is right-handed: x̂ × ŷ = ẑ, ẑ × x̂ = ŷ', () => {
		expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual({ x: 0, y: 0, z: 1 });
		expect(cross(vec3(0, 0, 1), vec3(1, 0, 0))).toEqual({ x: 0, y: 1, z: 0 });
	});

	test('length and normalize', () => {
		expect(length(vec3(3, 4, 12))).toBe(13);
		expect(length(normalize(b))).toBeCloseTo(1, 15);
		expect(() => normalize(vec3(0, 0, 0))).toThrow(RangeError);
	});

	test('inputs are not mutated', () => {
		add(a, b);
		expect(a).toEqual({ x: 1, y: 2, z: 3 });
	});
});
