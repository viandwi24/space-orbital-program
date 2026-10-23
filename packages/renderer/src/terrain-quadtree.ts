/**
 * The CDLOD quadtree on the cube-sphere (plan 398, ADR 0343): the pure reference of what the compute
 * shader will walk. Six face roots, each split in four down to `maxLevel`; a node splits while the
 * camera is inside its range, ranges double per level, so neighbouring patches differ by at most one
 * level and the vertex morph (`morphFactor`) hides the change. Pure, tested in Bun; the GPU walk
 * mirrors `selectNodes` and `faceUV` / `dirOf` and is checked against it.
 */

export type Vec3 = readonly [number, number, number];

/** A patch: a cube face (0..5), a level (0 is the whole face) and its cell on that level's grid. */
export interface QuadNode {
	face: number;
	level: number;
	x: number;
	y: number;
}

/** Face axes: the face's normal, then its u and v tangents (right-handed, each pair of faces shares edges exactly). */
const FACES: readonly { n: Vec3; u: Vec3; v: Vec3 }[] = [
	{ n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
	{ n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
	{ n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
	{ n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
	{ n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
	{ n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }
];

const norm = (a: Vec3): Vec3 => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
};

/** The unit direction of the point (u, v) in [-1, 1]² on `face`. */
export function dirOf(face: number, u: number, v: number): Vec3 {
	const f = FACES[face]!;
	return norm([
		f.n[0] + f.u[0] * u + f.v[0] * v,
		f.n[1] + f.u[1] * u + f.v[1] * v,
		f.n[2] + f.u[2] * u + f.v[2] * v
	]);
}

/** The face and (u, v) of a direction: the inverse of `dirOf`, the seam mapping across faces. */
export function faceUV(dir: Vec3): { face: number; u: number; v: number } {
	const [x, y, z] = dir;
	const ax = Math.abs(x);
	const ay = Math.abs(y);
	const az = Math.abs(z);
	let face: number;
	if (ax >= ay && ax >= az) face = x > 0 ? 0 : 1;
	else if (ay >= az) face = y > 0 ? 2 : 3;
	else face = z > 0 ? 4 : 5;
	const f = FACES[face]!;
	const d = dir[0] * f.n[0] + dir[1] * f.n[1] + dir[2] * f.n[2];
	const u = (dir[0] * f.u[0] + dir[1] * f.u[1] + dir[2] * f.u[2]) / d;
	const v = (dir[0] * f.v[0] + dir[1] * f.v[1] + dir[2] * f.v[2]) / d;
	return { face, u, v };
}

/** The node of `level` containing a direction. */
export function nodeAt(dir: Vec3, level: number): QuadNode {
	const { face, u, v } = faceUV(dir);
	const n = 2 ** level;
	const cell = (c: number): number => Math.min(n - 1, Math.max(0, Math.floor(((c + 1) / 2) * n)));
	return { face, level, x: cell(u), y: cell(v) };
}

/** The bounding sphere of a node on a body of `radius`, with terrain between `minH` and `maxH` above it. */
export function nodeSphere(
	node: QuadNode,
	radius: number,
	minH = 0,
	maxH = 0
): { center: Vec3; radius: number } {
	const n = 2 ** node.level;
	const u = ((node.x + 0.5) / n) * 2 - 1;
	const v = ((node.y + 0.5) / n) * 2 - 1;
	const half = 1 / n;
	const mid = (minH + maxH) / 2;
	const c = dirOf(node.face, u, v);
	const R = radius + mid;
	// the farthest corner of the cell on the sphere, and half the height range
	let far = 0;
	for (const du of [-half, half])
		for (const dv of [-half, half]) {
			const k = dirOf(node.face, u + du, v + dv);
			far = Math.max(far, Math.hypot(k[0] - c[0], k[1] - c[1], k[2] - c[2]) * radius);
		}
	return { center: [c[0] * R, c[1] * R, c[2] * R], radius: far + (maxH - minH) / 2 };
}

export interface QuadtreeOptions {
	radius: number;
	/** The deepest level (the finest patches). */
	maxLevel: number;
	/** The distance inside which the finest level is used, m; each level up doubles it. */
	range0: number;
	/** Terrain height bounds above the radius, m. */
	minHeight?: number;
	maxHeight?: number;
}

/** The range of a level, m: the camera inside it wants this level or finer. */
export const rangeOf = (level: number, o: Pick<QuadtreeOptions, 'maxLevel' | 'range0'>): number =>
	o.range0 * 2 ** (o.maxLevel - level);

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The patches to draw for a camera at `camera` (body-centred metres): split while inside the node's range. */
export function selectNodes(camera: Vec3, o: QuadtreeOptions): QuadNode[] {
	const out: QuadNode[] = [];
	const visit = (node: QuadNode): void => {
		const s = nodeSphere(node, o.radius, o.minHeight ?? 0, o.maxHeight ?? 0);
		const d = Math.max(0, dist(camera, s.center) - s.radius);
		if (node.level < o.maxLevel && d < rangeOf(node.level, o)) {
			for (let j = 0; j < 2; j++)
				for (let i = 0; i < 2; i++)
					visit({ face: node.face, level: node.level + 1, x: node.x * 2 + i, y: node.y * 2 + j });
		} else out.push(node);
	};
	for (let face = 0; face < 6; face++) visit({ face, level: 0, x: 0, y: 0 });
	return out;
}

/**
 * The vertex morph of a patch (0 at the fine mesh, 1 at the coarse one): zero out to 70 % of the
 * level's range, then rising to one at the range, where the parent's level takes over.
 */
export function morphFactor(distance: number, range: number, start = 0.7): number {
	const from = range * start;
	return Math.min(1, Math.max(0, (distance - from) / (range - from)));
}
