import { describe, expect, it } from 'vitest';
import { dropStaleModifiers } from './held-modifiers';

const up = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

describe('dropStaleModifiers', () => {
	it('drops a Shift that the event says is up, and keeps the other keys', () => {
		const held = new Set(['ShiftLeft', 'KeyW']);
		expect(dropStaleModifiers(held, up)).toBe(true);
		expect([...held]).toEqual(['KeyW']);
	});
	it('keeps a modifier the event says is down', () => {
		const held = new Set(['ShiftLeft', 'ControlLeft']);
		expect(dropStaleModifiers(held, { ...up, shiftKey: true })).toBe(true);
		expect([...held]).toEqual(['ShiftLeft']);
	});
	it('drops nothing without modifier information', () => {
		const held = new Set(['ShiftLeft']);
		expect(dropStaleModifiers(held, {})).toBe(false);
		expect(held.has('ShiftLeft')).toBe(true);
	});
});
