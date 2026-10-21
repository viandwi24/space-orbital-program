/**
 * Moving pieces for generators (plan 280 onward): build each piece with the usual builder and the
 * kit, then pose it by the deploy progress (0 stowed, 1 deployed). The pieces become meshes with one
 * material per slot, like the static part.
 */
import { Group, Mesh, type Material, type Object3D } from 'three';
import { GeometryBuilder, type SlotName } from '../builder.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';

export interface Piece {
	/** Draws the piece in its own frame (the pivot is its origin). */
	build(b: GeometryBuilder): void;
	/** Places the piece's object for a progress 0..1 (position, rotation, scale, visible). */
	pose(object: Object3D, progress: number): void;
}

/** Smoothstep of `t` clamped to 0..1, for motions that start and stop gently. */
export const ease = (t: number): number => {
	const x = Math.min(1, Math.max(0, t));
	return x * x * (3 - 2 * x);
};

/** The progress of a stage that runs from `a` to `b` of the whole motion, 0..1. */
export const phase = (p: number, a: number, b: number): number => ease((p - a) / (b - a));

/** A dynamic part from pieces. */
export function pieces(
	ctx: GenContext,
	list: readonly Piece[]
): NonNullable<GeneratedPart['dynamic']> {
	return (material: (slot: SlotName) => Material) => {
		const root = new Group();
		root.name = 'moving';
		const built: { object: Object3D; piece: Piece; dispose(): void }[] = [];
		let triangles = 0;
		for (const piece of list) {
			const b = new GeometryBuilder({ segments: Math.max(8, ctx.detail.segments) });
			piece.build(b);
			if (b.isEmpty) continue;
			const out = b.build();
			const mesh = new Mesh(
				out.geometry,
				out.slots.map((s) => material(s))
			);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			triangles += out.triangles;
			root.add(mesh);
			built.push({ object: mesh, piece, dispose: () => out.geometry.dispose() });
		}
		const animate = (progress: number): void => {
			for (const x of built) x.piece.pose(x.object, progress);
		};
		animate(0);
		return {
			object: root,
			animate,
			triangles,
			dispose() {
				for (const x of built) x.dispose();
			}
		};
	};
}
