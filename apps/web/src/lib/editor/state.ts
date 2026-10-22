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
	mat3Mul,
	mat3OfQuat,
	matAboutX,
	matAboutY,
	matAboutZ,
	tiltMatrix,
	tiltOfMatrix,
	effectiveDef,
	partId,
	placeRadial,
	placeStack,
	placeSurface,
	pointNearShape,
	rotationBetween,
	resolveVesselDesign,
	rotateY,
	surfaceHalfHeight,
	surfacePoint,
	surfaceSite,
	type DesignOffset,
	type DesignTilt,
	type Mat3,
	type PartDefinition,
	type PartLookup,
	type Placement,
	type Quat,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { emptyDesign, freeNodes, removePart, subtreeOf, withDanglingLinks } from '../design';
import { autoStages, sameStages, type StagingContent } from './staging';
import { partsOffParent } from './bounds';
import {
	mirroredAcrossAxis,
	poseOf,
	surfaceLinkOnto,
	turnedAboutAxis,
	type SurfaceLinkFit
} from './frames';

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
	/**
	 * A point and outward normal in the parent's own frame, for a surface target (plan 244, ADR 0235):
	 * a top or bottom face, a slope. `parentNode` is `"surface"`, as for a radial target.
	 */
	surface?: { point: [number, number, number]; normal: [number, number, number] };
	/** Node of the attaching part used for the link. */
	node: string;
	/**
	 * The turn that makes the attaching part's node face a sideways node (a hub's side port, plan
	 * 308): written as the part's tilt when it attaches.
	 */
	tilt?: DesignTilt;
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
	const pruned = pruneGroups(next.design);
	const design = next.autoStage
		? {
				...pruned,
				stages: pruned.parts.length > 0 ? autoStages(pruned, content) : []
			}
		: pruned;
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

/** An aircraft starts level on a runway (plan 063, ADR 0161 point 3); like the name, not an undo step. */
export function setAircraft(s: EditorState, on: boolean): EditorState {
	const { aircraft: _drop, ...rest } = s.design;
	return { ...s, design: on ? { ...rest, aircraft: true } : rest };
}

/** Free placement (plan 279, ADR 0258 point 4): moved parts may leave their parent; like the name, not an undo step. */
export function setFreePlacement(s: EditorState, on: boolean): EditorState {
	const { freePlacement: _drop, ...rest } = s.design;
	return { ...s, design: on ? { ...rest, freePlacement: true } : rest };
}

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
	const link: VesselDesign['parts'][number]['parent'] = target.parent
		? {
				index: target.parent.index,
				parentNode: target.parent.parentNode,
				node: target.node,
				...(target.radial ? { radial: { ...target.radial } } : {}),
				...(target.surface
					? {
							surface: {
								point: [...target.surface.point] as [number, number, number],
								normal: [...target.surface.normal] as [number, number, number]
							}
						}
					: {})
			}
		: null;
	// a new attach point starts the part without an offset (plan 279): the offset belonged to the old one
	const parts = assembly.parts.map((p) => {
		if (p.index !== root) return p;
		const { offset: _old, ...rest } = p;
		return { ...rest, parent: link, ...(target.tilt ? { tilt: { ...target.tilt } } : {}) };
	});
	if (design.parts.length === 0) {
		if (target.parent !== null) throw new Error('an empty design can only take a root part');
		return { ...design, parts };
	}
	if (target.parent === null) throw new Error('a design with parts needs a parent to attach to');
	return { ...design, parts: [...design.parts, ...parts] };
}

/**
 * The design without custom group members or seated crew on parts it no longer holds (deleted or
 * detached; plan 218): an emptied group leaves.
 */
export function pruneGroups(design: VesselDesign): VesselDesign {
	if (!design.groups && !design.crew) return design;
	const here = new Set(design.parts.map((p) => p.index));
	const groupsOk = (design.groups ?? []).every((g) => g.members.every((m) => here.has(m.part)));
	const crewOk = (design.crew ?? []).every((c) => here.has(c.part));
	if (groupsOk && crewOk) return design;
	const groups = (design.groups ?? [])
		.map((g) => ({ ...g, members: g.members.filter((m) => here.has(m.part)) }))
		.filter((g) => g.members.length > 0);
	const crew = (design.crew ?? []).filter((c) => here.has(c.part));
	const { groups: _g, crew: _c, ...rest } = design;
	return {
		...rest,
		...(groups.length > 0 ? { groups } : {}),
		...(crew.length > 0 ? { crew } : {})
	};
}

