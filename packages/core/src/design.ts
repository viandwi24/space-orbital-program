/**
 * Vessel design validation and layout (ADR 0016). Pure: needs only the part registry. The sim
 * assembles vessels from the result; the VAB can call it to validate a design before launch.
 */
import type { PartDefinition, PartShape } from './definitions.ts';
import type { Quat, Vec3 } from './math.ts';
import type { DesignLink, DesignTilt, VesselDesign } from './protocol.ts';

/** Reserved `parentNode` of a radial link: the parent's side surface, not a node (ADR 0034). */
export const SURFACE_NODE = 'surface';

export interface ResolvedPart {
	index: number;
	definition: PartDefinition;
	parent: DesignLink | null;
	/** Origin relative to the root part's origin, in the vessel's axes, metres. */
	position: Vec3;
	/**
	 * Turn about the vessel's +Y axis, rad (0 for stack parts; radial parts face their parent). Tilts
	 * (version 3) are not part of it: use `rotation` when `tilted`.
	 */
	yaw: number;
	/** The part's full rotation relative to the vessel axes (identity-with-yaw unless `tilted`). */
	rotation: Quat;
	/** The part or one of its ancestors carries a tilt: only then is `rotation` more than `yaw`. */
	tilted: boolean;
	/** Connector parts (version 3, ADR 0071): the far end, a point of the target's surface relative to the root origin. */
	link?: { index: number; point: Vec3 };
}

/** Older designs become version 3 unchanged (each version only adds optional fields, ADR 0034, 0071). */
export function migrateVesselDesign(design: VesselDesign): VesselDesign {
	return design.formatVersion === 3 ? design : { ...design, formatVersion: 3 };
}

/** 3 x 3 rotation matrix, row-major. */
export type Mat3 = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number
];

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
	const out: number[] = [];
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!);
		}
	}
	return out as unknown as Mat3;
}

export const mat3Apply = (m: Mat3, v: readonly [number, number, number]): Vec3 => ({
	x: m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
	y: m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
	z: m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
});

/** Right-handed rotations about the axes. */
export const matAboutX = (a: number): Mat3 => [
	1,
	0,
	0,
	0,
	Math.cos(a),
	-Math.sin(a),
	0,
	Math.sin(a),
	Math.cos(a)
];
export const matAboutY = (a: number): Mat3 => [
	Math.cos(a),
	0,
	Math.sin(a),
	0,
	1,
	0,
	-Math.sin(a),
	0,
	Math.cos(a)
];
export const matAboutZ = (a: number): Mat3 => [
	Math.cos(a),
	-Math.sin(a),
	0,
	Math.sin(a),
	Math.cos(a),
	0,
	0,
	0,
	1
];

/** The matrix of a tilt: `Rx(x) Ry(y) Rz(z)` (a vector is turned about Z first, then Y, then X; ADR 0071). */
export const tiltMatrix = (t: DesignTilt): Mat3 =>
	mat3Mul(matAboutX(t.x), mat3Mul(matAboutY(t.y), matAboutZ(t.z)));

export const isTilted = (t: DesignTilt | undefined): t is DesignTilt =>
	t !== undefined && (t.x !== 0 || t.y !== 0 || t.z !== 0);

