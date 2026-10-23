/**
 * The Hangar's move and rotate gizmo (plan 279, ADR 0258 point 3): three axis arrows or three
 * rings at the selected part, drawn over everything at a constant size on screen. The page says
 * where and which axes (`VabGizmo`); the view grabs an axis by screen distance (`nearestGizmoAxis`,
 * pure and unit-tested) and the page turns the drag into an offset or a turn.
 */
import {
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	Group,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Quaternion,
	TorusGeometry,
	Vector3,
	type BufferGeometry
} from 'three';
import type { GizmoAxis, GizmoHandle, GizmoPlane, VabGizmo } from './scene-model.ts';

export const GIZMO_AXES: readonly GizmoAxis[] = ['x', 'y', 'z'];
export const GIZMO_PLANES: readonly GizmoPlane[] = ['xy', 'yz', 'zx'];
/** Where a plane handle's square starts along each of its two axes and how long its side is, in gizmo units. */
export const PLANE_START = 0.3;
export const PLANE_SIDE = 0.28;

/** The axis indices of a plane handle's two sides (in gizmo `axes` order) and of its normal. */
export const PLANE_AXES: Readonly<
	Record<GizmoPlane, { u: 0 | 1 | 2; v: 0 | 1 | 2; normal: GizmoAxis }>
> = {
	xy: { u: 0, v: 1, normal: 'z' },
	yz: { u: 1, v: 2, normal: 'x' },
	zx: { u: 2, v: 0, normal: 'y' }
};
const COLOURS: Record<GizmoAxis, number> = { x: 0xe5484d, y: 0x46a758, z: 0x3e8ef7 };
const ACTIVE = 0xffd23f;
/** Length of an arrow and radius of a ring, in gizmo units (the view scales the gizmo with distance). */
export const ARROW_LENGTH = 1;
export const RING_RADIUS = 0.85;
/** Gizmo units per metre of camera distance: the gizmo keeps its size on screen. */
export const GIZMO_SCALE = 0.11;

export interface ScreenXY {
	x: number;
	y: number;
}

