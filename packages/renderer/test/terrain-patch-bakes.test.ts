/** The patch bakes of a frame (plan 418): one at a time outside a load. */
import { describe, expect, test } from 'bun:test';
import { patchBakesThisFrame } from '../src/terrain-patch.ts';

describe('patchBakesThisFrame', () => {
	test('runs one bake a frame outside a load, and all of them in one', () => {
		const due = ['fine', 'mid'];
		expect(patchBakesThisFrame(due, false, false)).toEqual(['fine']);
		expect(patchBakesThisFrame(due, true, false)).toEqual([]);
		expect(patchBakesThisFrame(due, true, true)).toEqual(['fine', 'mid']);
		expect(patchBakesThisFrame(['mid'], false, false)).toEqual(['mid']);
		expect(patchBakesThisFrame([], false, false)).toEqual([]);
	});

	test('the due patches all run within as many frames as there are', () => {
		let due = ['fine', 'mid'];
		let frames = 0;
		while (due.length > 0) {
			const run = patchBakesThisFrame(due, false, false);
			due = due.filter((d) => !run.includes(d));
			frames++;
		}
		expect(frames).toBe(2);
	});

	test('a patch wanted every frame does not starve the other', () => {
		const due = ['fine', 'mid'];
		let last: string | null = null;
		const baked: string[] = [];
		for (let f = 0; f < 4; f++) {
			const run = patchBakesThisFrame(due, false, false, (t) => t === last);
			last = run[0]!;
			baked.push(last);
		}
		expect(baked).toEqual(['fine', 'mid', 'fine', 'mid']);
	});
});
