/**
 * How well a mod's model matches the part it is the look of (plan 051, ADR 0076). Physics, heat
 * and attachment all use the part's `shape` and `attach` nodes; the model is only a look. A
 * model that is bigger, much smaller or whose faces are not where the attach nodes are would
 * overlap its neighbours or leave gaps. The checks return readable warnings; nothing is scaled
 * or moved, so what the modder authored is what is drawn. Pure maths, testable without a GPU.
 */
import type { PartNode, PartShape } from './types.ts';

export interface Extent {
	min: readonly [number, number, number];
	max: readonly [number, number, number];
}

const AXES = ['x', 'y', 'z'] as const;
const fmt = (v: number): string => `${Math.round(v * 100) / 100}`;

/** Half extents of the shape's bounding box about the part origin, metres. */
export function shapeHalfExtents(shape: PartShape): readonly [number, number, number] {
	return shape.kind === 'cylinder'
		? [shape.radius, shape.height / 2, shape.radius]
		: [shape.size.x / 2, shape.size.y / 2, shape.size.z / 2];
}

/** Allowed difference along an axis of full length `length`: 5 cm or a tenth of the length. */
export const fitTolerance = (length: number): number => Math.max(0.05, 0.1 * length);

export function assetFit(
	model: Extent,
	shape: PartShape | undefined,
	nodes: Readonly<Record<string, PartNode>> | undefined
): string[] {
	const warnings: string[] = [];
	if (model.max.some((v, i) => !(v > model.min[i]!))) {
		return ['the model has no volume'];
	}
	if (shape) {
		const half = shapeHalfExtents(shape);
		for (let i = 0; i < 3; i++) {
			const axis = AXES[i]!;
			const tol = fitTolerance(half[i]! * 2);
			const over = Math.max(model.max[i]! - half[i]!, -half[i]! - model.min[i]!);
			if (over > tol) {
				warnings.push(
					`the model sticks out ${fmt(over)} m past the part's shape along ${axis} (shape ±${fmt(half[i]!)} m): it will overlap its neighbours, and collisions and heating use the shape`
				);
			}
		}
		const height = model.max[1] - model.min[1];
		if (height < 0.6 * half[1] * 2) {
			warnings.push(
				`the model is ${fmt(height)} m tall but the part's shape is ${fmt(half[1] * 2)} m: check the scale (glTF units are metres)`
			);
		}
	}
	for (const [name, node] of Object.entries(nodes ?? {})) {
		const dir = node.dir;
		let axis = 0;
		for (let i = 1; i < 3; i++) if (Math.abs(dir[i]!) > Math.abs(dir[axis]!)) axis = i;
		if (Math.abs(dir[axis]!) < 0.7) continue; // a slanted node has no single face to meet
		const face = dir[axis]! > 0 ? model.max[axis]! : model.min[axis]!;
		const tol = fitTolerance(model.max[axis]! - model.min[axis]!);
		if (Math.abs(node.pos[axis]! - face) > tol) {
			warnings.push(
				`attach node "${name}" is at ${AXES[axis]} = ${fmt(node.pos[axis]!)} m but the model's ${dir[axis]! > 0 ? 'upper' : 'lower'} ${AXES[axis]} face is at ${fmt(face)} m: parts attached there will float or overlap`
			);
		}
	}
	return warnings;
}
