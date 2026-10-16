/**
 * VAB editor state (ADR 0029): an immutable value with pure operations, so undo and redo are
 * snapshot swaps and everything is unit-tested without a DOM. The design is the core
 * `VesselDesign` (ADR 0016); detached subtrees live next to it as "loose" assemblies, which are
 * themselves one-root designs, so every layout and validation function works on them unchanged.
 */
import {
	SURFACE_NODE,
	azimuthOf,
	partId,
	resolveVesselDesign,
	rotateY,
	type PartDefinition,
	type PartLookup,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { emptyDesign, freeNodes, removePart, subtreeOf } from '../design';
import { autoStages, sameStages, type StagingContent } from './staging';

export interface Doc {
	design: VesselDesign;
	/** Detached assemblies; each is a design with one root and no stages. Indices are unique across `design` and all of these. */
	loose: VesselDesign[];
	/** True while the stages are computed (`autoStages`); any manual stage edit clears it. */
	autoStage: boolean;
	nextIndex: number;
}

export interface EditorState extends Doc {
	past: Doc[];
	future: Doc[];
}

export type Content = StagingContent;

/** Where a new part (or a held assembly) goes. */
export interface AttachTarget {
	/**
	 * The part and node it hangs on; `null` places the root of an empty design. A radial target has
	 * `parentNode` `"surface"` and `radial` (ADR 0034).
	 */
	parent: { index: number; parentNode: string } | null;
	/** Azimuth (rad, in the parent's frame) and height on the parent's side, for a radial target. */
	radial?: { angle: number; y: number };
	/** Node of the attaching part used for the link. */
	node: string;
	/** Origin of the attaching part relative to the design root's origin, metres. */
	position: Vec3;
	/** The attach point itself, same frame. */
	point: Vec3;
}

const HISTORY_LIMIT = 100;

const maxIndex = (docs: readonly Pick<VesselDesign, 'parts'>[]): number =>
	docs.reduce((m, d) => d.parts.reduce((n, p) => Math.max(n, p.index), m), -1);

export function createEditor(design: VesselDesign, content: Content): EditorState {
	const auto = autoStages(design, content);
	return {
		design,
		loose: [],
		autoStage: sameStages(design.stages, auto),
		nextIndex: maxIndex([design]) + 1,
		past: [],
		future: []
	};
}

export const rootOf = (assembly: Pick<VesselDesign, 'parts'>): number =>
	assembly.parts.find((p) => p.parent === null)!.index;

const snapshotOf = (s: Doc): Doc => ({
	design: s.design,
	loose: s.loose,
	autoStage: s.autoStage,
	nextIndex: s.nextIndex
});

/** Applies auto-staging when it is on, then pushes the previous document onto the history. */
function commit(state: EditorState, next: Doc, content: Content): EditorState {
	const design = next.autoStage
		? {
				...next.design,
				stages: next.design.parts.length > 0 ? autoStages(next.design, content) : []
			}
		: next.design;
	const past = [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT);
	return { ...snapshotOf({ ...next, design }), past, future: [] };
}

export const canUndo = (s: EditorState): boolean => s.past.length > 0;
export const canRedo = (s: EditorState): boolean => s.future.length > 0;

export function undo(s: EditorState): EditorState {
	const prev = s.past.at(-1);
	if (!prev) return s;
	return { ...prev, past: s.past.slice(0, -1), future: [snapshotOf(s), ...s.future] };
}

export function redo(s: EditorState): EditorState {
	const next = s.future[0];
	if (!next) return s;
	return { ...next, past: [...s.past, snapshotOf(s)], future: s.future.slice(1) };
}

/** The name is not an undo step: typing a name must not fill the history. */
export const rename = (s: EditorState, name: string): EditorState => ({
	...s,
	design: { ...s.design, name: name.trim() === '' ? 'Untitled vessel' : name }
});

// --- building -------------------------------------------------------------------------------------

/** A one-part assembly for a catalogue part. */
export function singlePart(part: string, index: number): VesselDesign {
	return {
		...emptyDesign('part'),
		parts: [{ index, part: partId(part), parent: null }]
	};
}

/** Appends `assembly` (one root) to `design` at `target`; no validation beyond the target's shape. */
function join(design: VesselDesign, assembly: VesselDesign, target: AttachTarget): VesselDesign {
	const root = rootOf(assembly);
	const parts = assembly.parts.map((p) =>
		p.index === root
			? {
					...p,
					parent: target.parent
						? {
								index: target.parent.index,
								parentNode: target.parent.parentNode,
								node: target.node,
								...(target.radial ? { radial: { ...target.radial } } : {})
							}
						: null
				}
			: p
	);
	if (design.parts.length === 0) {
		if (target.parent !== null) throw new Error('an empty design can only take a root part');
		return { ...design, parts };
	}
	if (target.parent === null) throw new Error('a design with parts needs a parent to attach to');
	return { ...design, parts: [...design.parts, ...parts] };
}

function assertResolves(design: VesselDesign, content: Content): void {
	const r = resolveVesselDesign(design, content.parts);
	if (!r.ok) throw new Error(`the edit would make an invalid design: ${r.errors.join('; ')}`);
}

const maxSymmetry = (docs: readonly Pick<VesselDesign, 'parts'>[]): number =>
	docs.reduce((m, d) => d.parts.reduce((n, p) => Math.max(n, p.symmetry ?? -1), m), -1);

/** Members of the symmetry group of `index` in `design`, ascending index; just `[index]` without one. */
export function groupOf(design: Pick<VesselDesign, 'parts'>, index: number): number[] {
	const entry = design.parts.find((p) => p.index === index);
	if (!entry || entry.symmetry === undefined) return [index];
	return design.parts
		.filter((p) => p.symmetry === entry.symmetry)
		.map((p) => p.index)
		.sort((a, b) => a - b);
}

/** Symmetry counts the VAB offers, ordered. */
export const SYMMETRY_COUNTS = [1, 2, 3, 4, 6] as const;

/**
 * What adding `part` at `target` produces, with symmetry. A radial target with `symmetry` n > 1
 * gets n copies at `angle + 2 pi k / n`. A target on a part that belongs to a symmetry group gets
 * a copy on every member of the group (a booster on each radial decoupler). Copies share a new
 * group number. Falls back to one part when a member's node is taken. Pure; used by `attachNew`
 * and the ghost preview.
 */
export function planAttach(
	state: Pick<Doc, 'design' | 'loose' | 'nextIndex'>,
	part: string,
	target: AttachTarget,
	symmetry = 1
): { design: VesselDesign; added: number[] } {
	const base = state.nextIndex;
	const targets: AttachTarget[] = [];
	if (target.parent && target.radial && symmetry > 1) {
		for (let k = 0; k < symmetry; k++) {
			targets.push({
				...target,
				radial: { angle: target.radial.angle + (2 * Math.PI * k) / symmetry, y: target.radial.y }
			});
		}
	} else if (target.parent && !target.radial) {
		const members = groupOf(state.design, target.parent.index);
		const used = (m: number): boolean =>
			state.design.parts.some(
				(p) => p.parent?.index === m && p.parent.parentNode === target.parent!.parentNode
			);
		if (members.length > 1 && !members.some(used)) {
			for (const m of members) {
				targets.push({ ...target, parent: { index: m, parentNode: target.parent.parentNode } });
			}
		}
	}
	if (targets.length === 0) targets.push(target);
	const group = targets.length > 1 ? maxSymmetry([state.design, ...state.loose]) + 1 : undefined;
	let design = state.design;
	const added: number[] = [];
	targets.forEach((t, k) => {
		const single = singlePart(part, base + k);
		const one: VesselDesign =
			group === undefined
				? single
				: {
						...single,
						parts: single.parts.map((p) => ({ ...p, symmetry: group }))
					};
		design = join(design, one, t);
		added.push(base + k);
	});
	return { design, added };
}

/** Adds a catalogue part (and its symmetric copies). Throws when `target` is not one of `attachTargets` (callers pick from that list). */
export function attachNew(
	state: EditorState,
	content: Content,
	part: string,
	target: AttachTarget,
	symmetry = 1
): EditorState {
	if (!content.parts.get(part)) throw new Error(`unknown part "${part}"`);
	const { design, added } = planAttach(state, part, target, symmetry);
	assertResolves(design, content);
	return commit(state, { ...state, design, nextIndex: state.nextIndex + added.length }, content);
}

/** Takes the subtree under `index` out of the design or a loose assembly. */
export function extract(
	state: Pick<Doc, 'design' | 'loose'>,
	index: number
): { design: VesselDesign; loose: VesselDesign[]; assembly: VesselDesign } | null {
	const inDesign = state.design.parts.some((p) => p.index === index);
	const looseAt = inDesign
		? -1
		: state.loose.findIndex((a) => a.parts.some((p) => p.index === index));
	const from = inDesign ? state.design : state.loose[looseAt];
	if (!from) return null;
	const gone = subtreeOf(from, index);
	const assembly: VesselDesign = {
		...emptyDesign('loose'),
		parts: from.parts
			.filter((p) => gone.has(p.index))
			.map((p) => (p.index === index ? { ...p, parent: null } : p))
	};
	if (inDesign) return { design: removePart(from, index), loose: state.loose, assembly };
	const rest = { ...from, parts: from.parts.filter((p) => !gone.has(p.index)) };
	const loose = state.loose.flatMap((a, k) =>
		k !== looseAt ? [a] : rest.parts.length > 0 ? [rest] : []
	);
	return { design: state.design, loose, assembly };
}

/** Group members of `index` in the design or the loose assembly that holds it. */
function membersOf(state: Pick<Doc, 'design' | 'loose'>, index: number): number[] {
	const doc = state.design.parts.some((p) => p.index === index)
		? state.design
		: (state.loose.find((a) => a.parts.some((p) => p.index === index)) ?? state.design);
	return groupOf(doc, index);
}

/**
 * Detaches a subtree and leaves it loose in the hangar; with `single` false (the default) the
 * whole symmetry group goes, one assembly per member. A part that already roots a loose assembly
 * stays as it is.
 */
export function detach(
	state: EditorState,
	content: Content,
	index: number,
	options: { single?: boolean } = {}
): EditorState {
	if (state.loose.some((a) => rootOf(a) === index)) return state;
	let cur: Pick<Doc, 'design' | 'loose'> = state;
	for (const i of options.single ? [index] : membersOf(state, index)) {
		if (cur.loose.some((a) => rootOf(a) === i)) continue;
		const out = extract(cur, i);
		if (!out) {
			if (i === index) throw new Error(`no part ${index}`);
			continue;
		}
		cur = { design: out.design, loose: [...out.loose, out.assembly] };
	}
	return commit(state, { ...state, design: cur.design, loose: cur.loose }, content);
}

/** Deletes a subtree for good; the whole symmetry group unless `single`. */
export function deleteSubtree(
	state: EditorState,
	content: Content,
	index: number,
	options: { single?: boolean } = {}
): EditorState {
	let cur: Pick<Doc, 'design' | 'loose'> = state;
	for (const i of options.single ? [index] : membersOf(state, index)) {
		const out = extract(cur, i);
		if (!out) {
			if (i === index) throw new Error(`no part ${index}`);
			continue; // already gone with an earlier member's subtree
		}
		cur = { design: out.design, loose: out.loose };
	}
	return commit(state, { ...state, design: cur.design, loose: cur.loose }, content);
}

/**
 * Moves a subtree (from the design or from the loose assemblies) to `target`, one undo step.
 * `target` must come from `attachTargets` computed on the design without the subtree.
 */
export function moveSubtree(
	state: EditorState,
	content: Content,
	index: number,
	target: AttachTarget
): EditorState {
	const out = extract(state, index);
	if (!out) throw new Error(`no part ${index}`);
	// A part moved on its own leaves its symmetry group.
	const alone: VesselDesign = {
		...out.assembly,
		parts: out.assembly.parts.map(({ symmetry: _group, ...p }) => p)
	};
	const design = join(out.design, alone, target);
	assertResolves(design, content);
	return commit(state, { ...state, design, loose: out.loose }, content);
}

/** Replaces everything (load, new vessel, example); one undo step. */
export function replaceDesign(
	state: EditorState,
	content: Content,
	design: VesselDesign
): EditorState {
	const keep = sameStages(design.stages, autoStages(design, content));
	return commit(
		state,
		{
			design,
			loose: [],
			autoStage: keep,
			nextIndex: Math.max(state.nextIndex, maxIndex([design]) + 1)
		},
		content
	);
}

// --- staging ---------------------------------------------------------------------------------------

/** Stage of `index` (0 = fires first) or null. */
export const stageOf = (design: Pick<VesselDesign, 'stages'>, index: number): number | null => {
	const k = design.stages.findIndex((s) => s.includes(index));
	return k < 0 ? null : k;
};

function withStages(state: EditorState, content: Content, stages: number[][]): EditorState {
	const trimmed = stages.map((s) => [...s]);
	while (trimmed.length > 0 && trimmed.at(-1)!.length === 0) trimmed.pop();
	return commit(
		state,
		{ ...state, autoStage: false, design: { ...state.design, stages: trimmed } },
		content
	);
}

/**
 * Moves a part to stage `stage`, or to none (`null`). `stage === stages.length` opens a new stage
 * after the last one. A manual edit turns auto-staging off.
 */
export function moveToStage(
	state: EditorState,
	content: Content,
	index: number,
	stage: number | null
): EditorState {
	if (!state.design.parts.some((p) => p.index === index)) {
		throw new Error(`no part ${index} in the design`);
	}
	const stages = state.design.stages.map((s) => s.filter((i) => i !== index));
	if (stage !== null) {
		if (!Number.isInteger(stage) || stage < 0) throw new RangeError(`bad stage ${stage}`);
		while (stages.length <= stage) stages.push([]);
		stages[stage]!.push(index);
	}
	return withStages(state, content, stages);
}

/** Removes stage `k` when it is empty; later stages move up. */
export function removeEmptyStage(state: EditorState, content: Content, k: number): EditorState {
	const stage = state.design.stages[k];
	if (!stage || stage.length > 0) return state;
	return withStages(
		state,
		content,
		state.design.stages.filter((_, i) => i !== k)
	);
}

/** Opens an empty stage at position `k`; later stages move up. */
export function insertStage(state: EditorState, content: Content, k: number): EditorState {
	const stages = state.design.stages.map((s) => [...s]);
	stages.splice(Math.min(Math.max(0, k), stages.length), 0, []);
	return withStages(state, content, stages);
}

/** Switches auto-staging back on and recomputes the stages. */
export function enableAutoStage(state: EditorState, content: Content): EditorState {
	if (state.autoStage) return state;
	return commit(state, { ...state, autoStage: true }, content);
}

// --- attach targets -----------------------------------------------------------------------------------

const dot = (a: readonly number[], b: readonly number[]): number =>
	a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const unit = (v: readonly number[]): [number, number, number] => {
	const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
	return [v[0]! / l, v[1]! / l, v[2]! / l];
};

export interface PartLayout {
	position: Vec3;
	/** Turn about the vertical axis, rad. */
	yaw: number;
}

/** Position and yaw of every part of a resolvable design relative to its root, or null when it does not resolve. */
export function layoutOf(design: VesselDesign, parts: PartLookup): Map<number, PartLayout> | null {
	if (design.parts.length === 0) return new Map();
	const r = resolveVesselDesign(design, parts);
	return r.ok ? new Map(r.parts.map((p) => [p.index, { position: p.position, yaw: p.yaw }])) : null;
}

/** Positions of every part of a resolvable design relative to its root, or null when it does not resolve. */
export function positionsOf(design: VesselDesign, parts: PartLookup): Map<number, Vec3> | null {
	const layout = layoutOf(design, parts);
	return layout ? new Map([...layout].map(([i, l]) => [i, l.position])) : null;
}

/** The node a part attaches radially with: a horizontal one, `radial` first. Undefined for a part without one. */
export function radialNodeOf(def: PartDefinition | undefined): string | undefined {
	const names = Object.entries(def?.attach ?? {})
		.filter(([, n]) => Math.abs(n.dir[1]) < 1e-6 && Math.hypot(n.dir[0], n.dir[2]) > 0)
		.map(([name]) => name);
	return names.includes('radial') ? 'radial' : names[0];
}

const rootDefOf = (assembly: VesselDesign, parts: PartLookup): PartDefinition | undefined =>
	parts.get(assembly.parts.find((p) => p.parent === null)?.part ?? '');

/**
 * The radial target for `assembly` on the side of part `parentIndex` at `angle` (rad, in the
 * parent's frame) and `y` (m from the parent's origin), or null when the parent is not a cylinder,
 * the assembly has no horizontal node, or the spot is outside the parent. Geometry is exactly
 * `resolveVesselDesign`'s (ADR 0034).
 */
export function radialTarget(
	design: VesselDesign,
	assembly: VesselDesign,
	parts: PartLookup,
	parentIndex: number,
	angle: number,
	y: number
): AttachTarget | null {
	const childDef = rootDefOf(assembly, parts);
	const node = radialNodeOf(childDef);
	const entry = design.parts.find((p) => p.index === parentIndex);
	const parentDef = entry && parts.get(entry.part);
	const layout = layoutOf(design, parts)?.get(parentIndex);
	const shape = parentDef?.shape;
	if (!childDef || !node || !layout || shape?.kind !== 'cylinder') return null;
	if (Math.abs(y) > shape.height / 2 + 1e-9) return null;
	const cn = childDef.attach![node]!;
	const yaw = layout.yaw + angle + Math.PI - azimuthOf(cn.dir);
	const side = rotateY([shape.radius, 0, 0], angle);
	const on = rotateY([side.x, side.y + y, side.z], layout.yaw);
	const own = rotateY(cn.pos, yaw);
	const point = {
		x: layout.position.x + on.x,
		y: layout.position.y + on.y,
		z: layout.position.z + on.z
	};
	return {
		parent: { index: parentIndex, parentNode: SURFACE_NODE },
		node,
		radial: { angle, y },
		position: { x: point.x - own.x, y: point.y - own.y, z: point.z - own.z },
		point
	};
}

/** Snaps a radial site: angle to `angleStep`, height to `gridStep`, and to the parent's ends or middle when the child's end is close. */
export function snapRadial(
	site: { angle: number; y: number },
	parentHeight: number,
	childHeight: number,
	options: { angleStep?: number; gridStep?: number; pull?: number } = {}
): { angle: number; y: number } {
	const angleStep = options.angleStep ?? Math.PI / 12;
	const gridStep = options.gridStep ?? 0.125;
	const pull = options.pull ?? 0.2;
	const angle = angleStep > 0 ? Math.round(site.angle / angleStep) * angleStep : site.angle;
	let y = gridStep > 0 ? Math.round(site.y / gridStep) * gridStep : site.y;
	const stops = [0, -parentHeight / 2 + childHeight / 2, parentHeight / 2 - childHeight / 2];
	for (const stop of stops) if (Math.abs(site.y - stop) < pull) y = stop;
	const half = parentHeight / 2;
	return { angle, y: Math.min(half, Math.max(-half, y)) };
}

/** Where a pointer ray hit (design frame) lands on the cylinder `parentIndex`: azimuth and height in the parent's frame. */
export function siteOfPoint(
	design: VesselDesign,
	parts: PartLookup,
	parentIndex: number,
	point: Vec3
): { angle: number; y: number } | null {
	const layout = layoutOf(design, parts)?.get(parentIndex);
	if (!layout) return null;
	const d = rotateY(
		[point.x - layout.position.x, point.y - layout.position.y, point.z - layout.position.z],
		-layout.yaw
	);
	return { angle: azimuthOf([d.x, 0, d.z]), y: d.y };
}

/**
 * Every place `assembly` can be attached to `design`: for each free node of the design and each
 * free node of the assembly's root whose directions are opposite (stack rule, ADR 0016), and, for
 * an assembly with a horizontal node, a few radial sites per cylindrical part (middle and both
 * ends, at `radialAngle`) for keyboard placement; the pointer picks any site with `radialTarget`.
 * An empty design offers the root position. Sorted from the highest point down, then by name, so
 * Tab order follows the stack.
 */
export function attachTargets(
	design: VesselDesign,
	assembly: VesselDesign,
	parts: PartLookup,
	radialAngle = 0
): AttachTarget[] {
	const root = assembly.parts.find((p) => p.parent === null);
	const rootDef = root && parts.get(root.part);
	if (!root || !rootDef) return [];
	const mine = freeNodes(assembly, parts, root.index);
	if (design.parts.length === 0) {
		const node = mine[0] ?? '';
		return [{ parent: null, node, position: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } }];
	}
	const placed = layoutOf(design, parts);
	if (!placed) return [];
	const out: AttachTarget[] = [];
	for (const p of design.parts) {
		const def = parts.get(p.part);
		const at = placed.get(p.index);
		if (!def?.attach || !at) continue;
		for (const pn of freeNodes(design, parts, p.index)) {
			const parentNode = def.attach[pn]!;
			for (const cn of mine) {
				const child = rootDef.attach?.[cn];
				if (!child || dot(unit(parentNode.dir), unit(child.dir)) > -1 + 1e-6) continue;
				const d = rotateY(
					[
						parentNode.pos[0] - child.pos[0],
						parentNode.pos[1] - child.pos[1],
						parentNode.pos[2] - child.pos[2]
					],
					at.yaw
				);
				const on = rotateY(parentNode.pos, at.yaw);
				out.push({
					parent: { index: p.index, parentNode: pn },
					node: cn,
					position: { x: at.position.x + d.x, y: at.position.y + d.y, z: at.position.z + d.z },
					point: { x: at.position.x + on.x, y: at.position.y + on.y, z: at.position.z + on.z }
				});
			}
		}
	}
	if (radialNodeOf(rootDef)) {
		const childHeight = rootDef.shape?.kind === 'cylinder' ? rootDef.shape.height : 1;
		for (const p of design.parts) {
			const shape = parts.get(p.part)?.shape;
			if (shape?.kind !== 'cylinder' || shape.height < 0.5) continue;
			const stops = [0, shape.height / 2 - childHeight / 2, -shape.height / 2 + childHeight / 2];
			for (const y of new Set(stops.map((v) => Math.round(v * 1000) / 1000))) {
				if (Math.abs(y) > shape.height / 2) continue;
				const t = radialTarget(design, assembly, parts, p.index, radialAngle, y);
				if (t) out.push(t);
			}
		}
	}
	return out.sort(
		(a, b) =>
			b.point.y - a.point.y ||
			a.parent!.index - b.parent!.index ||
			a.parent!.parentNode.localeCompare(b.parent!.parentNode) ||
			(a.radial?.y ?? 0) - (b.radial?.y ?? 0)
	);
}

/** The design as it would be after attaching `assembly` at `target` (for the ghost preview). */
export function previewAttach(
	design: VesselDesign,
	assembly: VesselDesign,
	target: AttachTarget
): VesselDesign {
	return join(design, assembly, target);
}