function assertResolves(design: VesselDesign, content: Content): void {
	const r = resolveVesselDesign(pruneGroups(design), content.parts);
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

/** Symmetry counts the VAB offers, ordered (plan 217: 1 to 8). */
export const SYMMETRY_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** A symmetry setting: a count around the parent, or a mirror pair across the vessel's YZ plane. */
export interface SymmetrySpec {
	count: number;
	mirror?: boolean;
	/**
	 * What the copies turn about (plan 357, ADR 0301 point 1): the parent's vertical axis (default),
	 * or the vessel's, the root's vertical axis (a mirror: the parent's or the root's YZ plane).
	 */
	pivot?: SymmetryPivot;
}

export type SymmetryPivot = 'parent' | 'vessel';

const specOf = (s: number | SymmetrySpec): SymmetrySpec =>
	typeof s === 'number' ? { count: s } : s;

/** Azimuth reflected across the vessel's YZ plane (`azimuthOf` is `atan2(-z, x)`): x goes to -x. */
const mirrorAngle = (a: number): number => wrapAngle(Math.PI - a);

type Surface = NonNullable<AttachTarget['surface']>;
const turnedAbout = (v: readonly [number, number, number], a: number): [number, number, number] => {
	const r = rotateY(v, a);
	return [r.x, r.y, r.z];
};
/** A surface site turned about the parent's vertical axis, or reflected across its YZ (`x`) or XY (`z`) plane. */
const turnSurface = (s: Surface, a: number): Surface => ({
	point: turnedAbout(s.point, a),
	normal: turnedAbout(s.normal, a)
});
const reflectSurface = (s: Surface, axis: 'x' | 'z'): Surface => {
	const flip = (v: [number, number, number]): [number, number, number] =>
		axis === 'x' ? [-v[0], v[1], v[2]] : [v[0], v[1], -v[2]];
	return { point: flip(s.point), normal: flip(s.normal) };
};
/** A target reflected for the mirrored member of a mirror pair (inherited symmetry): azimuth negated. */
const reflectedInMember = (t: AttachTarget): AttachTarget =>
	t.radial
		? { ...t, radial: { angle: wrapAngle(-t.radial.angle), y: t.radial.y } }
		: t.surface
			? { ...t, surface: reflectSurface(t.surface, 'z') }
			: t;
/** A target for the other half of a mirror pair: across the vessel's YZ plane. */
const mirroredTarget = (t: AttachTarget): AttachTarget =>
	t.radial
		? { ...t, radial: { angle: mirrorAngle(t.radial.angle), y: t.radial.y } }
		: t.surface
			? { ...t, surface: reflectSurface(t.surface, 'x') }
			: t;
/** A target turned about its parent's vertical axis by `a`. */
const turnedTarget = (t: AttachTarget, a: number): AttachTarget =>
	t.radial
		? { ...t, radial: { angle: t.radial.angle + a, y: t.radial.y } }
		: t.surface
			? { ...t, surface: turnSurface(t.surface, a) }
			: t;

/** A tilt reflected with its part across that plane: the turns about the outward and up axes flip. */
const mirrorTilt = (t: DesignTilt | undefined): DesignTilt | undefined =>
	t && (t.x !== 0 || t.y !== 0) ? { x: -t.x, y: -t.y, z: t.z } : t;

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
	symmetry: number | SymmetrySpec = 1,
	parts?: PartLookup
): { design: VesselDesign; added: number[] } {
	const spec = specOf(symmetry);
	const base = state.nextIndex;
	/** Each copy's target, whether it is the mirrored one of a mirror pair, and a root tilt that replaces the assembly's. */
	const targets: CopyTarget[] = [];
	const parentGroup = target.parent ? groupOf(state.design, target.parent.index) : [];
	const mirroredParent = (m: number): boolean =>
		state.design.parts.find((p) => p.index === m)?.mirror === true;
	const onSurface = target.radial !== undefined || target.surface !== undefined;
	const aboutVessel =
		spec.pivot === 'vessel' &&
		parts &&
		target.parent &&
		onSurface &&
		parentGroup.length <= 1 &&
		(spec.mirror || spec.count > 1)
			? vesselCopies(state.design, assembly, target, spec, parts, base)
			: null;
	if (aboutVessel) {
		targets.push(...aboutVessel);
	} else if (target.parent && onSurface && parentGroup.length > 1) {
		// inherited symmetry (ADR 0207 point 2): one copy on every member of the parent's group, at
		// the same spot in each member's frame (reflected on the mirrored member of a mirror pair)
		for (const m of parentGroup) {
			const mirrored = mirroredParent(m);
			const here: AttachTarget = {
				...target,
				parent: { index: m, parentNode: target.parent.parentNode }
			};
			targets.push({ target: mirrored ? reflectedInMember(here) : here, mirrored });
		}
	} else if (target.parent && onSurface && spec.mirror) {
		targets.push({ target, mirrored: false });
		targets.push({ target: mirroredTarget(target), mirrored: true });
	} else if (target.parent && onSurface && spec.count > 1) {
		for (let k = 0; k < spec.count; k++) {
			targets.push({
				target: turnedTarget(target, (2 * Math.PI * k) / spec.count),
				mirrored: false
			});
		}
	} else if (target.parent && !onSurface) {
		const used = (m: number): boolean =>
			state.design.parts.some(
				(p) => p.parent?.index === m && p.parent.parentNode === target.parent!.parentNode
			);
		if (parentGroup.length > 1 && !parentGroup.some(used)) {
			for (const m of parentGroup) {
				targets.push({
					target: { ...target, parent: { index: m, parentNode: target.parent.parentNode } },
					mirrored: mirroredParent(m)
				});
			}
		}
	}
	if (targets.length === 0) targets.push({ target, mirrored: false });
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
	targets.forEach(({ target: t, mirrored, rootTilt }, k) => {
		const copy = reindex(assembly, base + k * size);
		const own = new Map<number, number>();
		const copyRoot = rootOf(copy);
		const parts = copy.parts.map((p, j) => {
			const old = sorted[j]!;
			let group: number | undefined;
			if (old.symmetry !== undefined) {
				if (!own.has(old.symmetry)) own.set(old.symmetry, nextGroup++);
				group = own.get(old.symmetry);
			} else {
				group = shared.get(old.index);
			}
			const { symmetry: _drop, mirror: _was, tilt, ...rest } = p;
			const turned =
				rootTilt !== undefined && p.index === copyRoot
					? (rootTilt ?? undefined)
					: mirrored
						? mirrorTilt(tilt)
						: tilt;
			return {
				...rest,
				...(turned ? { tilt: turned } : {}),
				...(group === undefined ? {} : { symmetry: group }),
				...(mirrored && group !== undefined ? { mirror: true as const } : {})
			};
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
	symmetry: number | SymmetrySpec = 1,
	parts?: PartLookup
): { design: VesselDesign; added: number[] } {
	return planAttachAssembly(state, singlePart(part, state.nextIndex), target, symmetry, parts);
}

/** One copy of a placement: where it goes; `rootTilt` (null: none) replaces the assembly root's tilt. */
interface CopyTarget {
	target: AttachTarget;
	mirrored: boolean;
	rootTilt?: DesignTilt | null;
}

/**
 * The copies of a placement about the vessel's axis (plan 357, ADR 0301 point 2): the first copy
 * as `target` gives it, each other one that pose turned about the root's vertical axis (or
 * reflected across the root's YZ plane), hung by a surface link on the vessel part its attach
 * node touches (the nearest surface); a copy that touches nothing is left out. Null when the
 * parent stands on the vessel axis (the parent pivot gives the same copies) or nothing resolves.
 */
function vesselCopies(
	design: VesselDesign,
	assembly: VesselDesign,
	target: AttachTarget,
	spec: SymmetrySpec,
	parts: PartLookup,
	base: number
): CopyTarget[] | null {
	const before = layoutOf(design, parts);
	const parentAt = target.parent && before?.get(target.parent.index);
	if (!before || !parentAt) return null;
	const pp = poseOf(parentAt);
	const r = pp.rotation;
	const onAxis =
		Math.hypot(pp.position.x, pp.position.z) < 1e-6 &&
		Math.abs(r[4] - 1) < 1e-9 &&
		(!spec.mirror || Math.abs(Math.abs(r[0]) - 1) < 1e-9);
	if (onAxis) return null;
	const first = reindex(assembly, base);
	const root = rootOf(first);
	const at = layoutOf(join(design, first, target), parts)?.get(root);
	const node = parts.get(first.parts.find((p) => p.index === root)!.part)?.attach?.[target.node];
	if (!at || !node) return null;
	const start = poseOf(at);
	const poses = spec.mirror
		? [{ pose: mirroredAcrossAxis(start, node.dir), mirrored: true }]
		: Array.from({ length: spec.count - 1 }, (_, k) => ({
				pose: turnedAboutAxis(start, (2 * Math.PI * (k + 1)) / spec.count),
				mirrored: false
			}));
	const out: CopyTarget[] = [{ target, mirrored: false }];
	for (const { pose, mirrored } of poses) {
		let best: { index: number; fit: SurfaceLinkFit } | null = null;
		for (const p of design.parts) {
			const l = before.get(p.index);
			const fit = l && surfaceLinkOnto(poseOf(l), parts.get(p.part)?.shape, pose, node);
			if (fit && (!best || Math.abs(fit.gap) < Math.abs(best.fit.gap))) best = { index: p.index, fit };
		}
		if (!best) continue;
		const touch = mat3Apply(pose.rotation, node.pos);
		out.push({
			target: {
				parent: { index: best.index, parentNode: SURFACE_NODE },
				surface: best.fit.surface,
				node: target.node,
				position: pose.position,
				point: {
					x: pose.position.x + touch.x,
					y: pose.position.y + touch.y,
					z: pose.position.z + touch.z
				}
			},
			mirrored,
			rootTilt: best.fit.tilt ?? null
		});
	}
	return out;
}

/** Adds a catalogue part (and its symmetric copies). Throws when `target` is not one of `attachTargets` (callers pick from that list). */
export function attachNew(
	state: EditorState,
	content: Content,
	part: string,
	target: AttachTarget,
	symmetry: number | SymmetrySpec = 1
): EditorState {
	if (!content.parts.get(part)) throw new Error(`unknown part "${part}"`);
	const { design, added } = planAttach(state, part, target, symmetry, content.parts);
	assertResolves(design, content);
	return commit(state, { ...state, design, nextIndex: state.nextIndex + added.length }, content);
}

/** Adds a saved sub-assembly (and its symmetric copies) at `target`: one undo step. */
export function attachAssembly(
	state: EditorState,
	content: Content,
	assembly: VesselDesign,
	target: AttachTarget,
	symmetry: number | SymmetrySpec = 1
): EditorState {
	const { design, added } = planAttachAssembly(
		state,
		reindex(assembly, state.nextIndex),
		target,
		symmetry,
		content.parts
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

/**
 * A copy of the subtree under `index` to carry (Alt-click, plan 217): its parts keep their tilts and
 * the symmetry groups inside it; the root leaves the group it is in. Null when `index` does not
 * exist. The state is unchanged; `attachAssembly` places the copy as one undo step.
 */
export function copyOf(state: Pick<Doc, 'design' | 'loose'>, index: number): VesselDesign | null {
	const out = extract(state, index);
	if (!out) return null;
	return {
		...out.assembly,
		parts: out.assembly.parts.map((p) => {
			if (p.index !== index) return p;
			const { symmetry: _group, mirror: _mirror, ...rest } = p;
			return rest;
		})
	};
}

/** The assembly with its root's tilt set (none for a zero tilt): a carried part turned by the keys. */
export function withRootTilt(assembly: VesselDesign, tilt: DesignTilt | undefined): VesselDesign {
	const root = rootOf(assembly);
	const zero = !tilt || (tilt.x === 0 && tilt.y === 0 && tilt.z === 0);
	return {
		...assembly,
		parts: assembly.parts.map((p) => {
			if (p.index !== root) return p;
			const { tilt: _old, ...rest } = p;
			return zero ? rest : { ...rest, tilt: { ...tilt! } };
		})
	};
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
	target: AttachTarget,
	options: { tilt?: DesignTilt } = {}
): EditorState {
	const out = extract(state, index);
	if (!out) throw new Error(`no part ${index}`);
	// A part moved on its own leaves its symmetry group.
	const parts = out.assembly.parts.map(({ symmetry: _group, mirror: _mirror, ...p }) => p);
	const alone: VesselDesign =
		options.tilt === undefined
			? { ...out.assembly, parts }
			: withRootTilt({ ...out.assembly, parts }, options.tilt);
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
	options: { single?: boolean; tilt?: DesignTilt } = {}
): EditorState {
	if (options.single || !target.radial || !target.parent) {
		return moveSubtree(state, content, index, target, { tilt: options.tilt });
	}
	const plan = planCarry(state, index);
	if (!plan) throw new Error(`no part ${index}`);
	const held = options.tilt === undefined ? plan.held : withRootTilt(plan.held, options.tilt);
	let design = join(plan.design, held, target);
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

// --- per-part settings (plan 219, ADR 0224) -----------------------------------------------------------

/**
 * Sets one module's per-part settings on a part of the design (a fairing's sections): `null`
 * removes them. One undo step; throws (design unchanged) when the design would not resolve.
 */
export function setPartSettings(
	state: EditorState,
	content: Content,
	index: number,
	module: string,
	settings: Record<string, unknown> | null
): EditorState {
	if (!state.design.parts.some((p) => p.index === index)) throw new Error(`no part ${index}`);
	const parts = state.design.parts.map((p) => {
		if (p.index !== index) return p;
		const { settings: old, ...rest } = p;
		const next = { ...(old ?? {}) };
		if (settings === null) delete next[module];
		else next[module] = settings;
		return Object.keys(next).length > 0 ? { ...rest, settings: next } : rest;
	});
	const design = { ...state.design, parts };
	assertResolves(design, content);
	return commit(state, { ...state, design }, content);
}

/** Puts `design` in as one undo step (plan 218's settings and groups edits); throws when it would not resolve. */
export function commitDesign(
	state: EditorState,
	content: Content,
	design: VesselDesign
): EditorState {
	assertResolves(design, content);
	return commit(state, { ...state, design }, content);
}

// --- tilt (ADR 0071) ---------------------------------------------------------------------------------

export const NO_TILT: DesignTilt = { x: 0, y: 0, z: 0 };

/** The tilt of a part of the design (none when it has none). */
export const tiltOf = (design: Pick<VesselDesign, 'parts'>, index: number): DesignTilt =>
	design.parts.find((p) => p.index === index)?.tilt ?? NO_TILT;

/** The offset of a part of the design (none when it has none). */
export const offsetOf = (design: Pick<VesselDesign, 'parts'>, index: number): DesignOffset =>
	design.parts.find((p) => p.index === index)?.offset ?? NO_OFFSET;

export const NO_OFFSET: DesignOffset = { x: 0, y: 0, z: 0 };

/** Azimuth of a part's site on its parent (radial or surface link), for group copies; null for a stack link. */
function siteAzimuth(link: VesselDesign['parts'][number]['parent']): number | null {
	if (link?.radial) return link.radial.angle;
	if (link?.surface) {
		const [x, , z] = link.surface.point;
		if (Math.hypot(x, z) > 1e-6) return azimuthOf([x, 0, z]);
		const [nx, , nz] = link.surface.normal;
		return Math.hypot(nx, nz) > 1e-6 ? azimuthOf([nx, 0, nz]) : 0;
	}
	return null;
}

/** Rounds away float noise (1e-9) so a nudged value saves as written. */
const clean = (v: number): number => {
	const r = Math.round(v * 1e9) / 1e9;
	return r === 0 ? 0 : r;
};

const isZero = (v: { x: number; y: number; z: number }): boolean =>
	v.x === 0 && v.y === 0 && v.z === 0;

/**
 * How a change of part `from` carries over to member `to` of its symmetry group (plan 279, ADR
 * 0071's rule): the offset turned by the members' angle on a shared parent, or reflected for the
 * other half of a mirror pair (across the vessel's YZ plane on a shared parent, across the parent's
 * XY plane for an inherited copy); the tilt the same, reflected (`mirrorTilt`) for the other half of
 * a mirror pair.
 */
export function memberTransform(
	design: Pick<VesselDesign, 'parts'>,
	from: number,
	to: number
): { offset: (o: DesignOffset) => DesignOffset; tilt: (t: DesignTilt) => DesignTilt } {
	const a = design.parts.find((p) => p.index === from);
	const b = design.parts.find((p) => p.index === to);
	if (!a || !b || from === to) return { offset: (o) => o, tilt: (t) => t };
	const mirrored = (a.mirror === true) !== (b.mirror === true);
	const tilt = (t: DesignTilt): DesignTilt => (mirrored ? (mirrorTilt(t) ?? t) : t);
	const shared = a.parent?.index === b.parent?.index;
	if (mirrored) {
		return {
			offset: (o) => (shared ? { x: -o.x, y: o.y, z: o.z } : { x: o.x, y: o.y, z: -o.z }),
			tilt
		};
	}
	const za = siteAzimuth(a.parent);
	const zb = siteAzimuth(b.parent);
	if (!shared || za === null || zb === null) return { offset: (o) => o, tilt };
	const turn = zb - za;
	return {
		offset: (o) => {
			const r = rotateY([o.x, o.y, o.z], turn);
			return { x: clean(r.x), y: clean(r.y), z: clean(r.z) };
		},
		tilt
	};
}

/**
 * Sets the offset (m, the parent's axes, version 4) and/or the tilt (rad, ADR 0071) of a part of
 * the design (plan 279, ADR 0258). The whole symmetry group follows as mirror images
 * (`memberTransform`); with `single` only this part changes and it leaves the group. A zero value
 * removes the field. Unless the design is in free placement, a part with an offset must still touch
 * its parent's collider enlarged by 0.25 m (`partsOffParent`). One undo step; throws (design
 * unchanged) for the root, an unknown part, a part off its parent or a design that would not resolve.
 */
export function setPlacement(
	state: EditorState,
	content: Content,
	index: number,
	change: { offset?: DesignOffset; tilt?: DesignTilt },
	options: { single?: boolean } = {}
): EditorState {
	const entry = state.design.parts.find((p) => p.index === index);
	if (!entry) throw new Error(`no part ${index} in the design`);
	if (entry.parent === null) {
		throw new Error(
			change.offset
				? 'the root part does not move: it is the vessel'
				: 'the root part cannot be tilted'
		);
	}
	const members = options.single ? [index] : groupOf(state.design, index);
	const moved: number[] = [];
	const parts = state.design.parts.map((p) => {
		if (!members.includes(p.index) || p.parent === null) return p;
		const map = memberTransform(state.design, index, p.index);
		const { tilt: oldTilt, offset: oldOffset, symmetry: _group, mirror: _mirror, ...rest } = p;
		const kept = options.single
			? rest
			: {
					...rest,
					...(p.symmetry === undefined ? {} : { symmetry: p.symmetry }),
					...(p.mirror ? { mirror: true as const } : {})
				};
		const tilt = change.tilt ? map.tilt(change.tilt) : oldTilt;
		const offset = change.offset ? map.offset(change.offset) : oldOffset;
		if (offset && !isZero(offset)) moved.push(p.index);
		return {
			...kept,
			...(tilt && !isZero(tilt) ? { tilt: { ...tilt } } : {}),
			...(offset && !isZero(offset) ? { offset: { ...offset } } : {})
		};
	});
	const design: VesselDesign = {
		...state.design,
		formatVersion: moved.length > 0 ? 4 : state.design.formatVersion,
		parts
	};
	assertResolves(design, content);
	if (!design.freePlacement && moved.length > 0) {
		if (partsOffParent(design, content.parts, undefined, moved).length > 0) {
			throw new Error(
				'that is too far from the part it hangs on: turn on Free mode to place parts anywhere'
			);
		}
	}
	return commit(state, { ...state, design }, content);
}

/**
 * Sets the tilt of a part about its parent's axes (rad), any angle (plan 279). The whole symmetry
 * group follows (`setPlacement`); with `single` only this part changes and it leaves the group. A
 * zero tilt removes the field. One undo step; throws (design unchanged) when the design would not
 * resolve.
 */
export function setTilt(
	state: EditorState,
	content: Content,
	index: number,
	tilt: DesignTilt,
	options: { single?: boolean } = {}
): EditorState {
	return setPlacement(state, content, index, { tilt }, options);
}

const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const IDENTITY3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The rotations of part `index` and of its parent relative to the design root. */
function framesOf(
	design: VesselDesign,
	parts: PartLookup,
	index: number
): { part: Mat3; parent: Mat3 } | null {
	const entry = design.parts.find((p) => p.index === index);
	if (!entry?.parent) return null;
	const layout = layoutOf(design, parts);
	const here = layout?.get(index);
	if (!here) return null;
	const there = layout!.get(entry.parent.index);
	return {
		part: mat3OfQuat(here.rotation),
		parent: there ? mat3OfQuat(there.rotation) : IDENTITY3
	};
}

/**
 * The offset of part `index` after a nudge by `delta` metres (plan 279): along the part's own axes
 * (`local`) or the vessel's (`absolute`), turned into the parent's axes the offset is kept in. Null
 * for the root, a loose part or a design that does not resolve.
 */
export function nudgedOffset(
	design: VesselDesign,
	parts: PartLookup,
	index: number,
	delta: readonly [number, number, number],
	frame: 'local' | 'absolute'
): DesignOffset | null {
	const f = framesOf(design, parts, index);
	if (!f) return null;
	const world =
		frame === 'local' ? mat3Apply(f.part, delta) : { x: delta[0], y: delta[1], z: delta[2] };
	const d = mat3Apply(transpose(f.parent), [world.x, world.y, world.z]);
	const o = offsetOf(design, index);
	return { x: clean(o.x + d.x), y: clean(o.y + d.y), z: clean(o.z + d.z) };
}

/**
 * The tilt of part `index` after a turn by `angle` rad about axis `axis` (plan 279): the part's own
 * axis (`local`) or the vessel's (`absolute`), pivoting about the attach point. The part's rotation
 * is `P T F` (parent, tilt, the attach turn), so the new tilt is `P^-1 B P T` with `B` the turn in
 * the vessel's axes. Null for the root, a loose part or a design that does not resolve.
 */
export function turnedTilt(
	design: VesselDesign,
	parts: PartLookup,
	index: number,
	axis: 'x' | 'y' | 'z',
	angle: number,
	frame: 'local' | 'absolute'
): DesignTilt | null {
	const f = framesOf(design, parts, index);
	if (!f) return null;
	const about =
		axis === 'x' ? matAboutX(angle) : axis === 'y' ? matAboutY(angle) : matAboutZ(angle);
	const turn = frame === 'local' ? mat3Mul(f.part, mat3Mul(about, transpose(f.part))) : about;
	const t = tiltMatrix(tiltOf(design, index));
	const out = tiltOfMatrix(mat3Mul(transpose(f.parent), mat3Mul(turn, mat3Mul(f.parent, t))));
	return { x: clean(out.x), y: clean(out.y), z: clean(out.z) };
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

/**
 * The surface target for `assembly` on part `parentIndex` at a pointer hit (plan 244, ADR 0235):
 * `hit.point` and `hit.normal` are in the design's frame. The assembly's root attaches by the node
 * best facing the surface (the one whose direction is closest to the opposite of the normal), which
 * turns it to lie against the face: a tank stands on a top face, a fin lies on a cone's slope.
 * Null when the parent has no shape, is a connector, the point is not on the parent, or the
 * assembly has no node. Geometry is exactly `resolveVesselDesign`'s.
 */
export function surfaceTarget(
	design: VesselDesign,
	assembly: VesselDesign,
	parts: PartLookup,
	parentIndex: number,
	hit: { point: Vec3; normal: readonly [number, number, number] }
): AttachTarget | null {
	const childDef = rootDefOf(assembly, parts);
	const entry = design.parts.find((p) => p.index === parentIndex);
	const parentDef = entry && parts.get(entry.part);
	const layout = layoutOf(design, parts)?.get(parentIndex);
	if (!childDef?.attach || !layout || !parentDef?.shape || parentDef.connector) return null;
	if (childDef.connector) return null;
	const r = mat3OfQuat(layout.rotation);
	const local = (v: readonly [number, number, number]): [number, number, number] => [
		r[0] * v[0] + r[3] * v[1] + r[6] * v[2],
		r[1] * v[0] + r[4] * v[1] + r[7] * v[2],
		r[2] * v[0] + r[5] * v[1] + r[8] * v[2]
	];
	const round = (v: readonly [number, number, number]): [number, number, number] => [
		Math.round(v[0] * 1e4) / 1e4,
		Math.round(v[1] * 1e4) / 1e4,
		Math.round(v[2] * 1e4) / 1e4
	];
	const point = round(
		local([
			hit.point.x - layout.position.x,
			hit.point.y - layout.position.y,
			hit.point.z - layout.position.z
		])
	);
	if (!(Math.hypot(...hit.normal) > 1e-9)) return null;
	const normal = round(unit(local(hit.normal)));
	if (!pointNearShape(parentDef.shape, point)) return null;
	// the node facing the surface best: the largest dot of its direction with the inward normal
	let node: string | null = null;
	let best = -Infinity;
	for (const name of Object.keys(childDef.attach).sort()) {
		const d = unit(childDef.attach[name]!.dir);
		const score = -dot(d, normal) + (name === 'bottom' ? 1e-6 : 0);
		if (score > best) {
			best = score;
			node = name;
		}
	}
	if (node === null) return null;
	const here = placementOf(layout);
	const at = placeSurface(here, { point, normal }, childDef.attach[node]!, rootTiltOf(assembly));
	if (!at) return null;
	const on = mat3Apply(here.rotation, point);
	return {
		parent: { index: parentIndex, parentNode: SURFACE_NODE },
		node,
		surface: { point, normal },
		position: at.position,
		point: { x: here.position.x + on.x, y: here.position.y + on.y, z: here.position.z + on.z }
	};
}

/**
 * Whether a pointer hit (design frame) on part `parentIndex` lies on the side of its collider shape
 * (within `tolerance` m of the cylinder's or box's side), where a radial site puts a part on what
 * the player sees (plan 279). A hit on a pod's slope or a nose cone inside its collider is not: a
 * surface link at the hit point puts the part on the visible face instead.
 */
export function onShapeSide(
	design: VesselDesign,
	parts: PartLookup,
	parentIndex: number,
	point: Vec3,
	tolerance = 0.03
): boolean {
	const entry = design.parts.find((p) => p.index === parentIndex);
	const shape = entry && parts.get(entry.part)?.shape;
	const layout = layoutOf(design, parts)?.get(parentIndex);
	if (!shape || !layout) return false;
	const r = mat3OfQuat(layout.rotation);
	const o = [point.x - layout.position.x, point.y - layout.position.y, point.z - layout.position.z];
	const x = r[0] * o[0]! + r[3] * o[1]! + r[6] * o[2]!;
	const z = r[2] * o[0]! + r[5] * o[1]! + r[8] * o[2]!;
	const site = surfaceSite(shape, azimuthOf([x, 0, z]));
	return site !== undefined && Math.abs(Math.hypot(x, z) - site.radius) <= tolerance;
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
	// parent nodes where a docking face meets a docking face (ADR 0300): only that match is offered
	const flips = new Set<string>();
	const flipped = new Set<AttachTarget>();
	for (const p of design.parts) {
		const raw = parts.get(p.part);
		const def = raw && effectiveDef(raw, p.settings);
		const at = placed.get(p.index);
		if (!def?.attach || !at) continue;
		for (const pn of freeNodes(design, parts, p.index)) {
			const parentNode = def.attach[pn]!;
			for (const cn of mine) {
				const child = rootDef.attach?.[cn];
				if (!child) continue;
				// a node at right angles to this one (a hub's side port): turn the part onto it (plan
				// 308), unless the picked part carries a tilt of its own; never flip a part over but onto a
				// docking face
				let tilt = rootTiltOf(assembly);
				let turn: DesignTilt | undefined;
				const facing = dot(unit(parentNode.dir), unit(child.dir));
				// a docking face onto a docking face: the part turns (over, or onto its side) so the
				// faces meet, a payload built docked (plan 356, ADR 0300)
				const flip =
					facing > -1 + 1e-6 && !tilt && parentNode.face === 'docking' && child.face === 'docking';
				if (flip) {
					const to = unit(parentNode.dir);
					turn = tiltOfMatrix(rotationBetween(unit(child.dir), [-to[0], -to[1], -to[2]]));
					tilt = turn;
				} else if (facing > -1 + 1e-6) {
					if (tilt || Math.abs(facing) > 1e-6) continue;
					const from = unit(child.dir);
					const to = unit(parentNode.dir);
					turn = tiltOfMatrix(rotationBetween(from, [-to[0], -to[1], -to[2]]));
					tilt = turn;
				}
				const here = placementOf(at);
				const on = mat3Apply(here.rotation, parentNode.pos);
				const target: AttachTarget = {
					parent: { index: p.index, parentNode: pn },
					node: cn,
					...(turn ? { tilt: turn } : {}),
					position: placeStack(here, parentNode.pos, child.pos, tilt).position,
					point: { x: at.position.x + on.x, y: at.position.y + on.y, z: at.position.z + on.z }
				};
				if (flip) {
					flips.add(`${p.index}:${pn}`);
					flipped.add(target);
				}
				out.push(target);
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
	// a turned match is a fallback: a node that something fits straight onto offers only that
	const straight = new Set(
		out.filter((t) => !t.tilt).map((t) => `${t.parent!.index}:${t.parent!.parentNode}`)
	);
	return out
		.filter((t) => {
			const key = `${t.parent?.index}:${t.parent?.parentNode}`;
			if (t.parent && flips.has(key)) return flipped.has(t);
			return !t.tilt || !straight.has(key);
		})
		.sort(
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
