import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './typing-target';

describe('isTypingTarget', () => {
	it('is true where text is typed', () => {
		expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
		expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
		expect(isTypingTarget({ tagName: 'INPUT', type: 'number' })).toBe(true);
		expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
		expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
	});
	it('is false for a slider, a checkbox or a button that kept the focus', () => {
		expect(isTypingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
		expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
		expect(isTypingTarget({ tagName: 'INPUT', type: 'radio' })).toBe(false);
		expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});
