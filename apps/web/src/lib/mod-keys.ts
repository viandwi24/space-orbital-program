/**
 * Mod keybindings on the page (plan 343, ADR 0292 point 6): each mod's `defineKeybinding` with the
 * player's overrides (`settings.modKeys`, keybinding id to key ids), the clash check against the
 * game's own keys, and what a press sends. The game's keys win a clash: a mod key that is also a
 * flight key is shown as a clash and does nothing until it is rebound.
 */
import type { Command, EntityId, KeybindingDefinition, PanelInput } from '@orbital/core';
import { bindableKey, type Keymap } from './keybindings';

export type ModKeyOverrides = Readonly<Record<string, readonly string[]>>;

export interface ModKeyRow {
	def: KeybindingDefinition;
	keys: readonly string[];
	/** Key ids that are also one of the game's keys in the same mode (or another mod key). */
	clashes: readonly string[];
}

/** The rows the controls editor lists and the flight handler reads, in registration order. */
export function modKeyRows(
	defs: readonly KeybindingDefinition[],
	overrides: ModKeyOverrides,
	keymap: Keymap
): ModKeyRow[] {
	const keysOf = (d: KeybindingDefinition): readonly string[] =>
		(overrides[d.id] ?? d.defaults).filter(bindableKey);
	const owners = new Map<string, number>();
	for (const d of defs) for (const k of keysOf(d)) owners.set(`${d.mode ?? 'flight'}:${k}`, (owners.get(`${d.mode ?? 'flight'}:${k}`) ?? 0) + 1);
	return defs.map((def) => {
		const mode = def.mode ?? 'flight';
		const keys = keysOf(def);
		const clashes = keys.filter(
			(k) => keymap.actionFor(mode, k) !== null || (owners.get(`${mode}:${k}`) ?? 0) > 1
		);
		return { def, keys, clashes };
	});
}

/** The mod keybinding a key press in `mode` triggers, or null (clashing keys trigger nothing). */
export function modKeyFor(
	rows: readonly ModKeyRow[],
	mode: 'flight' | 'map',
	key: string
): KeybindingDefinition | null {
	for (const r of rows) {
		if ((r.def.mode ?? 'flight') !== mode) continue;
		if (r.keys.includes(key) && !r.clashes.includes(key)) return r.def;
	}
	return null;
}

/**
 * What pressing `def` sends: its own command from the panel input, or `mod-key` for systems.
 * A throwing `command` sends nothing (a broken mod never stops the game).
 */
export function modKeyCommand(
	def: KeybindingDefinition,
	input: PanelInput | null,
	vessel: EntityId | null
): Command | null {
	if (def.command) {
		if (!input) return null;
		try {
			return def.command(input);
		} catch {
			return null;
		}
	}
	return { type: 'mod-key', key: def.id, ...(vessel !== null ? { vessel } : {}) };
}

/** Overrides with `id` bound to `keys` (empty: unbound); the defaults drop the entry. */
export function rebindModKey(
	overrides: ModKeyOverrides,
	def: KeybindingDefinition,
	keys: readonly string[]
): Record<string, readonly string[]> {
	const next: Record<string, readonly string[]> = { ...overrides };
	const same = keys.length === def.defaults.length && keys.every((k, i) => k === def.defaults[i]);
	if (same) delete next[def.id];
	else next[def.id] = [...keys];
	return next;
}