/** Distance from `p` to the segment `a`-`b` (screen pixels). */
export function distanceToSegment(p: ScreenXY, a: ScreenXY, b: ScreenXY): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l2 = dx * dx + dy * dy;
	const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from `p` to a closed polyline (a ring's projection). */
export function distanceToLoop(p: ScreenXY, points: readonly ScreenXY[]): number {
	let best = Infinity;
	for (let i = 0; i < points.length; i++) {
		best = Math.min(best, distanceToSegment(p, points[i]!, points[(i + 1) % points.length]!));
	}
	return best;
}

/**
 * The gizmo axis under the pointer within `px` screen pixels, or null: for arrows the nearest shaft
 * (centre to tip), for rings the nearest projected ring. Ties go to x, then y, then z.
 */
export function nearestGizmoAxis(
	pointer: ScreenXY,
	shapes: Partial<Record<GizmoAxis, readonly ScreenXY[]>>,
	mode: 'move' | 'rotate',
	px: number
): GizmoAxis | null {
	let best: { axis: GizmoAxis; d: number } | null = null;
	for (const axis of GIZMO_AXES) {
		const pts = shapes[axis];
		if (!pts || pts.length < 2) continue;
		const d =
			mode === 'move' ? distanceToSegment(pointer, pts[0]!, pts[1]!) : distanceToLoop(pointer, pts);
		if (d <= px && (!best || d < best.d - 1e-9)) best = { axis, d };
	}
	return best?.axis ?? null;
}

/** The four corners of plane handle `plane` on a gizmo with these `axes`, relative to its centre, in gizmo units. */
export function planeCorners(
	axes: readonly [
		readonly [number, number, number],
		readonly [number, number, number],
		readonly [number, number, number]
	],
	plane: GizmoPlane
): [number, number, number][] {
	const { u, v } = PLANE_AXES[plane];
	const a = axes[u];
	const b = axes[v];
	const at = (s: number, t: number): [number, number, number] => [
		a[0] * s + b[0] * t,
		a[1] * s + b[1] * t,
		a[2] * s + b[2] * t
	];
	const lo = PLANE_START;
	const hi = PLANE_START + PLANE_SIDE;
	return [at(lo, lo), at(hi, lo), at(hi, hi), at(lo, hi)];
}

/** Whether `p` is inside the polygon `poly` (screen pixels; even-odd rule). */
export function insidePolygon(p: ScreenXY, poly: readonly ScreenXY[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]!;
		const b = poly[j]!;
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

/**
 * The gizmo handle under the pointer: in Move a plane square it is inside wins (the squares sit
 * clear of the arrows), else the axis `nearestGizmoAxis` finds within `px` pixels (plan 304).
 */
export function nearestGizmoHandle(
	pointer: ScreenXY,
	shapes: Partial<Record<GizmoAxis, readonly ScreenXY[]>>,
	planes: Partial<Record<GizmoPlane, readonly ScreenXY[]>>,
	mode: 'move' | 'rotate',
	px: number
): GizmoHandle | null {
	if (mode === 'move') {
		for (const plane of GIZMO_PLANES) {
			const quad = planes[plane];
			if (quad && quad.length >= 3 && insidePolygon(pointer, quad)) return plane;
		}
	}
	return nearestGizmoAxis(pointer, shapes, mode, px);
}

/**
 * Where a pointer ray crosses the plane through `centre` spanned by the unit vectors `u` and `v`,
 * as distances along them (a plane handle's drag, plan 304). Null when the ray runs parallel to
 * the plane or crosses it behind the origin.
 */
export function planeCoordinates(
	ray: { origin: readonly [number, number, number]; dir: readonly [number, number, number] },
	centre: readonly [number, number, number],
	u: readonly [number, number, number],
	v: readonly [number, number, number]
): { u: number; v: number } | null {
	const n: [number, number, number] = [
		u[1] * v[2] - u[2] * v[1],
		u[2] * v[0] - u[0] * v[2],
		u[0] * v[1] - u[1] * v[0]
	];
	const denom = ray.dir[0] * n[0] + ray.dir[1] * n[1] + ray.dir[2] * n[2];
	if (Math.abs(denom) < 1e-9) return null;
	const t =
		((centre[0] - ray.origin[0]) * n[0] +
			(centre[1] - ray.origin[1]) * n[1] +
			(centre[2] - ray.origin[2]) * n[2]) /
		denom;
	if (t < 0) return null;
	const d: [number, number, number] = [
		ray.origin[0] + ray.dir[0] * t - centre[0],
		ray.origin[1] + ray.dir[1] * t - centre[1],
		ray.origin[2] + ray.dir[2] * t - centre[2]
	];
	const dot = (a: readonly number[], b: readonly number[]): number =>
		a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
	// u and v need not be orthogonal: solve d = a u + b v
	const uu = dot(u, u);
	const vv = dot(v, v);
	const uv = dot(u, v);
	const du = dot(d, u);
	const dv = dot(d, v);
	const det = uu * vv - uv * uv;
	return { u: (du * vv - dv * uv) / det, v: (dv * uu - du * uv) / det };
}

/** Points of a ring of radius `r` about unit `axis` through `centre`, `n` of them. */
export function ringPoints(
	centre: readonly [number, number, number],
	axis: readonly [number, number, number],
	r: number,
	n = 48
): [number, number, number][] {
	const a = new Vector3(...axis).normalize();
	const helper = Math.abs(a.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
	const u = new Vector3().crossVectors(a, helper).normalize();
	const v = new Vector3().crossVectors(a, u).normalize();
	const out: [number, number, number][] = [];
	for (let i = 0; i < n; i++) {
		const t = (i / n) * Math.PI * 2;
		out.push([
			centre[0] + r * (Math.cos(t) * u.x + Math.sin(t) * v.x),
			centre[1] + r * (Math.cos(t) * u.y + Math.sin(t) * v.y),
			centre[2] + r * (Math.cos(t) * u.z + Math.sin(t) * v.z)
		]);
	}
	return out;
}

const UP = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** The gizmo's meshes: built once, re-aimed and re-coloured per scene. */
export class GizmoKit {
	readonly root = new Group();
	private readonly geometries: BufferGeometry[] = [];
	private readonly materials = new Map<GizmoAxis, MeshBasicMaterial>();
	private readonly arrows = new Map<GizmoAxis, Group>();
	private readonly rings = new Map<GizmoAxis, Mesh>();
	private readonly planes = new Map<GizmoPlane, Mesh>();
	private readonly planeMaterials = new Map<GizmoPlane, MeshBasicMaterial>();
	private model: VabGizmo | null = null;

	constructor() {
		this.root.name = 'gizmo';
		this.root.visible = false;
		this.root.renderOrder = 1000;
		const shaft = new CylinderGeometry(0.025, 0.025, ARROW_LENGTH * 0.78, 10);
		shaft.translate(0, ARROW_LENGTH * 0.39, 0);
		const tip = new ConeGeometry(0.075, ARROW_LENGTH * 0.22, 16);
		tip.translate(0, ARROW_LENGTH * 0.89, 0);
		const torus = new TorusGeometry(RING_RADIUS, 0.022, 8, 72);
		const square = new PlaneGeometry(PLANE_SIDE, PLANE_SIDE);
		this.geometries.push(shaft, tip, torus, square);
		for (const plane of GIZMO_PLANES) {
			const material = new MeshBasicMaterial({
				color: COLOURS[PLANE_AXES[plane].normal],
				depthTest: false,
				depthWrite: false,
				transparent: true,
				opacity: 0.55,
				side: DoubleSide,
				toneMapped: false
			});
			this.planeMaterials.set(plane, material);
			const mesh = new Mesh(square, material);
			mesh.renderOrder = 1000;
			this.planes.set(plane, mesh);
			this.root.add(mesh);
		}
		for (const axis of GIZMO_AXES) {
			const material = new MeshBasicMaterial({
				color: COLOURS[axis],
				depthTest: false,
				depthWrite: false,
				transparent: true,
				opacity: 0.95,
				toneMapped: false
			});
			this.materials.set(axis, material);
			const arrow = new Group();
			for (const g of [shaft, tip]) {
				const m = new Mesh(g, material);
				m.renderOrder = 1000;
				arrow.add(m);
			}
			this.arrows.set(axis, arrow);
			this.root.add(arrow);
			const ring = new Mesh(torus, material);
			ring.renderOrder = 1000;
			this.rings.set(axis, ring);
			this.root.add(ring);
		}
	}

	/** Shows `gizmo` (null hides it): position, axes, mode and the axis being dragged. */
	set(gizmo: VabGizmo | null | undefined): void {
		this.model = gizmo ?? null;
		if (!gizmo) {
			this.root.visible = false;
			return;
		}
		this.root.visible = true;
		this.root.position.set(...gizmo.position);
		for (const plane of GIZMO_PLANES) {
			const mesh = this.planes.get(plane)!;
			mesh.visible = gizmo.mode === 'move';
			const { u, v, normal } = PLANE_AXES[plane];
			const a = new Vector3(...gizmo.axes[u]).normalize();
			const b = new Vector3(...gizmo.axes[v]).normalize();
			const c = new Vector3().crossVectors(a, b);
			mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(a, b, c));
			mesh.position
				.copy(a.clone().multiplyScalar(PLANE_START + PLANE_SIDE / 2))
				.add(b.clone().multiplyScalar(PLANE_START + PLANE_SIDE / 2));
			this.planeMaterials
				.get(plane)!
				.color.setHex(gizmo.active === plane ? ACTIVE : COLOURS[normal]);
		}
		gizmo.axes.forEach((dir, i) => {
			const axis = GIZMO_AXES[i]!;
			const d = new Vector3(...dir).normalize();
			const arrow = this.arrows.get(axis)!;
			arrow.visible = gizmo.mode === 'move';
			arrow.quaternion.copy(new Quaternion().setFromUnitVectors(UP, d));
			const ring = this.rings.get(axis)!;
			ring.visible = gizmo.mode === 'rotate';
			ring.quaternion.copy(new Quaternion().setFromUnitVectors(Z, d));
			this.materials.get(axis)!.color.setHex(gizmo.active === axis ? ACTIVE : COLOURS[axis]);
		});
	}

	get current(): VabGizmo | null {
		return this.model;
	}

	/** Keeps the gizmo the same size on screen: `distance` is the camera's distance to it, m. */
	fit(distance: number): void {
		this.root.scale.setScalar(Math.max(0.05, distance * GIZMO_SCALE));
	}

	dispose(): void {
		for (const g of this.geometries) g.dispose();
		for (const m of this.materials.values()) m.dispose();
		for (const m of this.planeMaterials.values()) m.dispose();
	}
}
