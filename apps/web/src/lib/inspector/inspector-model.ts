/**
 * The part inspector's state (plan 214, ADR 0205 point 2): which parts are pinned (three at most, a
 * fourth drops the oldest) and which one is open unpinned. Pure.
 */
import type { EntityId } from '@orbital/core';

export const MAX_PINS = 3;

export interface InspectorState {
	/** The part open and not pinned, or null. */
	open: EntityId | null;
	/** Pinned parts, oldest first. */
	pinned: EntityId[];
}

export const emptyInspector = (): InspectorState => ({ open: null, pinned: [] });

/** Open `part` (a click in 3D or on its row); a pinned part stays where it is. */
export const openPart = (s: InspectorState, part: EntityId): InspectorState =>
	s.pinned.includes(part) ? { ...s, open: null } : { ...s, open: part };

/** Pin or unpin `part`; past three pins the oldest goes. */
export function togglePin(s: InspectorState, part: EntityId): InspectorState {
	if (s.pinned.includes(part)) return { ...s, pinned: s.pinned.filter((p) => p !== part) };
	const pinned = [...s.pinned, part].slice(-MAX_PINS);
	return { open: s.open === part ? null : s.open, pinned };
}

/** Close the unpinned inspector, or unpin `part`. */
export function closePart(s: InspectorState, part: EntityId): InspectorState {
	if (s.open === part) return { ...s, open: null };
	return { ...s, pinned: s.pinned.filter((p) => p !== part) };
}

/** Drop parts that left the vessel (a decoupled stage). */
export function keepParts(s: InspectorState, alive: ReadonlySet<EntityId>): InspectorState {
	const open = s.open !== null && alive.has(s.open) ? s.open : null;
	const pinned = s.pinned.filter((p) => alive.has(p));
	return open === s.open && pinned.length === s.pinned.length ? s : { open, pinned };
}

/** The inspectors on screen, top to bottom: the pins, then the open one. */
export const shownParts = (s: InspectorState): EntityId[] =>
	s.open === null ? [...s.pinned] : [...s.pinned, s.open];
