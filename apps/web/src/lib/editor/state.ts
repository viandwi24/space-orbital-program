/**
 * VAB editor state (ADR 0029): an immutable value with pure operations, so undo and redo are
 * snapshot swaps and everything is unit-tested without a DOM. The design is the core
 * `VesselDesign` (ADR 0016); detached subtrees live next to it as "loose" assemblies, which are
 * themselves one-root designs, so every layout and validation function works on them unchanged.
 */
import {
	partId,
	resolveVesselDesign,
	type PartLookup,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { emptyDesign, freeNodes, removePart, subtreeOf } from '../design';
import { autoStages, sameStages } from './staging';

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

export interface Content {
	parts: PartLookup;
}

/** Where a new part (or a held assembly) goes. */
export interface AttachTarget {
	/** The part and node it hangs on; `null` places the root of an empty design. */
	parent: { index: number; parentNode: string } | null;
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
	const auto = autoStages(design, content.parts);
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
				stages: next.design.parts.length > 0 ? autoStages(next.design, content.parts) : []
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
								node: target.node
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

/** Adds a catalogue part. Throws when `target` is not one of `attachTargets` (callers pick from that list). */
export function attachNew(
	state: EditorState,
	content: Content,
	part: string,
	target: AttachTarget
): EditorState {
	if (!content.parts.get(part)) throw new Error(`unknown part "${part}"`);
	const index = state.nextIndex;
	const design = join(state.design, singlePart(part, index), target);
	assertResolves(design, content);
	return commit(state, { ...state, design, nextIndex: index + 1 }, content);
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

/** Detaches a subtree and leaves it loose in the hangar. A part that already roots a loose assembly stays as it is. */
export function detach(state: EditorState, content: Content, index: number): EditorState {
	if (state.loose.some((a) => rootOf(a) === index)) return state;
	const out = extract(state, index);
	if (!out) throw new Error(`no part ${index}`);
	return commit(
		state,
		{ ...state, design: out.design, loose: [...out.loose, out.assembly] },
		content
	);
}

/** Deletes a subtree for good. */
export function deleteSubtree(state: EditorState, content: Content, index: number): EditorState {
	const out = extract(state, index);
	if (!out) throw new Error(`no part ${index}`);
	return commit(state, { ...state, design: out.design, loose: out.loose }, content);
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
	const design = join(out.design, out.assembly, target);
	assertResolves(design, content);
	return commit(state, { ...state, design, loose: out.loose }, content);
}

/** Replaces everything (load, new vessel, example); one undo step. */
export function replaceDesign(
	state: EditorState,
	content: Content,
	design: VesselDesign
): EditorState {
	const keep = sameStages(design.stages, autoStages(design, content.parts));
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

/** Positions of every part of a resolvable design relative to its root, or null when it does not resolve. */
export function positionsOf(design: VesselDesign, parts: PartLookup): Map<number, Vec3> | null {
	if (design.parts.length === 0) return new Map();
	const r = resolveVesselDesign(design, parts);
	return r.ok ? new Map(r.parts.map((p) => [p.index, p.position])) : null;
}

/**
 * Every place `assembly` can be attached to `design`: for each free node of the design and each
 * free node of the assembly's root whose directions are opposite (stack rule, ADR 0016). An empty
 * design offers the root position. Sorted from the highest node down, then by name, so Tab order
 * follows the stack.
 */
export function attachTargets(
	design: VesselDesign,
	assembly: VesselDesign,
	parts: PartLookup
): AttachTarget[] {
	const root = assembly.parts.find((p) => p.parent === null);
	const rootDef = root && parts.get(root.part);
	if (!root || !rootDef) return [];
	const mine = freeNodes(assembly, parts, root.index);
	if (design.parts.length === 0) {
		const node = mine[0] ?? '';
		return [{ parent: null, node, position: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } }];
	}
	const placed = positionsOf(design, parts);
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
				out.push({
					parent: { index: p.index, parentNode: pn },
					node: cn,
					position: {
						x: at.x + parentNode.pos[0] - child.pos[0],
						y: at.y + parentNode.pos[1] - child.pos[1],
						z: at.z + parentNode.pos[2] - child.pos[2]
					},
					point: {
						x: at.x + parentNode.pos[0],
						y: at.y + parentNode.pos[1],
						z: at.z + parentNode.pos[2]
					}
				});
			}
		}
	}
	return out.sort(
		(a, b) =>
			b.point.y - a.point.y ||
			a.parent!.index - b.parent!.index ||
			a.parent!.parentNode.localeCompare(b.parent!.parentNode)
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
