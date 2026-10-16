/**
 * Vessel design validation and layout (ADR 0016). Pure: needs only the part registry. The sim
 * assembles vessels from the result; the VAB can call it to validate a design before launch.
 */
import type { PartDefinition } from './definitions.ts';
import type { Vec3 } from './math.ts';
import type { VesselDesign } from './protocol.ts';

export interface ResolvedPart {
	index: number;
	definition: PartDefinition;
	parent: { index: number; parentNode: string; node: string } | null;
	/** Origin relative to the root part's origin, in the vessel's (shared) axes, metres. */
	position: Vec3;
}

export type ResolvedDesign =
	{ ok: true; root: number; parts: ResolvedPart[] } | { ok: false; errors: string[] };

/** Minimal registry view: `get` is all that is needed. */
export interface PartLookup {
	get(id: string): PartDefinition | undefined;
}

const ANTI_PARALLEL = 1 - 1e-6;

const unit = (v: readonly [number, number, number]): Vec3 | undefined => {
	const l = Math.hypot(v[0], v[1], v[2]);
	return l > 0 ? { x: v[0] / l, y: v[1] / l, z: v[2] / l } : undefined;
};

/**
 * Checks: unique indices; exactly one root; parts registered; parent links resolve; nodes exist
 * and each node hosts at most one attachment; attachments are stack-style (the child's node
 * direction is anti-parallel to the parent's, so no relative rotation is needed); every part is
 * reachable from the root (no cycles, no islands); stages reference existing parts.
 * Parts are returned in ascending `index` order with positions computed from node positions.
 */
export function resolveVesselDesign(design: VesselDesign, parts: PartLookup): ResolvedDesign {
	const errors: string[] = [];
	const byIndex = new Map<number, VesselDesign['parts'][number]>();
	for (const p of design.parts) {
		if (byIndex.has(p.index)) errors.push(`duplicate part index ${p.index}`);
		else byIndex.set(p.index, p);
	}
	const roots = design.parts.filter((p) => p.parent === null);
	if (roots.length !== 1) {
		errors.push(`design needs exactly one root part (parent null), found ${roots.length}`);
	}

	const defs = new Map<number, PartDefinition>();
	for (const p of byIndex.values()) {
		const def = parts.get(p.part);
		if (!def) errors.push(`part #${p.index}: unknown part "${p.part}"`);
		else defs.set(p.index, def);
	}

	const usedNodes = new Set<string>();
	const children = new Map<number, number[]>();
	const use = (index: number, node: string): void => {
		const key = `${index}:${node}`;
		if (usedNodes.has(key))
			errors.push(`part #${index}: node "${node}" hosts more than one attachment`);
		usedNodes.add(key);
	};
	for (const p of byIndex.values()) {
		if (!p.parent) continue;
		const { index: pi, parentNode, node } = p.parent;
		const parentPart = byIndex.get(pi);
		if (!parentPart) {
			errors.push(`part #${p.index}: parent #${pi} does not exist`);
			continue;
		}
		if (pi === p.index) {
			errors.push(`part #${p.index}: cannot be its own parent`);
			continue;
		}
		const list = children.get(pi) ?? [];
		list.push(p.index);
		children.set(pi, list);
		use(pi, parentNode);
		use(p.index, node);
		const parentDef = defs.get(pi);
		const def = defs.get(p.index);
		const pn = parentDef?.attach?.[parentNode];
		const cn = def?.attach?.[node];
		if (parentDef && !pn) {
			errors.push(
				`part #${p.index}: parent #${pi} ("${parentDef.id}") has no node "${parentNode}"`
			);
		}
		if (def && !cn) errors.push(`part #${p.index} ("${def.id}") has no node "${node}"`);
		if (pn && cn) {
			const a = unit(pn.dir);
			const b = unit(cn.dir);
			if (!a || !b || a.x * b.x + a.y * b.y + a.z * b.z > -ANTI_PARALLEL) {
				errors.push(
					`part #${p.index}: node "${node}" must face opposite to parent node "${parentNode}" (only stack attachments are supported)`
				);
			}
		}
	}

	stages: for (const [k, stage] of design.stages.entries()) {
		for (const i of stage) {
			if (!byIndex.has(i)) {
				errors.push(`stage ${k} refers to unknown part index ${i}`);
				continue stages;
			}
		}
	}

	const root = roots[0];
	const placed = new Map<number, ResolvedPart>();
	if (root && errors.length === 0) {
		const queue = [root.index];
		placed.set(root.index, {
			index: root.index,
			definition: defs.get(root.index)!,
			parent: null,
			position: { x: 0, y: 0, z: 0 }
		});
		for (let head = 0; head < queue.length; head++) {
			const i = queue[head]!;
			const here = placed.get(i)!;
			for (const c of (children.get(i) ?? []).slice().sort((a, b) => a - b)) {
				const link = byIndex.get(c)!.parent!;
				const pn = here.definition.attach![link.parentNode]!;
				const def = defs.get(c)!;
				const cn = def.attach![link.node]!;
				placed.set(c, {
					index: c,
					definition: def,
					parent: link,
					position: {
						x: here.position.x + pn.pos[0] - cn.pos[0],
						y: here.position.y + pn.pos[1] - cn.pos[1],
						z: here.position.z + pn.pos[2] - cn.pos[2]
					}
				});
				queue.push(c);
			}
		}
		if (placed.size !== byIndex.size) {
			const lost = [...byIndex.keys()].filter((i) => !placed.has(i)).sort((a, b) => a - b);
			errors.push(`parts not connected to the root (cycle or island): ${lost.join(', ')}`);
		}
	}

	if (errors.length > 0 || !root) return { ok: false, errors };
	return {
		ok: true,
		root: root.index,
		parts: [...placed.values()].sort((a, b) => a.index - b.index)
	};
}
