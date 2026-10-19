/**
 * Every vessel's design record (plan 221, ADR 0208 point 1): the design it came from and the
 * design indices it still has. A vessel from a save made before plan 221 has no design; one is
 * rebuilt from its parts when asked (parts, the attachment tree, the stages), so it still flies
 * with a HUD. Reading never changes the world, so a resumed save stays byte for byte.
 */
import {
	SURFACE_NODE,
	partId,
	type DesignLink,
	type EntityId,
	type VesselDesign
} from '@orbital/core';
import { partOf, vesselOf, type SimCore } from './core.ts';

export interface DesignRecord {
	design: VesselDesign;
	/** Design indices of the parts the vessel still has, ascending. */
	parts: number[];
	/** True when the design was rebuilt from the parts (a save from before plan 221). */
	rebuilt: boolean;
}

/** The record of `id`, or undefined for an entity that is not a vessel. */
export function designRecord(core: SimCore, id: EntityId): DesignRecord | undefined {
	if (!core.world.hasEntity(id)) return undefined;
	const vessel = vesselOf(core, id);
	const parts = vessel.parts.map((p) => partOf(core, p).index).sort((a, b) => a - b);
	if (vessel.design) return { design: vessel.design, parts, rebuilt: false };
	return { design: rebuildDesign(core, id), parts, rebuilt: true };
}

/** A design from the vessel's parts: breadth-first from the root along the attachments. */
export function rebuildDesign(core: SimCore, id: EntityId): VesselDesign {
	const vessel = vesselOf(core, id);
	const seen = new Set<EntityId>([vessel.root]);
	const queue: EntityId[] = [vessel.root];
	const out: VesselDesign['parts'] = [];
	const links = new Map<EntityId, DesignLink | null>([[vessel.root, null]]);
	for (let head = 0; head < queue.length; head++) {
		const here = queue[head]!;
		const part = partOf(core, here);
		out.push({ index: part.index, part: partId(part.definition), parent: links.get(here) ?? null });
		for (const a of part.attachments) {
			if (seen.has(a.peer) || !vessel.parts.includes(a.peer)) continue;
			seen.add(a.peer);
			queue.push(a.peer);
			// `a.node` is this part's node, `a.peerNode` the child's; a side mount is on `surface`
			links.set(a.peer, {
				index: part.index,
				parentNode: a.node,
				node: a.peerNode,
				...(a.node === SURFACE_NODE ? { radial: { angle: partOf(core, a.peer).yaw, y: 0 } } : {})
			});
		}
	}
	const kept = new Set(vessel.parts);
	return {
		formatVersion: 3,
		name: vessel.name,
		parts: out,
		stages: vessel.stages.map((s) => s.filter((p) => kept.has(p)).map((p) => partOf(core, p).index))
	};
}
