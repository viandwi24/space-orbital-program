/**
 * Where a carried part goes as the pointer moves (plan 348, ADR 0297 points 2 to 4), as KSP does it:
 * a ring is a candidate only when it is within the snap radius on screen; else the part takes the
 * surface under the pointer, else it floats at the cursor. Never a default node the pointer is not
 * near. A snapped ring holds until the pointer is clearly away (hysteresis), so the ghost does not
 * flicker between two rings. Pure, so the rules are unit-tested without a view.
 */

/** Screen radius (CSS pixels) within which the pointer snaps to a ring (plan 244). */
export const SNAP_PX = 36;
/** A snapped ring stays snapped until the pointer is this many times the snap radius away. */
export const RELEASE_FACTOR = 1.5;
/** Another ring takes over a snapped one only when it is at most this share of its distance. */
export const TAKEOVER = 0.6;

/** What the ghost shows: a ring (target index), a surface site, or the part floating at a point. */
export interface PlacementPick<Site> {
	node: number | null;
	site: Site | null;
	free: readonly [number, number, number] | null;
}

export const NO_PICK: PlacementPick<never> = { node: null, site: null, free: null };

/** What is under and near the pointer now. */
export interface PointerFacts<Site> {
	/** The ring the pointer ray hits, if any (target index). */
	nodeHit: number | null;
	/** Rings near the pointer with their screen distance, any order (target indices). */
	rings: readonly { index: number; px: number }[];
	/** The pointer is over the ghost itself. */
	overGhost: boolean;
	/** The surface site under the pointer (null: no part, a part the held one cannot sit on, or Alt). */
	site: Site | null;
	/** The cursor's point in the main group's frame. */
	free: readonly [number, number, number] | null;
	/** Snap to rings (plan 279: off places on any surface). */
	snapOn: boolean;
	/** Snap radius, CSS pixels (default `SNAP_PX`). */
	snapPx?: number;
}

const empty = <S>(p: PlacementPick<S>): boolean =>
	p.node === null && p.site === null && p.free === null;

export function nextPlacement<Site>(
	prev: PlacementPick<Site>,
	f: PointerFacts<Site>
): PlacementPick<Site> {
	// over the ghost the place it shows stays: re-picking there flips it away and back (ADR 0297 point 3)
	if (f.overGhost && !empty(prev)) return prev;
	if (f.nodeHit !== null) return { node: f.nodeHit, site: null, free: null };
	if (f.snapOn) {
		const snap = f.snapPx ?? SNAP_PX;
		const rings = [...f.rings].sort((a, b) => a.px - b.px || a.index - b.index);
		if (prev.node !== null) {
			const held = rings.find((r) => r.index === prev.node);
			if (held && held.px <= snap * RELEASE_FACTOR) {
				const other = rings.find((r) => r.index !== prev.node);
				if (!other || other.px > held.px * TAKEOVER) return { node: prev.node, site: null, free: null };
			}
		}
		const nearest = rings[0];
		if (nearest && nearest.px <= snap) return { node: nearest.index, site: null, free: null };
	}
	if (f.site) return { node: null, site: f.site, free: null };
	return { node: null, site: null, free: f.free };
}
