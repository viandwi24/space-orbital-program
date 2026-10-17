/**
 * Where the bells of a multi-nozzle engine sit (plan 040, ADR 0081): on a ring about the part's
 * axis. The same function places the geometry in the `engine-cluster` generator and is what a
 * descriptor's `plume.nozzles` must equal (a test pins the stock part to it).
 */

export type Point3 = [number, number, number];

/** Bells a cluster may have. */
export const MIN_BELLS = 2;
export const MAX_BELLS = 9;

/**
 * `count` points evenly spaced on a ring of radius `ring` at height `y`; the first sits at an
 * angle of half a step (45 degrees for four), so a square cluster has no bell on an axis.
 */
export function clusterLayout(count: number, ring: number, y: number): Point3[] {
	const n = Math.round(Math.min(MAX_BELLS, Math.max(MIN_BELLS, count)));
	const out: Point3[] = [];
	for (let k = 0; k < n; k++) {
		const a = Math.PI / n + (2 * Math.PI * k) / n;
		out.push([ring * Math.cos(a), y, ring * Math.sin(a)]);
	}
	return out;
}

/** Smallest centre distance between two bells of a layout, m. */
export function minSeparation(points: readonly Point3[]): number {
	let best = Infinity;
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			best = Math.min(
				best,
				Math.hypot(
					points[i]![0] - points[j]![0],
					points[i]![1] - points[j]![1],
					points[i]![2] - points[j]![2]
				)
			);
		}
	}
	return best;
}
