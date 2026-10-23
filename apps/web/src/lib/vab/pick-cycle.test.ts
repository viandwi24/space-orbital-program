import { describe, expect, it } from 'vitest';
import { AGAIN_MS, AGAIN_PX, frontFirst, nextPick } from './pick-cycle';

const keys = ['5', '9', '2'];

describe('pick-through by clicking again (plan 378, ADR 0315)', () => {
	it('the first click picks the front part', () => {
		expect(nextPick(null, { x: 10, y: 10, at: 0 }, keys)?.i).toBe(0);
	});

	it('a click again at the same spot picks the next part behind, and wraps', () => {
		let c = nextPick(null, { x: 10, y: 10, at: 0 }, keys);
		c = nextPick(c, { x: 12, y: 11, at: 400 }, keys);
		expect(c!.keys[c!.i]).toBe('9');
		c = nextPick(c, { x: 12, y: 11, at: 800 }, keys);
		expect(c!.keys[c!.i]).toBe('2');
		c = nextPick(c, { x: 12, y: 11, at: 1200 }, keys);
		expect(c!.keys[c!.i]).toBe('5');
	});

	it('a click elsewhere or later starts over', () => {
		const c = nextPick(null, { x: 10, y: 10, at: 0 }, keys);
		expect(nextPick(c, { x: 10 + AGAIN_PX + 1, y: 10, at: 100 }, keys)!.i).toBe(0);
		expect(nextPick(c, { x: 10, y: 10, at: AGAIN_MS + 1 }, keys)!.i).toBe(0);
		expect(nextPick(c, { x: 10, y: 10, at: 100 }, ['7'])!.i).toBe(0);
	});

	it('a click again keeps the same list (the controller keeps its pick list open by it)', () => {
		const c = nextPick(null, { x: 10, y: 10, at: 0 }, keys);
		expect(nextPick(c, { x: 10, y: 10, at: 100 }, [...keys])!.keys).toBe(c!.keys);
		expect(nextPick(c, { x: 90, y: 10, at: 100 }, [...keys])!.keys).not.toBe(c!.keys);
	});

		it('nothing under the pointer is no pick; the reached part goes first', () => {
		expect(nextPick(null, { x: 0, y: 0, at: 0 }, [])).toBeNull();
		expect(frontFirst(['1', '4', '6'], '4')).toEqual(['4', '1', '6']);
	});
});
