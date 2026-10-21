/**
 * Turns editor state into what the 3D view draws (ADR 0029): the design as group `main`, each
 * loose assembly as its own group on the floor, the translucent ghost of whatever is being placed,
 * and a marker on every place it can go. Pure; the page feeds the result to `VabView.setScene`.
 */
import {
	effectiveDef,
	mat3Apply,
	mat3OfQuat,
	surfaceSite,
	type PartDefinition,
	type PartLookup,
	type VesselDesign
} from '@orbital/core';
import type { VabGroup, VabLink, VabMarker, VabNode, VabPart, VabScene } from '@orbital/renderer';
import { sizeMismatches } from './checks';
import { openModules } from './inside';
import {
	layoutOf,
	planCarry,
	radialTarget,
	planAttachAssembly,
	previewAttach,
	rootOf,
	type AttachTarget,
	type CarryPlan,
	type Doc,
	type SymmetrySpec
} from './state';

/**
 * Per-instance generator parameters of a design part (plan 219, `PartVisual.paramsFrom`): the
 * named module's config from the definition with the part's design settings over it; lists and
 * objects as JSON text. None for a part whose visual names no module.
 */
export function partParams(
	part: VesselDesign['parts'][number],
	def: PartDefinition | undefined
): { params?: Record<string, number | string | boolean> } {
	const from = def?.visual?.paramsFrom;
	if (!from) return {};
	const base = def.modules?.find(([id]) => id === from)?.[1];
	const merged: Record<string, unknown> = {
		...(typeof base === 'object' && base !== null ? (base as Record<string, unknown>) : {}),
		...(part.settings?.[from] ?? {})
	};
	const params: Record<string, number | string | boolean> = {};
	for (const [k, v] of Object.entries(merged)) {
		if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') params[k] = v;
		else if (v !== undefined && v !== null) params[k] = JSON.stringify(v);
	}
	return { params };
}

/** Floor positions of loose assemblies: alternate right and left of the platform, nearest first. */
export const looseX = (i: number): number => (i % 2 === 0 ? 1 : -1) * (7.6 + Math.floor(i / 2) * 3);

export const looseGroup = (root: number): string => `loose:${root}`;
export const partKey = (index: number): string => `${index}`;

/** What the view needs to turn a part: its yaw, and the full rotation only when it is tilted (ADR 0071). */
const turnOf = (l: {
	yaw: number;
	tilted: boolean;
	rotation: { x: number; y: number; z: number; w: number };
}) =>
	l.tilted
		? { yaw: l.yaw, rotation: [l.rotation.x, l.rotation.y, l.rotation.z, l.rotation.w] as const }
		: { yaw: l.yaw };

const heightOf = (def: PartDefinition | undefined): number =>
	!def?.shape ? 1 : def.shape.kind === 'cylinder' ? def.shape.height : def.shape.size[1];
const radiusOf = (def: PartDefinition | undefined): number =>
	!def?.shape ? 0.6 : def.shape.kind === 'cylinder' ? def.shape.radius : def.shape.size[0] / 2;

/**
 * What is on the floor while a subtree is carried: the design without it, the assembly itself
 * (null when nothing is carried) and, for a radial part of a symmetry group, the other members
 * that travel with it (`single` carries the part alone).
 */
export function withoutCarried(
	doc: Pick<Doc, 'design' | 'loose'>,
	carried: number | null,
	single = false
): {
	design: VesselDesign;
	loose: VesselDesign[];
	assembly: VesselDesign | null;
	followers: CarryPlan['followers'];
} {
	if (carried === null) return { ...doc, assembly: null, followers: [] };
	const plan = planCarry(doc, carried, { single });
	return plan
		? { design: plan.design, loose: plan.loose, assembly: plan.held, followers: plan.followers }
		: { ...doc, assembly: null, followers: [] };
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
	/** Copies made by a radial placement of a new part, or a mirror pair (the ghost shows them all). Default 1. */
	symmetry?: number | SymmetrySpec;
	/** Where the held part floats when no site is under the pointer (plan 244): shown as a free ghost. */
	free?: readonly [number, number, number] | null;
	/** Targets whose rings glow because the pointer is near them (plan 244). */
	near?: ReadonlySet<number>;
	/** Fairing handles (plan 243): rings the Hangar draws on the shell being edited, in the main group's frame. */
	handles?: readonly { key: string; position: readonly [number, number, number]; radius: number }[];
	/** Draw rings for the keyboard's radial sites (default true); the pointer needs none. */
	radialMarkers?: boolean;
	/** The other members of a carried symmetry group (see `withoutCarried`). */
	followers?: CarryPlan['followers'];
	/** Stability markers to draw (centre of mass, centre of pressure), in the main group's frame. */
	markers?: VabMarker[];
	/** `held` is a catalogue part not yet in the design (default) or an assembly being moved. */
	kind?: 'new' | 'carry';
	/**
	 * Seeing inside (plan 315): design parts drawn see-through and parts shown open, in the editor
	 * only.
	 */
	inside?: {
		seeThrough: ReadonlySet<number>;
		open: ReadonlySet<number>;
		/** What each shell holds (design indices). */
		holds?: ReadonlyMap<number, readonly number[]>;
	};
	/** A strut or fuel line being placed: the bar from the first end to the pointer (ADR 0071). */
	preview?: {
		definition: string;
		from: readonly [number, number, number];
		to: readonly [number, number, number];
	} | null;
}

