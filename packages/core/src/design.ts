/**
 * Vessel design validation and layout (ADR 0016). Pure: needs only the part registry. The sim
 * assembles vessels from the result; the VAB can call it to validate a design before launch.
 */
import type { PartDefinition } from './definitions.ts';
import type { Vec3 } from './math.ts';
import type { DesignLink, VesselDesign } from './protocol.ts';

/** Reserved `parentNode` of a radial link: the parent's side surface, not a node (ADR 0034). */
export const SURFACE_NODE = 'surface';

export interface ResolvedPart {
	index: number;
	definition: PartDefinition;
	parent: DesignLink | null;
	/** Origin relative to the root part's origin, in the vessel's axes, metres. */
	position: Vec3;
	/** Turn about the vessel's +Y axis, rad (0 for stack parts; radial parts face their parent). */
	yaw: number;
}

/** Version 1 designs become version 2 unchanged (version 2 only adds optional fields, ADR 0034). */
export function migrateVesselDesign(design: VesselDesign): VesselDesign {
	return design.formatVersion === 2 ? design : { ...design, formatVersion: 2 };
}

/** Rotation about +Y by `a` (right-handed): x axis goes to (cos a, 0, -sin a). */
export const rotateY = (v: readonly [number, number, number], a: number): Vec3 => ({
	x: v[0] * Math.cos(a) + v[2] * Math.sin(a),
	y: v[1],
	z: -v[0] * Math.sin(a) + v[2] * Math.cos(a)
});

/** Azimuth `a` of a horizontal vector `v` such that `v = rotateY(x axis, a) * |v|`. */
export const azimuthOf = (v: readonly [number, number, number]): number => Math.atan2(-v[2], v[0]);

const wrap = (a: number): number => {
	const t = Math.atan2(Math.sin(a), Math.cos(a));
	return t;
};

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
 * direction is anti-parallel to the parent's, so no relative rotation is needed) or radial (version
 * 2, ADR 0034: the child's horizontal node touches the side of a cylindrical parent and the child
 * is turned about +Y to face it); every part is
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

	if (design.formatVersion === 1) {
		for (const p of design.parts) {
			if (p.parent?.radial || p.symmetry !== undefined) {
				errors.push(`part #${p.index}: radial links and symmetry groups need formatVersion 2`);
			}
		}
	}
	const sites = new Set<string>();
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
		const { index: pi, parentNode, node, radial } = p.parent;
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
		use(p.index, node);
		const parentDef = defs.get(pi);
		const def = defs.get(p.index);
		const cn = def?.attach?.[node];
		if (def && !cn) errors.push(`part #${p.index} ("${def.id}") has no node "${node}"`);
		if (radial || parentNode === SURFACE_NODE) {
			if (!radial || parentNode !== SURFACE_NODE) {
				errors.push(
					`part #${p.index}: a radial link needs parentNode "${SURFACE_NODE}" and a radial position`
				);
				continue;
			}
			const shape = parentDef?.shape;
			if (parentDef && shape?.kind !== 'cylinder') {
				errors.push(
					`part #${p.index}: radial attachment needs a cylindrical parent, #${pi} ("${parentDef.id}") is not`
				);
			} else if (shape?.kind === 'cylinder' && Math.abs(radial.y) > shape.height / 2 + 1e-9) {
				errors.push(
					`part #${p.index}: radial height ${radial.y} m is outside parent #${pi} (${shape?.kind === 'cylinder' ? shape.height : 0} m tall)`
				);
			}
			if (cn && Math.abs(cn.dir[1]) > 1e-6) {
				errors.push(`part #${p.index}: node "${node}" must be horizontal for a radial attachment`);
			}
			const site = `${pi}:${wrap(radial.angle).toFixed(5)}:${radial.y.toFixed(5)}`;
			if (sites.has(site))
				errors.push(`part #${p.index}: another part is already at that radial site`);
			sites.add(site);
			continue;
		}
		use(pi, parentNode);
		const pn = parentDef?.attach?.[parentNode];
		if (parentDef && !pn) {
			errors.push(
				`part #${p.index}: parent #${pi} ("${parentDef.id}") has no node "${parentNode}"`
			);
		}
		if (pn && cn) {
			const a = unit(pn.dir);
			const b = unit(cn.dir);
			if (!a || !b || a.x * b.x + a.y * b.y + a.z * b.z > -ANTI_PARALLEL) {
				errors.push(
					`part #${p.index}: node "${node}" must face opposite to parent node "${parentNode}" (use a radial link for side attachment)`
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
			position: { x: 0, y: 0, z: 0 },
			yaw: 0
		});
		for (let head = 0; head < queue.length; head++) {
			const i = queue[head]!;
			const here = placed.get(i)!;
			for (const c of (children.get(i) ?? []).slice().sort((a, b) => a - b)) {
				const link = byIndex.get(c)!.parent!;
				const def = defs.get(c)!;
				const cn = def.attach![link.node]!;
				let yaw = here.yaw;
				let at: Vec3;
				if (link.radial) {
					const shape = here.definition.shape;
					const radius = shape?.kind === 'cylinder' ? shape.radius : 0;
					yaw = wrap(here.yaw + link.radial.angle + Math.PI - azimuthOf(cn.dir));
					const side = rotateY([radius, 0, 0], link.radial.angle);
					const on = rotateY([side.x, side.y + link.radial.y, side.z], here.yaw);
					const own = rotateY(cn.pos, yaw);
					at = {
						x: here.position.x + on.x - own.x,
						y: here.position.y + on.y - own.y,
						z: here.position.z + on.z - own.z
					};
				} else {
					const pn = here.definition.attach![link.parentNode]!;
					const d = rotateY(
						[pn.pos[0] - cn.pos[0], pn.pos[1] - cn.pos[1], pn.pos[2] - cn.pos[2]],
						here.yaw
					);
					at = { x: here.position.x + d.x, y: here.position.y + d.y, z: here.position.z + d.z };
				}
				placed.set(c, { index: c, definition: def, parent: link, position: at, yaw });
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
