import { describe, expect, it } from 'bun:test';
import { taauInputSize } from '../src/taau-input-size.ts';

describe('taauInputSize', () => {
	it('floors the drawing buffer times the scale, as the scene pass does', () => {
		expect(taauInputSize(3024, 1890, 0.5)).toEqual({ width: 1512, height: 945 });
		expect(taauInputSize(1001, 667, 0.5)).toEqual({ width: 500, height: 333 });
	});

	it('follows a rung change at once: the new scale gives the new size, not the old target size', () => {
		const before = taauInputSize(3024, 1890, 0.75);
		const after = taauInputSize(3024, 1890, 0.5);
		expect(before).toEqual({ width: 2268, height: 1417 });
		expect(after).not.toEqual(before);
	});

	it('is never empty', () => {
		expect(taauInputSize(1, 1, 0.1)).toEqual({ width: 1, height: 1 });
	});
});
