/**
 * Stuck modifier keys (plan 262): the flight keeps the set of held keys from key-down and key-up
 * events. A modifier whose key-up never came (the window lost focus under Ctrl, a context menu, a
 * Cmd shortcut of the system) stayed held for ever, and a stuck Shift is a throttle that climbs by
 * itself even after X. Every keyboard and pointer event says which modifiers are down now, so the
 * ones it says are up are dropped.
 */
export interface ModifierState {
	shiftKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
}

const MODIFIERS: ReadonlyArray<readonly [keyof ModifierState, string]> = [
	['shiftKey', 'ShiftLeft'],
	['ctrlKey', 'ControlLeft'],
	['altKey', 'AltLeft'],
	['metaKey', 'MetaLeft']
];

/** Drop from `held` the modifier keys that `e` reports as up; returns whether any was dropped. */
export function dropStaleModifiers(held: Set<string>, e: ModifierState): boolean {
	let dropped = false;
	for (const [flag, id] of MODIFIERS) {
		if (e[flag] === false && held.delete(id)) dropped = true;
	}
	return dropped;
}
