/**
 * Picking a target on the map with a click (plan 057, ADR 0084). Pure screen-space geometry: the
 * view controller projects bodies, vessels and orbit lines to pixels and this decides which one a
 * click at (x, y) means. A marker (a body's disc, a vessel's dot) beats an orbit line.
 */
export interface PickPoint {
	x: number;
	y: number;
}

export interface PickCandidate {
	/** What a pick returns: a `TargetChoice.key` (`body:stock.cinder`, `vessel:12`). */
	key: string;
	/** Discs and dots: the centre and the pixel radius a click may be from it (the body's drawn radius at least). */
	marks: Array<PickPoint & { radius: number }>;
	/** Polylines in pixels (an orbit line); a click within `lineRadius` of a segment picks it. */
	lines: PickPoint[][];
}

/** Distance from (x, y) to the segment a-b, px. */
export function distanceToSegment(x: number, y: number, a: PickPoint, b: PickPoint): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2));
	return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/**
 * The key a click at (x, y) picks, or null. Among the markers that contain the click the nearest to
 * its centre wins (a small vessel dot in front of a big disc wins by being nearer its own centre
 * relative to its radius); without a marker the nearest orbit line within `lineRadius` px (none
 * when `lineRadius` is 0).
 */
export function pickTarget(
	candidates: readonly PickCandidate[],
	x: number,
	y: number,
	lineRadius = 8
): string | null {
	let bestMark: { key: string; score: number } | null = null;
	for (const c of candidates) {
		for (const m of c.marks) {
			const d = Math.hypot(x - m.x, y - m.y);
			if (d > m.radius) continue;
			const score = d / Math.max(m.radius, 1e-9);
			if (!bestMark || score < bestMark.score) bestMark = { key: c.key, score };
		}
	}
	if (bestMark) return bestMark.key;
	if (!(lineRadius > 0)) return null;
	let bestLine: { key: string; d: number } | null = null;
	for (const c of candidates) {
		for (const line of c.lines) {
			for (let i = 1; i < line.length; i++) {
				const d = distanceToSegment(x, y, line[i - 1]!, line[i]!);
				if (d <= lineRadius && (!bestLine || d < bestLine.d)) bestLine = { key: c.key, d };
			}
		}
	}
	return bestLine ? bestLine.key : null;
}
