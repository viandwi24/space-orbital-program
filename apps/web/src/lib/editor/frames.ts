/**
 * Poses and the links that give them (plan 357, ADR 0301): where a part stands relative to the
 * design root, and the stack or surface link, tilt and offset that put it there on a given parent.
 * Used by the symmetry pivot about the vessel axis and by the re-root through side links. Pure.
 */
import {
	matAboutY,
	mat3Apply,
	mat3Mul,
	mat3OfQuat,
	pointNearShape,
	rotationBetween,
	tiltMatrix,
	tiltOfMatrix,
	type DesignOffset,
	type DesignTilt,
	type Mat3,
	type PartShape,
	type Quat,
	type Vec3
} from '@orbital/core';

/** A part's origin and full rotation relative to the design root. */
export interface Pose {
	position: Vec3;
	rotation: Mat3;
}

type V3 = [number, number, number];
type Node = { pos: readonly [number, number, number]; dir: readonly [number, number, number] };

export const poseOf = (l: { position: Vec3; rotation: Quat }): Pose => ({
	position: l.position,
	rotation: mat3OfQuat(l.rotation)
});

export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const arr = (v: Vec3): V3 => [v.x, v.y, v.z];
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const unit = (v: readonly [number, number, number]): V3 | undefined => {
	const l = Math.hypot(v[0], v[1], v[2]);
	return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : undefined;
};

/** Below this an angle or a length is read as zero, so a link carries no tilt or offset of rounding noise. */
const EPS = 1e-9;

/** `pose` seen from `frame`: its position and rotation in `frame`'s axes. */
export function relativePose(pose: Pose, frame: Pose): Pose {
	const inv = transpose(frame.rotation);
	return {
		position: mat3Apply(inv, arr(sub(pose.position, frame.position))),
		rotation: mat3Mul(inv, pose.rotation)
	};
}

/** `pose` turned about the design root's vertical axis (through its origin) by `angle`. */
export function turnedAboutAxis(pose: Pose, angle: number): Pose {
	const r = matAboutY(angle);
	return { position: mat3Apply(r, arr(pose.position)), rotation: mat3Mul(r, pose.rotation) };
}

/**
 * `pose` reflected across the design root's YZ plane (x to -x), as the other half of a mirror pair:
 * the turn is reflected too, across the plane through the part's attach node direction `dir` and
 * its up axis, so the mirrored part's node still faces the way the reflected one would.
 */
export function mirroredAcrossAxis(pose: Pose, dir: readonly [number, number, number]): Pose {
	const S: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
	// the part's own reflection: across the plane spanned by its node direction and +Y
	const m = unit([-dir[2], 0, dir[0]]) ?? [0, 0, 1];
	const local: Mat3 = [
		1 - 2 * m[0] * m[0],
		-2 * m[0] * m[1],
		-2 * m[0] * m[2],
		-2 * m[1] * m[0],
		1 - 2 * m[1] * m[1],
		-2 * m[1] * m[2],
		-2 * m[2] * m[0],
		-2 * m[2] * m[1],
		1 - 2 * m[2] * m[2]
	];
	const p = pose.position;
	return {
		position: { x: -p.x, y: p.y, z: p.z },
		rotation: mat3Mul(mat3Mul(S, pose.rotation), local)
	};
}

const isIdentity = (m: Mat3): boolean =>
	Math.abs(m[0] - 1) < EPS &&
	Math.abs(m[4] - 1) < EPS &&
	Math.abs(m[8] - 1) < EPS &&
	[m[1], m[2], m[3], m[5], m[6], m[7]].every((v) => Math.abs(v) < EPS);

/** The tilt of a rotation (absent for none), rounding noise dropped. */
export function tiltOf(m: Mat3): DesignTilt | undefined {
	if (isIdentity(m)) return undefined;
	const t = tiltOfMatrix(m);
	const clean = (v: number): number => (Math.abs(v) < EPS ? 0 : v);
	return { x: clean(t.x), y: clean(t.y), z: clean(t.z) };
}

const offsetOf = (v: Vec3): DesignOffset | undefined =>
	Math.hypot(v.x, v.y, v.z) < EPS ? undefined : { x: v.x, y: v.y, z: v.z };

/**
 * The tilt and offset that put `child` at its pose on a stack link from node `childNode` of the
 * child to node `parentNode` of `parent` (ADR 0016, 0071, 0258: `placeStack`, then `withOffset`).
 */
export function stackLinkOnto(
	parent: Pose,
	parentNode: Node,
	child: Pose,
	childNode: Node
): { tilt?: DesignTilt; offset?: DesignOffset } {
	const inv = transpose(parent.rotation);
	const tilt = tiltOf(mat3Mul(inv, child.rotation));
	const turn = tilt ? tiltMatrix(tilt) : undefined;
	const rotation = turn ? mat3Mul(parent.rotation, turn) : parent.rotation;
	const on = add(parent.position, mat3Apply(parent.rotation, parentNode.pos));
	const placed = sub(on, mat3Apply(rotation, childNode.pos));
	const offset = offsetOf(mat3Apply(inv, arr(sub(child.position, placed))));
	return { ...(tilt ? { tilt } : {}), ...(offset ? { offset } : {}) };
}