/** Unit quaternion of a rotation matrix. */
export function quatOfMat3(m: Mat3): Quat {
	const trace = m[0] + m[4] + m[8];
	let q: Quat;
	if (trace > 0) {
		const s = Math.sqrt(trace + 1) * 2;
		q = { w: s / 4, x: (m[7] - m[5]) / s, y: (m[2] - m[6]) / s, z: (m[3] - m[1]) / s };
	} else if (m[0] > m[4] && m[0] > m[8]) {
		const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
		q = { w: (m[7] - m[5]) / s, x: s / 4, y: (m[1] + m[3]) / s, z: (m[2] + m[6]) / s };
	} else if (m[4] > m[8]) {
		const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
		q = { w: (m[2] - m[6]) / s, x: (m[1] + m[3]) / s, y: s / 4, z: (m[5] + m[7]) / s };
	} else {
		const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
		q = { w: (m[3] - m[1]) / s, x: (m[2] + m[6]) / s, y: (m[5] + m[7]) / s, z: s / 4 };
	}
	const l = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** Rotation matrix of a unit quaternion. */
export function mat3OfQuat(q: Quat): Mat3 {
	const { x, y, z, w } = q;
	return [
		1 - 2 * (y * y + z * z),
		2 * (x * y - z * w),
		2 * (x * z + y * w),
		2 * (x * y + z * w),
		1 - 2 * (x * x + z * z),
		2 * (y * z - x * w),
		2 * (x * z - y * w),
		2 * (y * z + x * w),
		1 - 2 * (x * x + y * y)
	];
}

/**
 * Where the side of a part's shape lies at azimuth `angle` (rad, right-handed about +Y from the
 * part's +X axis), by the ray from the axis (ADR 0034, 0071): its distance from the axis in the
 * horizontal plane, and the azimuth of the outward normal there (equal to `angle` on a cylinder;
 * the face normal on a box). Undefined for a part without a shape.
 */
export function surfaceSite(
	shape: PartShape | undefined,
	angle: number
): { radius: number; normal: number } | undefined {
	if (shape?.kind === 'cylinder') return { radius: shape.radius, normal: angle };
	if (shape?.kind !== 'box') return undefined;
	const dx = Math.cos(angle);
	const dz = -Math.sin(angle);
	const tx = Math.abs(dx) < 1e-12 ? Infinity : shape.size[0] / 2 / Math.abs(dx);
	const tz = Math.abs(dz) < 1e-12 ? Infinity : shape.size[2] / 2 / Math.abs(dz);
	if (tx <= tz) return { radius: tx, normal: dx > 0 ? 0 : Math.PI };
	return { radius: tz, normal: dz > 0 ? -Math.PI / 2 : Math.PI / 2 };
}

/** Half the extent of the shape along its local Y axis: the range of a radial height. */
export const surfaceHalfHeight = (shape: PartShape | undefined): number =>
	shape?.kind === 'cylinder' ? shape.height / 2 : shape?.kind === 'box' ? shape.size[1] / 2 : 0;

/** Where a part stands: origin relative to the root's origin, the yaw about +Y and the full rotation. */
export interface Placement {
	position: Vec3;
	yaw: number;
	rotation: Mat3;
	tilted: boolean;
}

export const ROOT_PLACEMENT: Placement = {
	position: { x: 0, y: 0, z: 0 },
	yaw: 0,
	rotation: IDENTITY,
	tilted: false
};

const addV = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subV = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** A stack child: its node on the parent's node, turned by `tilt` (about the parent's axes) at that point (ADR 0016 and 0071). */
export function placeStack(
	parent: Placement,
	parentNodePos: readonly [number, number, number],
	childNodePos: readonly [number, number, number],
	tilt?: DesignTilt
): Placement {
	const tilted = parent.tilted || isTilted(tilt);
	const rotation = isTilted(tilt) ? mat3Mul(parent.rotation, tiltMatrix(tilt)) : parent.rotation;
	const on = addV(parent.position, mat3Apply(parent.rotation, parentNodePos));
	return {
		position: subV(on, mat3Apply(rotation, childNodePos)),
		yaw: parent.yaw,
		rotation,
		tilted
	};
}

/**
 * A radial child on the side of `parentShape` at (`angle`, `y`): its horizontal node touches the
 * surface and the part is tilted about the parent's axes, then turned about +Y to face outward
 * from it (ADR 0034 for a cylinder, 0071 for a box). Undefined when the shape has no side to attach to.
 */
export function placeRadial(
	parent: Placement,
	parentShape: PartShape | undefined,
	site: { angle: number; y: number },
	childNode: { pos: readonly [number, number, number]; dir: readonly [number, number, number] },
	tilt?: DesignTilt
): Placement | undefined {
	const surface = surfaceSite(parentShape, site.angle);
	if (!surface) return undefined;
	const yaw = wrap(parent.yaw + surface.normal + Math.PI - azimuthOf(childNode.dir));
	const local = wrap(surface.normal + Math.PI - azimuthOf(childNode.dir));
	// The tilt turns the child about the parent's axes before it faces the surface, so two wings on
	// opposite sides with the same tilt are mirror images (the same incidence), not a twisted pair.
	const rotation = mat3Mul(
		isTilted(tilt) ? mat3Mul(parent.rotation, tiltMatrix(tilt)) : parent.rotation,
		matAboutY(local)
	);
	const side = rotateY([surface.radius, 0, 0], site.angle);
	const on = addV(parent.position, mat3Apply(parent.rotation, [side.x, side.y + site.y, side.z]));
	return {
		position: subV(on, mat3Apply(rotation, childNode.pos)),
		yaw,
		rotation,
		tilted: parent.tilted || isTilted(tilt)
	};
}

