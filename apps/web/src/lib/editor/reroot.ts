/**
 * The Root tool (plan 348, ADR 0297 point 5; plan 357, ADR 0301 point 4), as KSP's mode 4: the
 * picked part becomes the root and every link on the path between it and the old root is written
 * again from the other part's side, so every part keeps its place and turn relative to the others.
 * A stack link stays a stack link on the same two nodes (the tilt inverted, the offset carried
 * over); a radial or surface link becomes a surface link of the old parent on the old child, at the
 * point where they touched, with a tilt and an offset for the exact pose. Struts and fuel lines on
 * the path, and a new root tipped off the vertical, are refused; so is any result whose poses do
 * not come out the same (ADR 0301 point 5). Pure.
 */
import {
	DESIGN_FORMAT_VERSION,
	SURFACE_NODE,
	describeModule,
	type DesignLink,
	type PartDefinition,
	type VesselDesign
} from '@orbital/core';
import {
	poseOf,
	relativePose,
	samePose,
	stackLinkOnto,
	surfaceLinkOnto,
	type Pose,
	type SurfaceLinkFit
} from './frames';
import type { StagingContent } from './staging';
import { layoutOf } from './state';

export type RerootResult =
	| { ok: true; design: VesselDesign }
	| {
			ok: false;
			/**
			 * `connector`: a strut or fuel line is on the path; `tipped`: the part is not upright in the
			 * vessel; `separator`: a side link to turn round is the one a decoupler separates (it would
			 * no longer let go); `path`: a link on the path cannot be written the other way round.
			 */
			reason: 'missing' | 'already' | 'connector' | 'tipped' | 'separator' | 'path';
	  };

type Entry = VesselDesign['parts'][number];

export function reroot(
	design: VesselDesign,
	index: number,
	content: StagingContent
): RerootResult {
	const parts = content.parts;
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const start = byIndex.get(index);
	if (!start) return { ok: false, reason: 'missing' };
	if (start.parent === null) return { ok: false, reason: 'already' };
	const layout = layoutOf(design, parts);
	if (!layout) return { ok: false, reason: 'path' };
	// the path from the new root up to the old one
	const path: Entry[] = [];
	for (let p: Entry | undefined = start; p; p = p.parent ? byIndex.get(p.parent.index) : undefined) {
		if (p.link) return { ok: false, reason: 'connector' };
		if (p.parent) path.push(p);
	}
	const pose = (i: number): Pose => poseOf(layout.get(i)!);
	const top = pose(index);
	// a root tipped off the vessel's vertical would lay the vessel down: only a turn about it is kept
	if (Math.abs(top.rotation[4] - 1) > 1e-9) return { ok: false, reason: 'tipped' };

	const children = (i: number): Entry[] => design.parts.filter((p) => p.parent?.index === i);
	const relinked = new Map<number, Pick<Entry, 'parent' | 'tilt' | 'offset'>>();
	for (const [k, child] of path.entries()) {
		const link = child.parent!;
		const parent = byIndex.get(link.index)!;
		const childDef = parts.get(child.part);
		const parentDef = parts.get(parent.part);
		if (!childDef || !parentDef) return { ok: false, reason: 'path' };
		const childNode = childDef.attach?.[link.node];
		if (!childNode) return { ok: false, reason: 'path' };
		if (!link.radial && !link.surface && link.parentNode !== SURFACE_NODE) {
			// a stack link: the old parent now hangs on the old child by the same two nodes
			const parentNode = parentDef.attach?.[link.parentNode];
			if (!parentNode) return { ok: false, reason: 'path' };
			const fit = stackLinkOnto(pose(child.index), childNode, pose(parent.index), parentNode);
			relinked.set(parent.index, {
				parent: { index: child.index, parentNode: link.node, node: link.parentNode },
				...fit
			});
			continue;
		}
		// a radial or surface link: the old parent goes on the old child's surface where they touched,
		// by one of its own nodes that stays free. The sim separates by node name, so the old child
		// must not separate at the node it touched with, nor either part at its side surface.
		const childCuts = separatorNode(childDef, content.modules);
		const parentCuts = separatorNode(parentDef, content.modules);
		if (childCuts === link.node || childCuts === SURFACE_NODE || parentCuts === SURFACE_NODE) {
			return { ok: false, reason: 'separator' };
		}
		const above = path[k + 1];
		const taken = new Set<string>([
			// a separator's own node would start cutting the old child loose
			...(parentCuts ? [parentCuts] : []),
			// its stack children (other than this one, which now holds it) keep their nodes
			...children(parent.index)
				.filter((c) => c.index !== child.index && c.parent!.parentNode !== SURFACE_NODE)
				.map((c) => c.parent!.parentNode),
			// the node its own old parent will hang on, when that link is a stack link
			...(above && !above.parent!.radial && !above.parent!.surface ? [above.parent!.node] : [])
		]);
		let best: { node: string; fit: SurfaceLinkFit } | null = null;
		for (const [name, node] of Object.entries(parentDef.attach ?? {})) {
			if (taken.has(name)) continue;
			const fit = surfaceLinkOnto(
				pose(child.index),
				childDef.shape,
				pose(parent.index),
				node,
				childNode.pos
			);
			if (fit && (!best || cost(fit) < cost(best.fit))) best = { node: name, fit };
		}
		if (!best) return { ok: false, reason: 'path' };
		const { surface, tilt, offset } = best.fit;
		const parentLink: DesignLink = {
			index: child.index,
			parentNode: SURFACE_NODE,
			node: best.node,
			surface
		};
		relinked.set(parent.index, {
			parent: parentLink,
			...(tilt ? { tilt } : {}),
			...(offset ? { offset } : {})
		});
	}

	const next: VesselDesign = {
		...design,
		formatVersion: relinked.size > 0 ? DESIGN_FORMAT_VERSION : design.formatVersion,
		parts: design.parts.map((p) => {
			if (p.index !== index && !relinked.has(p.index)) return p;
			const { tilt: _tilt, offset: _offset, ...rest } = p;
			return p.index === index ? { ...rest, parent: null } : { ...rest, ...relinked.get(p.index)! };
		})
	};
	// every part must stand where it stood, seen from the new root
	const after = layoutOf(next, parts);
	if (!after) return { ok: false, reason: 'path' };
	for (const [i, l] of layout) {
		const now = after.get(i);
		if (!now || !samePose(poseOf(now), relativePose(poseOf(l), top))) {
			return { ok: false, reason: 'path' };
		}
	}
	return { ok: true, design: next };
}

/** The node a part's separator module cuts at, if it has one (by module descriptor, ADR 0033). */
function separatorNode(
	def: PartDefinition,
	modules: StagingContent['modules']
): string | undefined {
	for (const [id, config] of def.modules ?? []) {
		const module = modules.get(id);
		const node = module && describeModule(module, config)?.separator?.node;
		if (node) return node;
	}
	return undefined;
}

/** A surface fit without a tilt or an offset first, then the smallest offset. */
const cost = (f: SurfaceLinkFit): number =>
	(f.tilt ? 1000 : 0) + (f.offset ? Math.hypot(f.offset.x, f.offset.y, f.offset.z) : 0);
