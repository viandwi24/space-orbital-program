/**
 * The mesh terrain's patch maths (plan 398, ADR 0371): where a patch of the CDLOD quadtree
 * (`terrain-quadtree.ts`) puts its vertices, as the vertex shader computes them and as this pure twin does
 * for the tests. A patch is a 16 x 16 grid over a cell of a cube face; its vertices are built from the
 * patch's own centre so that no number near 600 km is ever subtracted from another (a float32 at that size
 * has 6 cm steps): the CPU hands each patch its centre relative to the camera in float64, and the vertex
 * is that plus a small offset computed from the face axes in a form with no cancellation.
 */
import {
	FACES,
	morphFactor,
	rangeOf,
	selectNodes,
	type QuadNode,
	type QuadtreeOptions,
	type Vec3
} from './terrain-quadtree.ts';

/** Quads per patch side; a patch has `GRID + 1` vertices a side. */
export const MESH_GRID = 16;
/** A patch's skirt drops this share of the patch's side below its edge, hiding any crack that is left. */
export const SKIRT_SHARE = 0.04;

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add3 = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** What the vertex shader needs of a patch, all in float64 here. */
export interface PatchFrame {
	node: QuadNode;
	/** The face axes: the face's normal and the two tangents (unit). */
	n: Vec3;
	U: Vec3;
	V: Vec3;
	/** The unit direction of the patch's centre and the length of `n + uc U + vc V` (at least 1). */
	chat: Vec3;
	rho: number;
	/** The patch's side in face coordinates (2 / cells on the face's side). */
	span: number;
	/** The patch's centre on the sea sphere, body-fixed. */
	centre: Vec3;
}

export function patchFrame(node: QuadNode, radius: number): PatchFrame {
	const f = FACES[node.face]!;
	const cells = 2 ** node.level;
	const uc = ((node.x + 0.5) / cells) * 2 - 1;
	const vc = ((node.y + 0.5) / cells) * 2 - 1;
	const C = add3(add3(f.n, f.u, uc), f.v, vc);
	const rho = Math.hypot(C[0], C[1], C[2]);
	const chat = scale3(C, 1 / rho);
	return {
		node,
		n: f.n,
		U: f.u,
		V: f.v,
		chat,
		rho,
		span: 2 / cells,
		centre: scale3(chat, radius)
	};
}

/**
 * The vertex of grid position (gi, gj), each 0 to `MESH_GRID` (fractions allowed: the morph), as its
 * unit direction and its offset from the patch's centre on the sea sphere, for a body of `radius` and
 * the terrain `height` there. The offset is `radius (dir - chat) + dir height`, with `dir - chat`
 * evaluated as `(w - chat delta) / |C + w|` where `delta = |C + w| - rho` has no cancellation.
 */
export function patchVertex(
	p: PatchFrame,
	gi: number,
	gj: number,
	radius: number,
	height: (dir: Vec3) => number
): { dir: Vec3; offset: Vec3; height: number } {
	const du = (gi / MESH_GRID - 0.5) * p.span;
	const dv = (gj / MESH_GRID - 0.5) * p.span;
	const w = add3(scale3(p.U, du), scale3(p.V, dv));
	const cw = p.rho * dot3(p.chat, w);
	const ww = du * du + dv * dv;
	const len = Math.sqrt(p.rho * p.rho + 2 * cw + ww);
	const delta = (2 * cw + ww) / (len + p.rho);
	const dir = scale3(add3(scale3(p.chat, p.rho), w), 1 / len);
	const h = height(dir);
	const diff = scale3(add3(w, p.chat, -delta), 1 / len);
	const offset = add3(scale3(diff, radius), dir, h);
	return { dir, offset, height: h };
}

/** The grid position after the CDLOD morph: odd positions slide to the even one next to them as `k` goes 0 to 1. */
export function morphGrid(g: number, k: number): number {
	const odd = g - 2 * Math.floor(g / 2);
	return g - odd * k;
}

/** The morph of a vertex at `distance` from the camera, in a patch of `level`. */
export function patchMorph(
	distance: number,
	level: number,
	o: Pick<QuadtreeOptions, 'maxLevel' | 'range0'>
): number {
	return morphFactor(distance, rangeOf(level, o));
}

/** Floats per patch in the instance buffer: four vec4. */
export const INSTANCE_FLOATS = 16;

/**
 * The patches to draw for a camera at `camera` (body-fixed, m, float64), written into `out` (grown if
 * needed) as four vec4 each: [centre minus camera, rho], [chat, span], [U, range], [V, level]. Returns
 * the buffer and the number of patches.
 */
export function writeInstances(
	camera: Vec3,
	o: QuadtreeOptions,
	out: Float32Array = new Float32Array(INSTANCE_FLOATS * 256)
): { data: Float32Array; count: number } {
	const nodes = selectNodes(camera, o);
	let data = out;
	if (data.length < nodes.length * INSTANCE_FLOATS)
		data = new Float32Array(Math.ceil((nodes.length * INSTANCE_FLOATS) / 256) * 256 + 256);
	nodes.forEach((node, i) => {
		const p = patchFrame(node, o.radius);
		const rel = add3(p.centre, camera, -1);
		const k = i * INSTANCE_FLOATS;
		data.set([rel[0], rel[1], rel[2], p.rho], k);
		data.set([p.chat[0], p.chat[1], p.chat[2], p.span], k + 4);
		data.set([p.U[0], p.U[1], p.U[2], rangeOf(node.level, o)], k + 8);
		data.set([p.V[0], p.V[1], p.V[2], node.level], k + 12);
	});
	return { data, count: nodes.length };
}
