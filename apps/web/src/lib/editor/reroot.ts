/**
 * The Root tool (plan 348, ADR 0297 point 5), as KSP's mode 4: the picked part becomes the root and
 * every link on the path between it and the old root is turned over. Only node-to-node links may
 * be on that path (no radial or surface link, no tilt or offset), since those are kept in the
 * parent's frame and cannot simply swap ends. Pure.
 */
import { SURFACE_NODE, type VesselDesign } from '@orbital/core';

export type RerootResult =
	| { ok: true; design: VesselDesign }
	| { ok: false; reason: 'missing' | 'already' | 'path' };

export function reroot(design: VesselDesign, index: number): RerootResult {
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const start = byIndex.get(index);
	if (!start) return { ok: false, reason: 'missing' };
	if (start.parent === null) return { ok: false, reason: 'already' };
	// the path from the new root up to the old one
	const path: (typeof design.parts)[number][] = [];
	for (let p = start; p.parent; p = byIndex.get(p.parent.index)!) {
		const link = p.parent;
		if (
			link.radial ||
			link.surface ||
			link.parentNode === SURFACE_NODE ||
			p.tilt ||
			p.offset ||
			p.link ||
			!byIndex.has(link.index)
		)
			return { ok: false, reason: 'path' };
		path.push(p);
	}
	const turned = new Map<number, VesselDesign['parts'][number]['parent']>([[index, null]]);
	for (const child of path) {
		const link = child.parent!;
		// the old parent now hangs on the old child, by the same two nodes the other way round
		turned.set(link.index, { index: child.index, parentNode: link.node, node: link.parentNode });
	}
	return {
		ok: true,
		design: {
			...design,
			parts: design.parts.map((p) => (turned.has(p.index) ? { ...p, parent: turned.get(p.index)! } : p))
		}
	};
}
