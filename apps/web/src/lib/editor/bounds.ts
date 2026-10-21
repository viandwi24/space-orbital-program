/**
 * The touch bound of free placement (plan 279, ADR 0258 point 4): in normal mode a moved part's
 * collider must still touch its parent's collider enlarged by `TOUCH_MARGIN`. Colliders are the
 * parts' shapes as oriented boxes (a cylinder by its bounding box), tested by separating axes. Pure.
 */
import {
	mat3OfQuat,
	resolveVesselDesign,
	type Mat3,
	type PartLookup,
	type PartShape,
	type Quat,
	type Vec3,
	type VesselDesign
} from '@orbital/core';

type PartLayout = { position: Vec3; rotation: Quat };

/** How far (m) a moved part may stand off its parent's collider in normal mode. */
export const TOUCH_MARGIN = 0.25;

interface Obb {
	centre: [number, number, number];
	/** Columns of the rotation: the box's own axes in the design frame. */
	axes: [number, number, number][];
	half: [number, number, number];
}

const halfOf = (shape: PartShape): [number, number, number] =>
	shape.kind === 'cylinder'
		? [shape.radius, shape.height / 2, shape.radius]
		: [shape.size[0] / 2, shape.size[1] / 2, shape.size[2] / 2];

function obbOf(layout: PartLayout, shape: PartShape, grow = 0): Obb {
	const m: Mat3 = mat3OfQuat(layout.rotation);
	const h = halfOf(shape);
	return {
		centre: [layout.position.x, layout.position.y, layout.position.z],
		axes: [
			[m[0], m[3], m[6]],
			[m[1], m[4], m[7]],
			[m[2], m[5], m[8]]
		],
		half: [h[0] + grow, h[1] + grow, h[2] + grow]
	};
}

const dot = (a: readonly number[], b: readonly number[]): number =>
	a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
	a[1]! * b[2]! - a[2]! * b[1]!,
	a[2]! * b[0]! - a[0]! * b[2]!,
	a[0]! * b[1]! - a[1]! * b[0]!
];

/** Whether two oriented boxes overlap or touch (separating axis test, 15 axes). */
export function obbsTouch(a: Obb, b: Obb): boolean {
	const d = [b.centre[0] - a.centre[0], b.centre[1] - a.centre[1], b.centre[2] - a.centre[2]];
	const axes: [number, number, number][] = [...a.axes, ...b.axes];
	for (const u of a.axes) for (const v of b.axes) axes.push(cross(u, v));
	for (const axis of axes) {
		const len = Math.hypot(...axis);
		if (len < 1e-9) continue;
		const n = [axis[0] / len, axis[1] / len, axis[2] / len];
		const ra = a.axes.reduce((s, u, i) => s + a.half[i]! * Math.abs(dot(u, n)), 0);
		const rb = b.axes.reduce((s, u, i) => s + b.half[i]! * Math.abs(dot(u, n)), 0);
		if (Math.abs(dot(d, n)) > ra + rb + 1e-9) return false;
	}
	return true;
}

/**
 * Parts of `design` whose collider does not touch their parent's collider enlarged by `margin`,
 * ascending index. Parts without a shape (or with a parent without one) always count as touching.
 * Empty when the design does not resolve.
 */
export function partsOffParent(
	design: VesselDesign,
	parts: PartLookup,
	margin = TOUCH_MARGIN,
	only?: readonly number[]
): number[] {
	const r = design.parts.length > 0 ? resolveVesselDesign(design, parts) : null;
	if (!r?.ok) return [];
	const layout = new Map<number, PartLayout>(r.parts.map((p) => [p.index, p]));
	const out: number[] = [];
	for (const p of design.parts) {
		if (!p.parent || (only && !only.includes(p.index))) continue;
		const parent = design.parts.find((q) => q.index === p.parent!.index);
		const shape = parts.get(p.part)?.shape;
		const parentShape = parent && parts.get(parent.part)?.shape;
		const here = layout.get(p.index);
		const there = layout.get(p.parent.index);
		if (!shape || !parentShape || !here || !there) continue;
		if (!obbsTouch(obbOf(here, shape), obbOf(there, parentShape, margin))) out.push(p.index);
	}
	return out.sort((a, b) => a - b);
}
