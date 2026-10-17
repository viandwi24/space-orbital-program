/**
 * VAB editor state (ADR 0029): an immutable value with pure operations, so undo and redo are
 * snapshot swaps and everything is unit-tested without a DOM. The design is the core
 * `VesselDesign` (ADR 0016); detached subtrees live next to it as "loose" assemblies, which are
 * themselves one-root designs, so every layout and validation function works on them unchanged.
 */
import {
	SURFACE_NODE,
	azimuthOf,
	mat3Apply,
	mat3OfQuat,
	partId,
	placeRadial,
	placeStack,
	resolveVesselDesign,
	surfaceHalfHeight,
	surfacePoint,
	surfaceSite,
	type DesignTilt,
	type PartDefinition,
	type PartLookup,
	type Placement,
	type Quat,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { emptyDesign, freeNodes, removePart, subtreeOf, withDanglingLinks } from '../design';
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

/** Copy of `assembly` with its indices renumbered to `base`, `base + 1`, ... in ascending order of the old ones. */
export function reindex(assembly: VesselDesign, base: number): VesselDesign {
	const order = [...assembly.parts].sort((a, b) => a.index - b.index);
	const map = new Map(order.map((p, i) => [p.index, base + i]));
	return {
		...assembly,
		parts: order.map((p) => ({
			...p,
			index: map.get(p.index)!,
			parent: p.parent ? { ...p.parent, index: map.get(p.parent.index)! } : null
		})),
		stages: []
	};
}

/**
 * What adding `assembly` (one root, any number of parts, indices unique and not in `state`) at
 * `target` produces, with symmetry. A radial target with `symmetry` n > 1 gets n copies at
 * `angle + 2 pi k / n`. A target on a part that belongs to a symmetry group gets a copy on every
 * member of the group (a booster on each radial decoupler). Parts that were not in a group inside
 * the assembly share a new group across the copies (corresponding parts move together); groups
 * inside the assembly stay per copy. Falls back to one copy when a member's node is taken. Pure;
 * used by `attachAssembly` and the ghost preview.
 */
export function planAttachAssembly(
	state: Pick<Doc, 'design' | 'loose' | 'nextIndex'>,
	assembly: VesselDesign,
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
	const sorted = [...assembly.parts].sort((a, b) => a.index - b.index);
	const size = sorted.length;
	let nextGroup = maxSymmetry([state.design, ...state.loose]) + 1;
	// Corresponding parts across the copies share one group (only when there is more than one copy).
	const shared = new Map<number, number>();
	if (targets.length > 1) {
		for (const p of sorted) if (p.symmetry === undefined) shared.set(p.index, nextGroup++);
	}
	let design = state.design;
	const added: number[] = [];
	targets.forEach((t, k) => {
		const copy = reindex(assembly, base + k * size);
		const own = new Map<number, number>();
		const parts = copy.parts.map((p, j) => {
			const old = sorted[j]!;
			let group: number | undefined;
			if (old.symmetry !== undefined) {
				if (!own.has(old.symmetry)) own.set(old.symmetry, nextGroup++);
				group = own.get(old.symmetry);
			} else {
				group = shared.get(old.index);
			}
			const { symmetry: _drop, ...rest } = p;
			return group === undefined ? rest : { ...rest, symmetry: group };
		});
		design = join(design, { ...copy, parts }, t);
		added.push(...parts.map((p) => p.index));
	});
	return { design, added };
}

/** `planAttachAssembly` for one catalogue part. */
export function planAttach(
	state: Pick<Doc, 'design' | 'loose' | 'nextIndex'>,
	part: string,
	target: AttachTarget,
	symmetry = 1
): { design: VesselDesign; added: number[] } {
	return planAttachAssembly(state, singlePart(part, state.nextIndex), target, symmetry);
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

/** Adds a saved sub-assembly (and its symmetric copies) at `target`: one undo step. */
export function attachAssembly(
	state: EditorState,
	content: Content,
	assembly: VesselDesign,
	target: AttachTarget,
	symmetry = 1
): EditorState {
	const { design, added } = planAttachAssembly(
		state,
		reindex(assembly, state.nextIndex),
		target,
		symmetry
	);
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
	// A strut or fuel line with one end inside the subtree and one outside is cut, like on separation
	// in flight (ADR 0071): it goes with neither (the part it hangs on keeps no stub, and a moved
	// subtree leaves its connectors to the outside behind).
	const cut = new Set<number>();
	for (const p of from.parts) {
		if (gone.has(p.index) && p.link && !gone.has(p.link.index)) {
			for (const i of subtreeOf(from, p.index)) cut.add(i);
		}
	}
	const assembly: VesselDesign = {
		...emptyDesign('loose'),
		parts: from.parts
			.filter((p) => gone.has(p.index) && !cut.has(p.index))
			.map((p) => (p.index === index ? { ...p, parent: null } : p))
	};
	if (inDesign) return { design: removePart(from, index), loose: state.loose, assembly };
	const away = withDanglingLinks(from, gone);
	const rest = { ...from, parts: from.parts.filter((p) => !away.has(p.index)) };
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

// --- symmetric groups: move and turn -----------------------------------------------------------

const TAU = 2 * Math.PI;
/** Angle wrapped to (-pi, pi]. */
const wrapAngle = (a: number): number => {
	const w = a - TAU * Math.floor((a + Math.PI) / TAU);
	return w <= -Math.PI + 1e-12 ? Math.PI : w;
};

/** The radial link of a part of the design: its parent, azimuth and height; null for stack parts and loose parts. */
export function radialOf(
	design: Pick<VesselDesign, 'parts'>,
	index: number
): { parent: number; angle: number; y: number } | null {
	const link = design.parts.find((p) => p.index === index)?.parent;
	return link?.radial ? { parent: link.index, angle: link.radial.angle, y: link.radial.y } : null;
}

/** Tangential width of a radial part (its footprint on the parent's surface), metres. */
function widthOf(def: PartDefinition | undefined): number {
	const shape = def?.shape;
	if (!shape) return 0.5;
	return shape.kind === 'cylinder' ? shape.radius * 2 : Math.min(shape.size[0], shape.size[2]);
}
const heightOfShape = (def: PartDefinition | undefined): number =>
	!def?.shape ? 0.5 : def.shape.kind === 'cylinder' ? def.shape.height : def.shape.size[1];

/**
 * Throws when two radial parts of one parent would overlap on its surface: closer than the sum of
 * their half widths along the arc and of their half heights along the axis. A coarse footprint
 * check; the exact-site check of `resolveVesselDesign` still applies.
 */
function assertRadialClear(design: VesselDesign, content: Content): void {
	const radials = design.parts.filter((p) => p.parent?.radial);
	for (let i = 0; i < radials.length; i++) {
		for (let j = i + 1; j < radials.length; j++) {
			const a = radials[i]!;
			const b = radials[j]!;
			if (a.parent!.index !== b.parent!.index) continue;
			const parent = design.parts.find((p) => p.index === a.parent!.index);
			const shape = parent && content.parts.get(parent.part)?.shape;
			if (shape?.kind !== 'cylinder') continue;
			const da = content.parts.get(a.part);
			const db = content.parts.get(b.part);
			const arc =
				Math.abs(wrapAngle(a.parent!.radial!.angle - b.parent!.radial!.angle)) * shape.radius;
			const dy = Math.abs(a.parent!.radial!.y - b.parent!.radial!.y);
			const near = (widthOf(da) + widthOf(db)) / 2;
			const tall = (heightOfShape(da) + heightOfShape(db)) / 2;
			if (arc < near - 1e-6 && dy < tall - 1e-6) {
				throw new Error(
					`${da?.title ?? a.part} and ${db?.title ?? b.part} would overlap on the same part`
				);
			}
		}
	}
}

/**
 * Members of the group of `index` that take part in a group operation: the group in the design
 * when `index` has a radial link, else just `index`.
 */
function radialGroup(design: VesselDesign, index: number, single: boolean): number[] {
	if (single || !radialOf(design, index)) return [index];
	return groupOf(design, index).filter((i) => radialOf(design, i) !== null);
}

/**
 * Turns and raises a radial part: sets its azimuth and/or height on its parent. The whole symmetry
 * group follows by the same angle step (and the same height); with `single` only this part
 * changes and it leaves the group. One undo step. Throws (design unchanged) for a part without a
 * radial link, a spot outside the parent, an overlap or an invalid design.
 */
export function setRadial(
	state: EditorState,
	content: Content,
	index: number,
	change: { angle?: number; y?: number },
	options: { single?: boolean } = {}
): EditorState {
	const here = radialOf(state.design, index);
	if (!here) throw new Error(`part ${index} is not attached to the side of another part`);
	const dAngle = change.angle === undefined ? 0 : wrapAngle(change.angle - here.angle);
	const members = radialGroup(state.design, index, options.single === true);
	const parts = state.design.parts.map((p) => {
		if (!members.includes(p.index) || !p.parent?.radial) return p;
		const { symmetry: _keep, ...rest } = p;
		const turned = {
			...(options.single ? rest : p),
			parent: {
				...p.parent,
				radial: {
					angle: wrapAngle(p.parent.radial.angle + dAngle),
					y: change.y ?? p.parent.radial.y
				}
			}
		};
		return turned;
	});
	const design = { ...state.design, parts };
	assertResolves(design, content);
	assertRadialClear(design, content);
	return commit(state, { ...state, design }, content);
}

/** What `moveGroup` carries: the design without the group's subtrees and each one as an assembly. */
export interface CarryPlan {
	design: VesselDesign;
	loose: VesselDesign[];
	/** The subtree of the part the player picked. */
	held: VesselDesign;
	/** The other members' subtrees with their angle relative to the picked one. */
	followers: { assembly: VesselDesign; dAngle: number }[];
}

/** Takes `index` (and, for a radial part, its symmetry group) out of the document. Null when `index` does not exist. */
export function planCarry(
	state: Pick<Doc, 'design' | 'loose'>,
	index: number,
	options: { single?: boolean } = {}
): CarryPlan | null {
	const members = radialGroup(state.design, index, options.single === true);
	const base = radialOf(state.design, index);
	let cur: Pick<Doc, 'design' | 'loose'> = state;
	const taken: { index: number; assembly: VesselDesign }[] = [];
	for (const m of [index, ...members.filter((i) => i !== index)]) {
		const out = extract(cur, m);
		if (!out) {
			if (m === index) return null;
			continue;
		}
		cur = { design: out.design, loose: out.loose };
		taken.push({ index: m, assembly: out.assembly });
	}
	const [first, ...rest] = taken;
	return {
		design: cur.design,
		loose: cur.loose,
		held: first!.assembly,
		followers: rest.map((t) => ({
			assembly: t.assembly,
			dAngle: wrapAngle((radialOf(state.design, t.index)?.angle ?? 0) - (base?.angle ?? 0))
		}))
	};
}

/**
 * Moves a part and, when it has a radial link and `target` is a radial site, its whole symmetry
 * group: every member keeps its angle relative to the picked one and takes the target's height.
 * A target that is not radial (or `single`) moves only the picked part and it leaves its group.
 * One undo step.
 */
export function moveGroup(
	state: EditorState,
	content: Content,
	index: number,
	target: AttachTarget,
	options: { single?: boolean } = {}
): EditorState {
	if (options.single || !target.radial || !target.parent) {
		return moveSubtree(state, content, index, target);
	}
	const plan = planCarry(state, index);
	if (!plan) throw new Error(`no part ${index}`);
	let design = join(plan.design, plan.held, target);
	for (const f of plan.followers) {
		const angle = target.radial.angle + f.dAngle;
		const t = radialTarget(
			design,
			f.assembly,
			content.parts,
			target.parent.index,
			angle,
			target.radial.y
		);
		if (!t) throw new Error('the group does not fit there');
		design = join(design, f.assembly, t);
	}
	assertResolves(design, content);
	assertRadialClear(design, content);
	return commit(state, { ...state, design, loose: plan.loose }, content);
}

// --- tilt (ADR 0071) ---------------------------------------------------------------------------------

export const NO_TILT: DesignTilt = { x: 0, y: 0, z: 0 };

/** The tilt of a part of the design (none when it has none). */
export const tiltOf = (design: Pick<VesselDesign, 'parts'>, index: number): DesignTilt =>
	design.parts.find((p) => p.index === index)?.tilt ?? NO_TILT;

/**
 * Sets the tilt of a part about its parent's axes (rad). The whole symmetry group takes the same
 * tilt (two wings with the same tilt are mirror images, ADR 0071); with `single` only this part
 * changes and it leaves the group. A zero tilt removes the field. One undo step; throws (design
 * unchanged) when the design would not resolve.
 */
export function setTilt(
	state: EditorState,
	content: Content,
	index: number,
	tilt: DesignTilt,
	options: { single?: boolean } = {}
): EditorState {
	if (!state.design.parts.some((p) => p.index === index)) {
		throw new Error(`no part ${index} in the design`);
	}
	if (state.design.parts.find((p) => p.index === index)?.parent === null) {
		throw new Error('the root part cannot be tilted');
	}
	const members = options.single ? [index] : groupOf(state.design, index);
	const zero = tilt.x === 0 && tilt.y === 0 && tilt.z === 0;
	const parts = state.design.parts.map((p) => {
		if (!members.includes(p.index) || p.parent === null) return p;
		const { tilt: _old, symmetry: _group, ...rest } = p;
		const kept = options.single
			? rest
			: { ...rest, ...(p.symmetry === undefined ? {} : { symmetry: p.symmetry }) };
		return zero ? kept : { ...kept, tilt: { ...tilt } };
	});
	const design = { ...state.design, parts };
	assertResolves(design, content);
	return commit(state, { ...state, design }, content);
}

// --- struts and fuel lines (ADR 0071) ------------------------------------------------------------------

/** One end of a connector: a point on the surface of part `index` at azimuth `angle` and height `y` (its own frame). */
export interface ConnectorEnd {
	index: number;
	angle: number;
	y: number;
}

/** Whether `index` of `design` is a part a connector may hang on or end on (it has a surface and is not a connector). */
export function connectable(design: VesselDesign, content: Content, index: number): boolean {
	const entry = design.parts.find((p) => p.index === index);
	const def = entry && content.parts.get(entry.part);
	return def?.shape !== undefined && def.connector === undefined;
}

/** The azimuth at which `index`, or the nearest part above it that hangs on a side, sits on part `target`; null when none does. */
function angleOnTarget(design: VesselDesign, index: number, target: number): number | null {
	let at: number | null = index;
	while (at !== null) {
		const entry = design.parts.find((p) => p.index === at);
		if (entry?.parent?.radial && entry.parent.index === target) return entry.parent.radial.angle;
		at = entry?.parent?.index ?? null;
	}
	return null;
}

/**
 * The connectors one pick makes. A single pair, unless `from` is in a symmetry group of more than
 * one member: then every member gets a connector, to the single part `to` (the angle on it turns by
 * the member's own angle on it when the member hangs on it), or, when `to`'s group has as many
 * members, to the matching member in order (starting from the picked pair).
 */
export function connectorPairs(
	design: VesselDesign,
	from: ConnectorEnd,
	to: ConnectorEnd
): { from: ConnectorEnd; to: ConnectorEnd }[] {
	const sources = groupOf(design, from.index);
	const targets = groupOf(design, to.index);
	if (sources.length <= 1) return [{ from, to }];
	if (targets.length === 1) {
		const base = angleOnTarget(design, from.index, to.index);
		return sources.map((s) => {
			const own = angleOnTarget(design, s, to.index);
			const turn = base !== null && own !== null ? wrapAngle(own - base) : 0;
			return { from: { ...from, index: s }, to: { ...to, angle: wrapAngle(to.angle + turn) } };
		});
	}
	if (targets.length === sources.length) {
		const i = sources.indexOf(from.index);
		const j = targets.indexOf(to.index);
		return sources.map((s, k) => ({
			from: { ...from, index: s },
			to: {
				...to,
				index: targets[(j + ((k - i + sources.length) % sources.length)) % targets.length]!
			}
		}));
	}
	return [{ from, to }];
}

/**
 * The design with a connector part (`part` must have `connector` set) hanging on the surface of
 * `from.index` and ending on `to`, with the copies `connectorPairs` adds. Copies share a new
 * symmetry group. Throws when a part is not connectable or the design would not resolve.
 */
export function planConnector(
	state: Pick<Doc, 'design' | 'loose' | 'nextIndex'>,
	content: Content,
	part: string,
	from: ConnectorEnd,
	to: ConnectorEnd
): { design: VesselDesign; added: number[] } {
	const def = content.parts.get(part);
	if (!def?.connector) throw new Error(`"${part}" is not a connector part`);
	const node = radialNodeOf(def);
	if (!node) throw new Error(`"${part}" has no node to hang on`);
	for (const e of [from, to]) {
		if (!connectable(state.design, content, e.index)) {
			throw new Error('a strut or fuel line joins two ordinary parts, not another connector');
		}
	}
	if (from.index === to.index) throw new Error('pick two different parts');
	const pairs = connectorPairs(state.design, from, to);
	const group = pairs.length > 1 ? maxSymmetry([state.design, ...state.loose]) + 1 : undefined;
	const added: number[] = [];
	const parts = pairs.map((pair, k) => {
		const index = state.nextIndex + k;
		added.push(index);
		return {
			index,
			part: partId(part),
			parent: {
				index: pair.from.index,
				parentNode: SURFACE_NODE,
				node,
				radial: { angle: pair.from.angle, y: pair.from.y }
			},
			link: { index: pair.to.index, angle: pair.to.angle, y: pair.to.y },
			...(group === undefined ? {} : { symmetry: group })
		};
	});
	return { design: { ...state.design, parts: [...state.design.parts, ...parts] }, added };
}

/** Adds the connectors of `planConnector`; one undo step. */
export function attachConnector(
	state: EditorState,
	content: Content,
	part: string,
	from: ConnectorEnd,
	to: ConnectorEnd
): EditorState {
	const { design, added } = planConnector(state, content, part, from, to);
	assertResolves(design, content);
	return commit(state, { ...state, design, nextIndex: state.nextIndex + added.length }, content);
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
	/** Turn about the vertical axis, rad (a tilt is not in it: see `rotation`). */
	yaw: number;
	/** The part's full rotation relative to the design root's axes. */
	rotation: Quat;
	/** The part or an ancestor is tilted (ADR 0071), so `rotation` is more than `yaw`. */
	tilted: boolean;
	/** Where the part's strut or fuel line ends (connector parts), relative to the design root's origin. */
	link?: { index: number; point: Vec3 };
}

/** Position, turn and link of every part of a resolvable design relative to its root, or null when it does not resolve. */
export function layoutOf(design: VesselDesign, parts: PartLookup): Map<number, PartLayout> | null {
	if (design.parts.length === 0) return new Map();
	const r = resolveVesselDesign(design, parts);
	return r.ok
		? new Map(
				r.parts.map((p) => [
					p.index,
					{
						position: p.position,
						yaw: p.yaw,
						rotation: p.rotation,
						tilted: p.tilted,
						...(p.link ? { link: p.link } : {})
					}
				])
			)
		: null;
}

/** The placement a layout entry stands for, for the core's geometry functions. */
export const placementOf = (l: PartLayout): Placement => ({
	position: l.position,
	yaw: l.yaw,
	rotation: mat3OfQuat(l.rotation),
	tilted: l.tilted
});

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

const rootTiltOf = (assembly: VesselDesign): DesignTilt | undefined =>
	assembly.parts.find((p) => p.parent === null)?.tilt;

/**
 * The radial target for `assembly` on the side of part `parentIndex` at `angle` (rad, in the
 * parent's frame) and `y` (m from the parent's origin), or null when the parent is neither a
 * cylinder nor a box, the assembly has no horizontal node, or the spot is outside the parent.
 * Geometry is exactly `resolveVesselDesign`'s (ADR 0034, 0071).
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
	if (!childDef || !node || !layout || !surfaceSite(shape, angle)) return null;
	if (Math.abs(y) > surfaceHalfHeight(shape) + 1e-9) return null;
	const here = placementOf(layout);
	const at = placeRadial(here, shape, { angle, y }, childDef.attach![node]!, rootTiltOf(assembly));
	const point = surfacePoint(here, shape, { angle, y });
	if (!at || !point) return null;
	return {
		parent: { index: parentIndex, parentNode: SURFACE_NODE },
		node,
		radial: { angle, y },
		position: at.position,
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
	// The point in the part's own frame: the offset turned back by the part's rotation.
	const r = mat3OfQuat(layout.rotation);
	const o = [point.x - layout.position.x, point.y - layout.position.y, point.z - layout.position.z];
	const d = {
		x: r[0] * o[0]! + r[3] * o[1]! + r[6] * o[2]!,
		y: r[1] * o[0]! + r[4] * o[1]! + r[7] * o[2]!,
		z: r[2] * o[0]! + r[5] * o[1]! + r[8] * o[2]!
	};
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
				const here = placementOf(at);
				const on = mat3Apply(here.rotation, parentNode.pos);
				out.push({
					parent: { index: p.index, parentNode: pn },
					node: cn,
					position: placeStack(here, parentNode.pos, child.pos, rootTiltOf(assembly)).position,
					point: { x: at.position.x + on.x, y: at.position.y + on.y, z: at.position.z + on.z }
				});
			}
		}
	}
	if (radialNodeOf(rootDef)) {
		const childHeight = rootDef.shape?.kind === 'cylinder' ? rootDef.shape.height : 1;
		for (const p of design.parts) {
			const def = parts.get(p.part);
			const shape = def?.shape;
			// Connectors hang on parts, not on each other, and a stub is no place for a wing.
			if (!shape || def?.connector) continue;
			const height = surfaceHalfHeight(shape) * 2;
			if (height < 0.5) continue;
			const stops = [0, height / 2 - childHeight / 2, -height / 2 + childHeight / 2];
			for (const y of new Set(stops.map((v) => Math.round(v * 1000) / 1000))) {
				if (Math.abs(y) > height / 2) continue;
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
