/**
 * Turns editor state into what the 3D view draws (ADR 0029): the design as group `main`, each
 * loose assembly as its own group on the floor, the translucent ghost of whatever is being placed,
 * and a marker on every place it can go. Pure; the page feeds the result to `VabView.setScene`.
 */
import type { PartDefinition, PartLookup, VesselDesign } from '@orbital/core';
import type { VabGroup, VabNode, VabPart, VabScene } from '@orbital/renderer';
import { extract, positionsOf, previewAttach, rootOf, type AttachTarget, type Doc } from './state';

/** Floor positions of loose assemblies: alternate right and left of the platform, nearest first. */
export const looseX = (i: number): number => (i % 2 === 0 ? 1 : -1) * (7.6 + Math.floor(i / 2) * 3);

export const looseGroup = (root: number): string => `loose:${root}`;
export const partKey = (index: number): string => `${index}`;

const heightOf = (def: PartDefinition | undefined): number =>
	!def?.shape ? 1 : def.shape.kind === 'cylinder' ? def.shape.height : def.shape.size[1];
const radiusOf = (def: PartDefinition | undefined): number =>
	!def?.shape ? 0.6 : def.shape.kind === 'cylinder' ? def.shape.radius : def.shape.size[0] / 2;

/**
 * What is on the floor while a subtree is carried: the design without it, and the assembly itself
 * (null when nothing is carried).
 */
export function withoutCarried(
	doc: Pick<Doc, 'design' | 'loose'>,
	carried: number | null
): { design: VesselDesign; loose: VesselDesign[]; assembly: VesselDesign | null } {
	if (carried === null) return { ...doc, assembly: null };
	const out = extract(doc, carried);
	return out
		? { design: out.design, loose: out.loose, assembly: out.assembly }
		: { ...doc, assembly: null };
}

export interface SceneInput {
	design: VesselDesign;
	loose: readonly VesselDesign[];
	parts: PartLookup;
	/** The assembly being placed: a new part or the carried subtree. */
	held: VesselDesign | null;
	targets: readonly AttachTarget[];
	/** Index into `targets` shown as the ghost and the active marker. */
	cursor: number | null;
}

export interface BuiltScene {
	scene: VabScene;
	ghost: AttachTarget | null;
}

export function buildScene(input: SceneInput): BuiltScene {
	const { design, loose, parts, held, targets, cursor } = input;
	const out: VabPart[] = [];
	const groups: VabGroup[] = [{ id: 'main', x: 0, z: 0 }];
	const nodes: VabNode[] = [];

	const place = (
		assembly: VesselDesign,
		group: string,
		role: VabPart['role'],
		prefix = ''
	): void => {
		const at = positionsOf(assembly, parts);
		if (!at) return;
		for (const p of assembly.parts) {
			const pos = at.get(p.index);
			if (pos)
				out.push({
					key: `${prefix}${partKey(p.index)}`,
					definition: p.part,
					position: [pos.x, pos.y, pos.z],
					group,
					role
				});
		}
	};
	place(design, 'main', 'solid');
	loose.forEach((a, i) => {
		const id = looseGroup(rootOf(a));
		groups.push({ id, x: looseX(i), z: 0 });
		place(a, id, 'solid');
	});

	let ghost: AttachTarget | null = null;
	if (held && cursor !== null && targets[cursor]) {
		ghost = targets[cursor]!;
		const merged = previewAttach(design, held, ghost);
		const at = positionsOf(merged, parts);
		if (at) {
			const heldIds = new Set(held.parts.map((p) => p.index));
			for (const p of merged.parts) {
				const pos = at.get(p.index);
				if (pos && heldIds.has(p.index)) {
					out.push({
						key: `g${partKey(p.index)}`,
						definition: p.part,
						position: [pos.x, pos.y, pos.z],
						group: 'main',
						role: 'ghost'
					});
				}
			}
		}
	}

	if (held) {
		const rootDef = parts.get(held.parts.find((p) => p.parent === null)?.part ?? '');
		targets.forEach((t, i) => {
			const parentDef = t.parent
				? parts.get(design.parts.find((p) => p.index === t.parent!.index)?.part ?? '')
				: undefined;
			const dir = t.parent ? parentDef?.attach?.[t.parent.parentNode]?.dir : undefined;
			nodes.push({
				key: `t${i}`,
				group: 'main',
				// An empty design offers the platform itself: the marker sits at the foot of the future root.
				position: t.parent ? [t.point.x, t.point.y, t.point.z] : [0, -heightOf(rootDef) / 2, 0],
				dir: dir ? [dir[0], dir[1], dir[2]] : [0, 1, 0],
				radius: Math.max(radiusOf(parentDef), radiusOf(rootDef), 0.5),
				state: i === cursor ? 'active' : 'target'
			});
		});
	}
	return { scene: { parts: out, groups, nodes }, ghost };
}

/**
 * Where the placement cursor starts: the lower node of the part placed last (so repeated placing
 * builds a stack downwards), else the lowest target, else the first.
 */
export function defaultCursor(
	targets: readonly AttachTarget[],
	lastPlaced: number | null
): number | null {
	if (targets.length === 0) return null;
	const below = targets.findIndex(
		(t) => t.parent?.index === lastPlaced && t.parent.parentNode === 'bottom'
	);
	if (below >= 0) return below;
	return targets.length - 1;
}
