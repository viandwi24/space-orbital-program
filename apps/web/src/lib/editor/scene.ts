/**
 * Turns editor state into what the 3D view draws (ADR 0029): the design as group `main`, each
 * loose assembly as its own group on the floor, the translucent ghost of whatever is being placed,
 * and a marker on every place it can go. Pure; the page feeds the result to `VabView.setScene`.
 */
import { rotateY, type PartDefinition, type PartLookup, type VesselDesign } from '@orbital/core';
import type { VabGroup, VabNode, VabPart, VabScene } from '@orbital/renderer';
import {
	extract,
	layoutOf,
	planAttach,
	previewAttach,
	rootOf,
	type AttachTarget,
	type Doc
} from './state';

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
	/** A target the pointer is over (a radial site between the listed ones): shown as the ghost instead of `cursor`'s. */
	pointer?: AttachTarget | null;
	/** Copies made by a radial placement of a new part (the ghost shows them all). Default 1. */
	symmetry?: number;
	/** Draw rings for the keyboard's radial sites (default true); the pointer needs none. */
	radialMarkers?: boolean;
	/** `held` is a catalogue part not yet in the design (default) or an assembly being moved. */
	kind?: 'new' | 'carry';
}

export interface BuiltScene {
	scene: VabScene;
	ghost: AttachTarget | null;
}

export function buildScene(input: SceneInput): BuiltScene {
	const { design, loose, parts, held, targets, cursor, pointer } = input;
	const symmetry = input.symmetry ?? 1;
	const kind = input.kind ?? 'new';
	const out: VabPart[] = [];
	const groups: VabGroup[] = [{ id: 'main', x: 0, z: 0 }];
	const nodes: VabNode[] = [];

	const place = (
		assembly: VesselDesign,
		group: string,
		role: VabPart['role'],
		prefix = ''
	): void => {
		const at = layoutOf(assembly, parts);
		if (!at) return;
		for (const p of assembly.parts) {
			const l = at.get(p.index);
			if (l)
				out.push({
					key: `${prefix}${partKey(p.index)}`,
					definition: p.part,
					position: [l.position.x, l.position.y, l.position.z],
					yaw: l.yaw,
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
	// A radial cursor site is shown only to the keyboard (its rings are on); the pointer has its own.
	const cursorTarget = cursor !== null ? (targets[cursor] ?? null) : null;
	const shown =
		pointer ?? (cursorTarget?.radial && input.radialMarkers === false ? null : cursorTarget);
	if (held && shown) {
		ghost = shown;
		const heldRoot = rootOf(held);
		const merged =
			kind === 'new'
				? planAttach(
						{ design, loose: [...loose], nextIndex: heldRoot },
						held.parts.find((p) => p.index === heldRoot)!.part,
						ghost,
						symmetry
					)
				: { design: previewAttach(design, held, ghost), added: held.parts.map((p) => p.index) };
		const at = layoutOf(merged.design, parts);
		if (at) {
			const added = new Set(merged.added);
			const heldIds = kind === 'new' ? added : new Set(held.parts.map((p) => p.index));
			for (const p of merged.design.parts) {
				const l = at.get(p.index);
				if (l && heldIds.has(p.index)) {
					out.push({
						key: `g${partKey(p.index)}`,
						definition: p.part,
						position: [l.position.x, l.position.y, l.position.z],
						yaw: l.yaw,
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
			if (t.radial && input.radialMarkers === false) return;
			const parentDef = t.parent
				? parts.get(design.parts.find((p) => p.index === t.parent!.index)?.part ?? '')
				: undefined;
			let dir: readonly number[] | undefined = t.parent
				? parentDef?.attach?.[t.parent.parentNode]?.dir
				: undefined;
			if (t.parent && dir) {
				// A node of a turned part points the way the part is turned.
				const yaw = layoutOf(design, parts)?.get(t.parent.index)?.yaw ?? 0;
				const turned = rotateY([dir[0]!, dir[1]!, dir[2]!], yaw);
				dir = [turned.x, turned.y, turned.z];
			}
			if (t.radial && t.parent) {
				const yaw = layoutOf(design, parts)?.get(t.parent.index)?.yaw ?? 0;
				const out = rotateY([1, 0, 0], yaw + t.radial.angle);
				dir = [out.x, out.y, out.z];
			}
			nodes.push({
				key: `t${i}`,
				group: 'main',
				// An empty design offers the platform itself: the marker sits at the foot of the future root.
				position: t.parent ? [t.point.x, t.point.y, t.point.z] : [0, -heightOf(rootDef) / 2, 0],
				dir: dir ? [dir[0]!, dir[1]!, dir[2]!] : [0, 1, 0],
				radius: t.radial ? 0.3 : Math.max(radiusOf(parentDef), radiusOf(rootDef), 0.5),
				state: !pointer && i === cursor ? 'active' : 'target'
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
