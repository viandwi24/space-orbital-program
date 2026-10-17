/**
 * Which editor action a key press means (plan 036, 058), as a pure function so the table of keys
 * and the rule for input methods can be tested without a browser. `hud/CodeEditor.svelte` runs the
 * action. Anything typed through an input method (IME), and dead keys, belong to the browser.
 */

/** The parts of a `KeyboardEvent` that matter here. */
export interface KeyInfo {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	isComposing?: boolean;
	keyCode?: number;
}

export interface KeyState {
	/** Between `compositionstart` and `compositionend` (tracked by the editor). */
	composing: boolean;
	completionOpen: boolean;
	/** Escape was pressed: the next Tab moves focus out instead of indenting. */
	tabLeaves: boolean;
	findOpen: boolean;
}

export type KeyAction =
	| 'completion-next'
	| 'completion-previous'
	| 'completion-accept'
	| 'completion-close'
	| 'find-close'
	| 'tab-leaves'
	| 'tab-leave'
	| 'indent'
	| 'outdent'
	| 'newline'
	| 'undo'
	| 'redo'
	| 'find'
	| 'go-to-line'
	| 'suggest'
	| 'toggle-comment'
	| 'move-up'
	| 'move-down'
	| 'duplicate-up'
	| 'duplicate-down';

/**
 * Keys that belong to an input method or compose a character: a keydown inside a composition
 * (`isComposing`, or `keyCode` 229 / `key` "Process" which Safari reports after `compositionend`
 * has already cleared the flag) and dead keys. The editor does nothing with them.
 */
export function isInputMethodKey(e: KeyInfo, composing: boolean): boolean {
	return (
		composing ||
		e.isComposing === true ||
		e.keyCode === 229 ||
		e.key === 'Process' ||
		e.key === 'Dead'
	);
}

/** True for the keys that are only modifiers (they do not cancel a pending "Tab leaves"). */
export const isModifierKey = (key: string): boolean =>
	key === 'Shift' || key === 'Control' || key === 'Meta' || key === 'Alt';

/** The action for a key press, or null when the editor leaves it to the browser. */
export function keyAction(e: KeyInfo, state: KeyState): KeyAction | null {
	if (isInputMethodKey(e, state.composing)) return null;
	const mod = e.ctrlKey || e.metaKey;
	const plain = !mod && !e.altKey;
	if (state.completionOpen) {
		if (e.key === 'ArrowDown') return 'completion-next';
		if (e.key === 'ArrowUp') return 'completion-previous';
		if ((e.key === 'Enter' || e.key === 'Tab') && plain && !e.shiftKey) return 'completion-accept';
		if (e.key === 'Escape') return 'completion-close';
	}
	if (e.key === 'Escape') return state.findOpen ? 'find-close' : 'tab-leaves';
	if (e.key === 'Tab' && plain) {
		if (state.tabLeaves) return 'tab-leave';
		return e.shiftKey ? 'outdent' : 'indent';
	}
	if (e.key === 'Enter' && plain && !e.shiftKey) return 'newline';
	const k = e.key.toLowerCase();
	if (mod && !e.altKey) {
		if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
		if (k === 'y') return 'redo';
		if (k === 'f' && !e.shiftKey) return 'find';
		if (k === 'g' && !e.shiftKey) return 'go-to-line';
		if (e.key === '/' && !e.shiftKey) return 'toggle-comment';
	}
	if (e.altKey && !mod) {
		if (e.key === 'ArrowUp') return e.shiftKey ? 'duplicate-up' : 'move-up';
		if (e.key === 'ArrowDown') return e.shiftKey ? 'duplicate-down' : 'move-down';
	}
	if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === ' ') return 'suggest';
	return null;
}