/** The point of a part's surface at (`angle`, `y`), relative to the root origin: the far end of a link or a radial contact. */
export function surfacePoint(
	at: Placement,
	shape: PartShape | undefined,
	site: { angle: number; y: number }
): Vec3 | undefined {
	const surface = surfaceSite(shape, site.angle);
	if (!surface) return undefined;
	const side = rotateY([surface.radius, 0, 0], site.angle);
	return addV(at.position, mat3Apply(at.rotation, [side.x, side.y + site.y, side.z]));
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
	for (const p of design.parts) {
		if (design.formatVersion < 3 && (p.tilt !== undefined || p.link !== undefined)) {
			errors.push(`part #${p.index}: tilts and links need formatVersion 3`);
		}
		if (p.tilt && !Object.values(p.tilt).every(Number.isFinite)) {
			errors.push(`part #${p.index}: tilt angles must be finite`);
		}
		const def = defs.get(p.index);
		if (def?.connector && !p.link) {
			errors.push(`part #${p.index} ("${def.id}") is a connector and needs a link`);
		}
		if (p.link) {
			const target = byIndex.get(p.link.index);
			const targetDef = defs.get(p.link.index);
			if (def && !def.connector) {
				errors.push(
					`part #${p.index} ("${def.id}") is not a connector part and cannot have a link`
				);
			}
			if (p.link.index === p.index)
				errors.push(`part #${p.index}: a link cannot end on its own part`);
			else if (!target)
				errors.push(`part #${p.index}: link target #${p.link.index} does not exist`);
			else if (targetDef?.connector) {
				errors.push(`part #${p.index}: a link cannot end on another connector (#${p.link.index})`);
			} else if (targetDef) {
				const half = surfaceHalfHeight(targetDef.shape);
				if (!surfaceSite(targetDef.shape, 0)) {
					errors.push(`part #${p.index}: link target #${p.link.index} has no surface to attach to`);
				} else if (Math.abs(p.link.y) > half + 1e-9) {
					errors.push(
						`part #${p.index}: link height ${p.link.y} m is outside target #${p.link.index} (${2 * half} m tall)`
					);
				}
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
			if (parentDef && shape?.kind !== 'cylinder' && shape?.kind !== 'box') {
				errors.push(
					`part #${p.index}: radial attachment needs a cylindrical or box parent, #${pi} ("${parentDef.id}") is neither`
				);
			} else if (parentDef && shape?.kind === 'box' && design.formatVersion < 3) {
				errors.push(`part #${p.index}: radial attachment to a box parent needs formatVersion 3`);
			} else if (shape && Math.abs(radial.y) > surfaceHalfHeight(shape) + 1e-9) {
				errors.push(
					`part #${p.index}: radial height ${radial.y} m is outside parent #${pi} (${2 * surfaceHalfHeight(shape)} m tall)`
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

	// Custom action groups (plan 110, ADR 0174): one group per slot, members on parts that carry the module.
	const slots = new Set<number>();
	for (const g of design.groups ?? []) {
		if (slots.has(g.slot)) errors.push(`action group slot ${g.slot} is used twice`);
		slots.add(g.slot);
		for (const m of g.members) {
			const def = defs.get(m.part);
			if (!byIndex.has(m.part)) {
				errors.push(`action group ${g.slot}: unknown part index ${m.part}`);
			} else if (def && !(def.modules ?? []).some(([id]) => id === m.module)) {
				errors.push(`action group ${g.slot}: part #${m.part} has no module "${m.module}"`);
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
	const frames = new Map<number, Placement>();
	if (root && errors.length === 0) {
		const queue = [root.index];
		const make = (index: number, link: DesignLink | null, at: Placement): ResolvedPart => ({
			index,
			definition: defs.get(index)!,
			parent: link,
			position: at.position,
			yaw: at.yaw,
			rotation: quatOfMat3(at.rotation),
			tilted: at.tilted
		});
		frames.set(root.index, ROOT_PLACEMENT);
		placed.set(root.index, make(root.index, null, ROOT_PLACEMENT));
		for (let head = 0; head < queue.length; head++) {
			const i = queue[head]!;
			const here = frames.get(i)!;
			const hereDef = defs.get(i)!;
			for (const c of (children.get(i) ?? []).slice().sort((a, b) => a - b)) {
				const entry = byIndex.get(c)!;
				const link = entry.parent!;
				const def = defs.get(c)!;
				const cn = def.attach![link.node]!;
				let at: Placement;
				if (link.radial) {
					at = placeRadial(here, hereDef.shape, link.radial, cn, entry.tilt)!;
				} else {
					const pn = hereDef.attach![link.parentNode]!;
					at = placeStack(here, pn.pos, cn.pos, entry.tilt);
				}
				frames.set(c, at);
				placed.set(c, make(c, link, at));
				queue.push(c);
			}
		}
		if (placed.size !== byIndex.size) {
			const lost = [...byIndex.keys()].filter((i) => !placed.has(i)).sort((a, b) => a - b);
			errors.push(`parts not connected to the root (cycle or island): ${lost.join(', ')}`);
		} else {
			for (const entry of byIndex.values()) {
				if (!entry.link) continue;
				const target = frames.get(entry.link.index);
				const point = target && surfacePoint(target, defs.get(entry.link.index)!.shape, entry.link);
				if (point) placed.get(entry.index)!.link = { index: entry.link.index, point };
			}
		}
	}

	if (errors.length > 0 || !root) return { ok: false, errors };
	return {
		ok: true,
		root: root.index,
		parts: [...placed.values()].sort((a, b) => a.index - b.index)
	};
}
