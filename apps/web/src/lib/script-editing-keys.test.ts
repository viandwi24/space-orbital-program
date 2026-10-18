import { describe, expect, it } from 'vitest';
import {
	isInputMethodKey,
	keyAction,
	type KeyAction,
	type KeyInfo,
	type KeyState
} from './script-editing-keys';

const idle: KeyState = {
	composing: false,
	completionOpen: false,
	tabLeaves: false,
	findOpen: false
};
const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({
	key: k,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	shiftKey: false,
	...mods
});

describe('key table', () => {
	const table: Array<[string, KeyInfo, KeyAction]> = [
		['Tab', key('Tab'), 'indent'],
		['Shift+Tab', key('Tab', { shiftKey: true }), 'outdent'],
		['Enter', key('Enter'), 'newline'],
		['Escape', key('Escape'), 'tab-leaves'],
		['Ctrl+Z', key('z', { ctrlKey: true }), 'undo'],
		['Cmd+Z', key('z', { metaKey: true }), 'undo'],
		['Ctrl+Shift+Z', key('Z', { ctrlKey: true, shiftKey: true }), 'redo'],
		['Ctrl+Y', key('y', { ctrlKey: true }), 'redo'],
		['Ctrl+F', key('f', { ctrlKey: true }), 'find'],
		['Cmd+F', key('f', { metaKey: true }), 'find'],
		['Ctrl+G', key('g', { ctrlKey: true }), 'go-to-line'],
		['Cmd+G', key('g', { metaKey: true }), 'go-to-line'],
		['Ctrl+/', key('/', { ctrlKey: true }), 'toggle-comment'],
		['Cmd+/', key('/', { metaKey: true }), 'toggle-comment'],
		['Alt+Up', key('ArrowUp', { altKey: true }), 'move-up'],
		['Alt+Down', key('ArrowDown', { altKey: true }), 'move-down'],
		['Shift+Alt+Up', key('ArrowUp', { altKey: true, shiftKey: true }), 'duplicate-up'],
		['Shift+Alt+Down', key('ArrowDown', { altKey: true, shiftKey: true }), 'duplicate-down'],
		['Ctrl+Space', key(' ', { ctrlKey: true }), 'suggest'],
		['Ctrl+I', key('i', { ctrlKey: true }), 'suggest'],
		['Cmd+I', key('i', { metaKey: true }), 'suggest']
	];
	for (const [name, e, action] of table) {
		it(`${name} is ${action}`, () => {
			expect(keyAction(e, idle)).toBe(action);
		});
	}
	it('leaves other keys and chords to the browser', () => {
		for (const e of [
			key('a'),
			key('i'),
			key('i', { altKey: true }),
			key('I', { ctrlKey: true, shiftKey: true }),
			key('ArrowUp'),
			key('Enter', { shiftKey: true }),
			key('Enter', { ctrlKey: true }),
			key('Tab', { ctrlKey: true }),
			key('Tab', { altKey: true }),
			key('f', { ctrlKey: true, shiftKey: true }),
			key('z', { altKey: true, ctrlKey: true }),
			key(' ', { metaKey: true }),
			key(' ')
		]) {
			expect(keyAction(e, idle), JSON.stringify(e)).toBeNull();
		}
	});
});

describe('states', () => {
	it('with the suggestions open the arrows move, Enter and Tab accept, Escape closes only them', () => {
		const open = { ...idle, completionOpen: true };
		expect(keyAction(key('ArrowDown'), open)).toBe('completion-next');
		expect(keyAction(key('ArrowUp'), open)).toBe('completion-previous');
		expect(keyAction(key('Enter'), open)).toBe('completion-accept');
		expect(keyAction(key('Tab'), open)).toBe('completion-accept');
		expect(keyAction(key('Escape'), open)).toBe('completion-close');
		expect(keyAction(key('Tab', { shiftKey: true }), open)).toBe('outdent');
		expect(keyAction(key('Enter', { ctrlKey: true }), open)).toBeNull();
	});
	it('after Escape a Tab leaves; with find open Escape closes find', () => {
		expect(keyAction(key('Tab'), { ...idle, tabLeaves: true })).toBe('tab-leave');
		expect(keyAction(key('Tab', { shiftKey: true }), { ...idle, tabLeaves: true })).toBe(
			'tab-leave'
		);
		expect(keyAction(key('Escape'), { ...idle, findOpen: true })).toBe('find-close');
	});
});

describe('input methods', () => {
	const keys: KeyInfo[] = [
		key('Tab'),
		key('Enter'),
		key('Escape'),
		key('z', { ctrlKey: true }),
		key(' ', { ctrlKey: true }),
		key('ArrowDown'),
		key('/', { ctrlKey: true }),
		key('ArrowUp', { altKey: true })
	];
	it('does nothing for a keydown with isComposing', () => {
		for (const k of keys) expect(keyAction({ ...k, isComposing: true }, idle)).toBeNull();
	});
	it('does nothing for keyCode 229 (Safari after compositionend) and key "Process"', () => {
		for (const k of keys) {
			expect(keyAction({ ...k, keyCode: 229 }, idle)).toBeNull();
			expect(keyAction({ ...k, key: 'Process' }, idle)).toBeNull();
		}
	});
	it('does nothing between compositionstart and compositionend, even with the suggestions open', () => {
		for (const k of keys) {
			expect(keyAction(k, { ...idle, composing: true })).toBeNull();
			expect(keyAction(k, { ...idle, composing: true, completionOpen: true })).toBeNull();
		}
	});
	it('does nothing for a dead key', () => {
		expect(keyAction(key('Dead'), idle)).toBeNull();
		expect(isInputMethodKey(key('Dead'), false)).toBe(true);
		expect(isInputMethodKey(key('a'), false)).toBe(false);
	});
});
