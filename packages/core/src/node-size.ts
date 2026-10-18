/**
 * Attach-node sizes (plan 207, ADR 0212): the diameter of a joint face, metres. Two stack parts
 * fit when their joined nodes have the same size; the Hangar marks a joint that does not.
 */
import type { PartDefinition } from './definitions.ts';

/** The stock size classes, m: 0.625, 1.25 and 2.5. */
export const NODE_SIZES = [0.625, 1.25, 2.5] as const;

/** Two sizes within this many metres are the same size. */
export const NODE_SIZE_TOLERANCE = 0.001;

/** The size class nearest to `diameter` (by ratio), m. */
export function nodeSizeClass(diameter: number): number {
	let best: number = NODE_SIZES[0];
	for (const size of NODE_SIZES) {
		if (Math.abs(Math.log(diameter / size)) < Math.abs(Math.log(diameter / best))) best = size;
	}
	return best;
}

/** The node faces along the part's axis (a stack node), not sideways (radial, connector). */
const isAxial = (dir: readonly [number, number, number]): boolean =>
	Math.abs(dir[1]) > 0.999 && Math.abs(dir[0]) < 1e-6 && Math.abs(dir[2]) < 1e-6;

/**
 * Size of node `node` of `part`, m: its declared `size`, else for a stack node of a cylinder part
 * the class of the part's diameter (parts written before plan 207). Undefined for a radial or
 * connector node, a box part's node without a size, or a node the part does not have.
 */
export function nodeSize(
	part: Pick<PartDefinition, 'attach' | 'shape'>,
	node: string
): number | undefined {
	const n = part.attach?.[node];
	if (!n) return undefined;
	if (n.size !== undefined) return n.size;
	if (!isAxial(n.dir) || part.shape?.kind !== 'cylinder') return undefined;
	return nodeSizeClass(part.shape.radius * 2);
}

/** Whether two node sizes fit; a node without a size fits anything. */
export function nodeSizesMatch(a: number | undefined, b: number | undefined): boolean {
	return a === undefined || b === undefined || Math.abs(a - b) <= NODE_SIZE_TOLERANCE;
}
