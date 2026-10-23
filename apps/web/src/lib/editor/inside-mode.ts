/**
 * Inside mode of the Hangar (plan 378, ADR 0315 point 3): editing the parts an enclosing part
 * holds (a bay, a fairing, petals) as 3D editors edit a group. The state is the entered shell's
 * design index or null. Pure, so the rules are unit-tested; the controller keeps the state and the
 * scene draws the shell as a veil and the rest dimmed.
 */

export type Shells = ReadonlyMap<number, readonly number[]>;

export type InsideEvent =
	/** A double click on part `index`: a shell is entered, a part a shell holds enters that shell. */
	| { kind: 'double'; index: number }
	/** Part `index` picked in the Parts list: a held part enters its shell, any other leaves. */
	| { kind: 'list'; index: number }
	/** "Edit inside" on a shell's card. */
	| { kind: 'edit'; index: number }
	/** Esc or the breadcrumb. */
	| { kind: 'exit' }
	/** The design changed: a shell that is gone is left. */
	| { kind: 'design' };

/** The innermost shell holding `index` (the one holding the fewest parts), or null. */
export function shellOf(shells: Shells, index: number): number | null {
	let best: number | null = null;
	let size = Infinity;
	for (const [shell, holds] of shells) {
		if (holds.includes(index) && holds.length < size) {
			best = shell;
			size = holds.length;
		}
	}
	return best;
}

export function insideStep(entered: number | null, e: InsideEvent, shells: Shells): number | null {
	switch (e.kind) {
		case 'exit':
			return null;
		case 'design':
			return entered !== null && shells.has(entered) ? entered : null;
		case 'edit':
			return shells.has(e.index) ? e.index : entered;
		case 'list':
			return shellOf(shells, e.index);
		case 'double': {
			// inside already, a double click on what the shell holds stays (it steps the pick)
			if (entered !== null && (shells.get(entered) ?? []).includes(e.index)) {
				// unless the part is itself a shell: go one level in
				return shells.has(e.index) ? e.index : entered;
			}
			if (shells.has(e.index)) return e.index;
			return shellOf(shells, e.index) ?? entered;
		}
	}
}

/** Whether part `index` can be picked: anything outside inside mode, only what the shell holds inside it. */
export function pickableInside(entered: number | null, index: number, shells: Shells): boolean {
	return entered === null || (shells.get(entered) ?? []).includes(index);
}

/** How part `index` is drawn in inside mode: the shell as a veil, what it holds as usual, the rest dimmed. */
export function insideLook(
	entered: number | null,
	index: number,
	shells: Shells
): 'veil' | 'dim' | null {
	if (entered === null) return null;
	if (index === entered) return 'veil';
	return (shells.get(entered) ?? []).includes(index) ? null : 'dim';
}
