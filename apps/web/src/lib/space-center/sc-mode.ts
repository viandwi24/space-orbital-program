/**
 * The Space Center's page system (V3 §1, plan 273, ADR 0254): which mode the overlay is in, the
 * focus bar's previous and next, and the build cards' chips. Pure, so vitest covers it.
 */

export type ScMode = 'overview' | 'build' | 'focus';

/** Build while the build bar is open; else Focus with a building selected, else Overview. */
export const modeOf = (buildOpen: boolean, selected: string | null): ScMode =>
	buildOpen ? 'build' : selected !== null ? 'focus' : 'overview';

/** The building `step` places away from `current` in list order, wrapping; null in an empty list. */
export function stepBuilding(
	ids: readonly string[],
	current: string | null,
	step: 1 | -1
): string | null {
	if (ids.length === 0) return null;
	const i = current === null ? -1 : ids.indexOf(current);
	if (i < 0) return step > 0 ? ids[0]! : ids.at(-1)!;
	return ids[(i + step + ids.length) % ids.length]!;
}

/** "Building 2 of 7" for the focus bar (V3 §1.4). */
export function focusLabel(ids: readonly string[], current: string | null): string {
	const i = current === null ? -1 : ids.indexOf(current);
	return i < 0 ? '' : `Building ${i + 1} of ${ids.length}`;
}

/** A build card's chip (V3 §1.2): LOCKED when it cannot be built here, ×n when some stand, else none. */
export function cardChip(reason: string | null, built: number): string {
	if (reason !== null) return 'LOCKED';
	return built > 0 ? `×${built}` : '';
}
