import { describe, expect, it } from 'vitest';
import { dialogOpen } from './flight-modal';

const closed = {
	pause: false,
	help: false,
	settings: false,
	load: false,
	save: false,
	debug: false
};

describe('dialogOpen', () => {
	it('is false with nothing open', () => {
		expect(dialogOpen(closed)).toBe(false);
	});
	it('is true for each dialog, the Debug panel too (it pauses like the menu)', () => {
		for (const key of Object.keys(closed) as Array<keyof typeof closed>) {
			expect(dialogOpen({ ...closed, [key]: true })).toBe(true);
		}
	});
});
