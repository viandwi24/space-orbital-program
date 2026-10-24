/**
 * The catalogue's size filter (plan 275, ADR 0256): the seven stack size classes by name, and the
 * classes a part has joints in. An adapter belongs to both of its classes; a part with no sized
 * joint (a radial panel, a strut) belongs to none and shows only under "all".
 */
import { NODE_SIZES, NODE_SIZE_TOLERANCE, nodeSize, type PartDefinition } from '@orbital/core';

/** The class names of ADR 0256, by node size in metres. */
export const SIZE_CLASS_LABELS: ReadonlyArray<readonly [label: string, size: number]> = [
	['XS', NODE_SIZES[0]],
	['S', NODE_SIZES[1]],
	['SM', NODE_SIZES[2]],
	['M', NODE_SIZES[3]],
	['L', NODE_SIZES[4]],
	['XL', NODE_SIZES[5]],
	['XXL', NODE_SIZES[6]]
];

/** The size classes (metres) a part has stack joints in, ascending, without repeats. */
export function partSizeClasses(def: Pick<PartDefinition, 'attach' | 'shape'>): number[] {
	const sizes: number[] = [];
	for (const node of Object.keys(def.attach ?? {})) {
		const s = nodeSize(def, node);
		const known = NODE_SIZES.find((n) => s !== undefined && Math.abs(n - s) <= NODE_SIZE_TOLERANCE);
		if (known !== undefined && !sizes.includes(known)) sizes.push(known);
	}
	return sizes.sort((a, b) => a - b);
}

/** Whether `def` has a joint of class `size` m; `null` keeps every part. */
export function matchesSize(
	def: Pick<PartDefinition, 'attach' | 'shape'>,
	size: number | null
): boolean {
	return size === null || partSizeClasses(def).includes(size);
}

/** The classes the given parts offer, in order, with their names. */
export function offeredSizes(
	parts: ReadonlyArray<Pick<PartDefinition, 'attach' | 'shape'>>
): Array<{ label: string; size: number; count: number }> {
	return SIZE_CLASS_LABELS.map(([label, size]) => ({
		label,
		size,
		count: parts.filter((p) => partSizeClasses(p).includes(size)).length
	})).filter((s) => s.count > 0);
}