export interface BuiltScene {
	scene: VabScene;
	ghost: AttachTarget | null;
}

/** The carried subtree and its group at `ghost`: followers keep their angle relative to the picked part. */
function carryPreview(
	design: VesselDesign,
	held: VesselDesign,
	ghost: AttachTarget,
	followers: CarryPlan['followers'],
	parts: PartLookup
): { design: VesselDesign; added: number[] } {
	let merged = previewAttach(design, held, ghost);
	const added = held.parts.map((p) => p.index);
	if (ghost.radial && ghost.parent) {
		for (const f of followers) {
			const t = radialTarget(
				merged,
				f.assembly,
				parts,
				ghost.parent.index,
				ghost.radial.angle + f.dAngle,
				ghost.radial.y
			);
			if (!t) continue;
			merged = previewAttach(merged, f.assembly, t);
			added.push(...f.assembly.parts.map((p) => p.index));
		}
	}
	return { design: merged, added };
}

export function buildScene(input: SceneInput): BuiltScene {
	const { design, loose, parts, held, targets, cursor, pointer } = input;
	const symmetry = input.symmetry ?? 1;
	const kind = input.kind ?? 'new';
	const out: VabPart[] = [];
	const links: VabLink[] = [];
	const groups: VabGroup[] = [{ id: 'main', x: 0, z: 0 }];
	const nodes: VabNode[] = [];

	/** See-through and open, for a part of the design (plan 315). */
	const insideOf = (index: number, part: string): Partial<VabPart> => {
		const inside = input.inside;
		if (!inside) return {};
		const modules = inside.open.has(index) ? openModules(parts.get(part)) : null;
		const holds = inside.holds?.get(index);
		return {
			...(inside.seeThrough.has(index)
				? { seeThrough: true, ...(holds ? { holds: holds.map(partKey) } : {}) }
				: {}),
			...(modules ? { modules } : {})
		};
	};
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
			if (!l) continue;
			out.push({
				key: `${prefix}${partKey(p.index)}`,
				definition: p.part,
				position: [l.position.x, l.position.y, l.position.z],
				...turnOf(l),
				group,
				role,
				...partParams(p, parts.get(p.part)),
				...(group === 'main' && role === 'solid' ? insideOf(p.index, p.part) : {})
			});
			if (l.link && role === 'solid') {
				links.push({
					key: `${prefix}${partKey(p.index)}`,
					group,
					definition: p.part,
					from: [l.position.x, l.position.y, l.position.z],
					to: [l.link.point.x, l.link.point.y, l.link.point.z]
				});
			}
		}
	};
	place(design, 'main', 'solid');
	loose.forEach((a, i) => {
		const id = looseGroup(rootOf(a));
		groups.push({ id, x: looseX(i), z: 0 });
		place(a, id, 'solid');
	});

	if (input.preview) {
		links.push({
			key: 'preview',
			group: 'main',
			definition: input.preview.definition,
			from: [...input.preview.from],
			to: [...input.preview.to]
		});
	}

	let ghost: AttachTarget | null = null;
	// A radial cursor site is shown only to the keyboard (its rings are on); the pointer has its own.
	const cursorTarget = cursor !== null ? (targets[cursor] ?? null) : null;
	const shown =
		pointer ??
		(input.free
			? null
			: cursorTarget?.radial && input.radialMarkers === false
				? null
				: cursorTarget);
	if (held && shown) {
		ghost = shown;
		const merged =
			kind === 'new'
				? planAttachAssembly(
						{ design, loose: [...loose], nextIndex: Math.min(...held.parts.map((p) => p.index)) },
						held,
						ghost,
						symmetry
					)
				: carryPreview(design, held, ghost, input.followers ?? [], parts);
		const at = layoutOf(merged.design, parts);
		if (at) {
			const added = new Set(merged.added);
			for (const p of merged.design.parts) {
				const l = at.get(p.index);
				if (l && added.has(p.index)) {
					out.push({
						key: `g${partKey(p.index)}`,
						definition: p.part,
						position: [l.position.x, l.position.y, l.position.z],
						...turnOf(l),
						group: 'main',
						role: 'ghost',
						...partParams(p, parts.get(p.part))
					});
				}
			}
		}
	}

	if (held && !shown && input.free) {
		// nothing to attach to under the pointer: the part floats at the cursor, undimmed by a site
		const at = layoutOf(held, parts);
		if (at) {
			const [fx, fy, fz] = input.free;
			for (const p of held.parts) {
				const l = at.get(p.index);
				if (!l) continue;
				out.push({
					key: `f${partKey(p.index)}`,
					definition: p.part,
					position: [l.position.x + fx, l.position.y + fy, l.position.z + fz],
					...turnOf(l),
					group: 'main',
					role: 'free',
					...partParams(p, parts.get(p.part))
				});
			}
		}
	}

	if (held) {
		const rootDef = parts.get(held.parts.find((p) => p.parent === null)?.part ?? '');
		targets.forEach((t, i) => {
			if (t.radial && input.radialMarkers === false) return;
			const parentEntry = t.parent
				? design.parts.find((p) => p.index === t.parent!.index)
				: undefined;
			const parentRaw = parentEntry && parts.get(parentEntry.part);
			const parentDef = parentRaw && effectiveDef(parentRaw, parentEntry.settings);
			let dir: readonly number[] | undefined = t.parent
				? parentDef?.attach?.[t.parent.parentNode]?.dir
				: undefined;
			const parentLayout = t.parent ? layoutOf(design, parts)?.get(t.parent.index) : undefined;
			const turn = parentLayout ? mat3OfQuat(parentLayout.rotation) : undefined;
			if (t.parent && dir && turn) {
				// A node of a turned or tilted part points the way the part is turned.
				const turned = mat3Apply(turn, [dir[0]!, dir[1]!, dir[2]!]);
				dir = [turned.x, turned.y, turned.z];
			}
			if (t.radial && t.parent && turn) {
				// Outward normal of the parent's side at the site (a box has flat faces).
				const normal = surfaceSite(parentDef?.shape, t.radial.angle)?.normal ?? t.radial.angle;
				const out = mat3Apply(turn, [Math.cos(normal), 0, -Math.sin(normal)]);
				dir = [out.x, out.y, out.z];
			}
			nodes.push({
				key: `t${i}`,
				group: 'main',
				// An empty design offers the platform itself: the marker sits at the foot of the future root.
				position: t.parent ? [t.point.x, t.point.y, t.point.z] : [0, -heightOf(rootDef) / 2, 0],
				dir: dir ? [dir[0]!, dir[1]!, dir[2]!] : [0, 1, 0],
				radius: t.radial ? 0.3 : Math.max(radiusOf(parentDef), radiusOf(rootDef), 0.5),
				state:
					!pointer && !input.free && i === cursor
						? 'active'
						: input.near?.has(i)
							? 'near'
							: 'target'
			});
		});
	}
	for (const h of input.handles ?? []) {
		nodes.push({
			key: h.key,
			group: 'main',
			position: [h.position[0], h.position[1], h.position[2]],
			dir: [0, 1, 0],
			radius: h.radius,
			state: 'handle'
		});
	}
	// a joint whose two node sizes differ carries a mark where the parts meet (plan 244, 8b.3)
	const joints = layoutOf(design, parts);
	for (const m of sizeMismatches(design, parts)) {
		const child = design.parts.find((p) => p.index === m.index);
		const l = joints?.get(m.index);
		const node = child?.parent && parts.get(child.part)?.attach?.[child.parent.node];
		if (!l || !node) continue;
		const at = mat3Apply(mat3OfQuat(l.rotation), [node.pos[0], node.pos[1], node.pos[2]]);
		nodes.push({
			key: `m${m.index}`,
			group: 'main',
			position: [l.position.x + at.x, l.position.y + at.y, l.position.z + at.z],
			dir: [0, 1, 0],
			radius: Math.max(m.child, m.parent) / 2,
			state: 'mismatch'
		});
	}
	return {
		scene: { parts: out, groups, nodes, links, markers: input.markers ?? [] },
		ghost
	};
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