/** A surface link (ADR 0235) with the tilt and offset that give a pose exactly. */
export interface SurfaceLinkFit {
	surface: { point: V3; normal: V3 };
	tilt?: DesignTilt;
	offset?: DesignOffset;
	/** Distance from the touch point to the parent's surface, m (0 inside or on it): to pick the nearest parent. */
	gap: number;
}

/**
 * The surface link that puts `child` at its pose with node `childNode` on `parent` (`placeSurface`,
 * then `withOffset`). The point is where the node lies in the parent's frame when that is on the
 * parent's shape; otherwise `anchor` (a point of the parent's frame on its shape) with an offset
 * for the rest. Null when the node has no direction, or neither point is on the parent.
 */
export function surfaceLinkOnto(
	parent: Pose,
	parentShape: PartShape | undefined,
	child: Pose,
	childNode: Node,
	anchor?: readonly [number, number, number]
): SurfaceLinkFit | null {
	const d = unit(childNode.dir);
	if (!d) return null;
	const inv = transpose(parent.rotation);
	const turn = mat3Mul(inv, child.rotation);
	const contact = arr(
		mat3Apply(
			inv,
			arr(sub(add(child.position, mat3Apply(child.rotation, childNode.pos)), parent.position))
		)
	);
	let point: V3;
	let offset: DesignOffset | undefined;
	if (pointNearShape(parentShape, contact)) point = contact;
	else if (anchor && pointNearShape(parentShape, anchor)) {
		point = [anchor[0], anchor[1], anchor[2]];
		offset = offsetOf({
			x: contact[0] - point[0],
			y: contact[1] - point[1],
			z: contact[2] - point[2]
		});
	} else return null;
	// the node's direction in the parent's frame; the surface normal is against it
	const along = mat3Apply(turn, d);
	const face = rotationBetween(d, [along.x, along.y, along.z]);
	const tilt = tiltOf(mat3Mul(turn, transpose(face)));
	return {
		surface: { point, normal: [-along.x, -along.y, -along.z] },
		...(tilt ? { tilt } : {}),
		...(offset ? { offset } : {}),
		gap: gapTo(parentShape, point)
	};
}

/**
 * The inverse link (plan 358, ADR 0333) that hangs `surfaceOwner` on node `node` of `nodeOwner`
 * at its pose: the point is where the node lies in the surface owner's frame (it must be on its
 * shape), the normal is against the node's direction, and the tilt is the twist left over
 * (`placeInverse`). Null when the node has no direction or does not touch the shape.
 */
export function inverseLinkOnto(
	nodeOwner: Pose,
	node: Node,
	surfaceOwner: Pose,
	shape: PartShape | undefined
): { surface: { point: V3; normal: V3 }; tilt?: DesignTilt } | null {
	const d = unit(node.dir);
	if (!d) return null;
	const inv = transpose(surfaceOwner.rotation);
	const contact = arr(
		mat3Apply(
			inv,
			arr(
				sub(add(nodeOwner.position, mat3Apply(nodeOwner.rotation, node.pos)), surfaceOwner.position)
			)
		)
	);
	if (!pointNearShape(shape, contact)) return null;
	const turn = mat3Mul(transpose(nodeOwner.rotation), surfaceOwner.rotation);
	const against: V3 = [-d[0], -d[1], -d[2]];
	const n = mat3Apply(transpose(turn), against);
	const normal: V3 = [n.x, n.y, n.z];
	const tilt = tiltOf(mat3Mul(turn, transpose(rotationBetween(normal, against))));
	return { surface: { point: contact, normal }, ...(tilt ? { tilt } : {}) };
}

/** Distance from a point of a part's frame to the surface of its shape, from outside or inside. */
export function gapTo(shape: PartShape | undefined, p: readonly [number, number, number]): number {
	const q =
		shape?.kind === 'cylinder'
			? [Math.hypot(p[0], p[2]) - shape.radius, Math.abs(p[1]) - shape.height / 2]
			: shape?.kind === 'box'
				? [0, 1, 2].map((i) => Math.abs(p[i]!) - shape.size[i]! / 2)
				: undefined;
	if (!q) return Infinity;
	const outside = Math.hypot(...q.map((v) => Math.max(0, v)));
	return outside > 0 ? outside : -Math.max(...q);
}

/** Whether two poses agree within `tol` (m, and matrix entries). */
export function samePose(a: Pose, b: Pose, tol = 1e-6): boolean {
	const dp = sub(a.position, b.position);
	if (Math.hypot(dp.x, dp.y, dp.z) > tol) return false;
	return a.rotation.every((v, i) => Math.abs(v - b.rotation[i]!) <= tol);
}
