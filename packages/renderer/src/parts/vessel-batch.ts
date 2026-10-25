/**
 * A vessel's static part meshes drawn once per material (plan 367, ADR 0344): every part model has
 * its own mesh per material slot, so a vessel of a hundred parts drew hundreds of calls, and the
 * shadow pass drew them again. The batch merges the static meshes of a vessel's parts, in the
 * frame of one anchor part, into one mesh per material (and per set of vertex attributes) and hides
 * the parts' own meshes; the merged meshes then follow the anchor each frame. Moving pieces, shrouds,
 * plumes, lamps and heat-glow parts (whose materials are their own clones) stay out of it. The merge
 * is redone only when the part set, a part's transform relative to the anchor or which parts glow
 * changes: a vessel's parts are rigid, so that is staging, docking or a break, never the vessel
 * turning (part transforms arrive in inertial axes, so a turn moves every one of them).
 */
import {
	BufferAttribute,
	BufferGeometry,
	Matrix3,
	Matrix4,
	Mesh,
	Quaternion,
	Sphere,
	Vector3,
	type Group,
	type Object3D,
	type InterleavedBufferAttribute,
	type Material
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PartModel } from './types.ts';

/** What the batch needs of a part. */
export interface BatchPart {
	model: Pick<PartModel, 'root' | 'staticMesh'> & { readonly cloned?: boolean };
}

type Typed = Float32Array | Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array;

/** `count` vertices of an attribute from `from`, as a new attribute (a typed-array copy for a plain one). */
function copyRange(
	a: BufferAttribute | InterleavedBufferAttribute,
	from: number,
	count: number
): BufferAttribute {
	const size = a.itemSize;
	if ((a as BufferAttribute).isBufferAttribute === true) {
		const src = a.array as Typed;
		return new BufferAttribute(src.slice(from * size, (from + count) * size), size, a.normalized);
	}
	const array = new (a.array.constructor as new (n: number) => Typed)(count * size);
	for (let k = 0; k < count; k++)
		for (let c = 0; c < size; c++) array[k * size + c] = a.getComponent(from + k, c);
	return new BufferAttribute(array, size, a.normalized);
}

/** The attributes of `source` gathered by `pick` (vertex indices), or a range when `pick` is null. */
function gather(
	source: BufferGeometry,
	pick: Int32Array | number[] | null,
	start: number,
	count: number
): BufferGeometry {
	const out = new BufferGeometry();
	for (const name of Object.keys(source.attributes)) {
		const a = source.attributes[name] as BufferAttribute | InterleavedBufferAttribute;
		if (!pick) {
			out.setAttribute(name, copyRange(a, start, count));
			continue;
		}
		const size = a.itemSize;
		const array = new (a.array.constructor as new (n: number) => Typed)(pick.length * size);
		const plain = (a as BufferAttribute).isBufferAttribute === true;
		const src = a.array as Typed;
		for (let k = 0; k < pick.length; k++) {
			const v = pick[k]!;
			if (plain) for (let c = 0; c < size; c++) array[k * size + c] = src[v * size + c]!;
			else for (let c = 0; c < size; c++) array[k * size + c] = a.getComponent(v, c);
		}
		out.setAttribute(name, new BufferAttribute(array, size, a.normalized));
	}
	return out;
}

/** Moves the positions and normals of `g` by `m` in place (float arrays; anything else goes through three). */
function transform(g: BufferGeometry, m: Matrix4): void {
	const position = g.getAttribute('position') as BufferAttribute | undefined;
	const normal = g.getAttribute('normal') as BufferAttribute | undefined;
	const floats = (a: BufferAttribute | undefined): boolean => !a || a.array instanceof Float32Array;
	if (!floats(position) || !floats(normal) || (position && position.itemSize !== 3)) {
		g.applyMatrix4(m);
		return;
	}
	const e = m.elements;
	if (position) {
		const a = position.array as Float32Array;
		for (let i = 0; i < a.length; i += 3) {
			const x = a[i]!;
			const y = a[i + 1]!;
			const z = a[i + 2]!;
			const w = 1 / (e[3]! * x + e[7]! * y + e[11]! * z + e[15]!);
			a[i] = (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * w;
			a[i + 1] = (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * w;
			a[i + 2] = (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * w;
		}
	}
	if (normal && normal.itemSize === 3) {
		// the normal matrix: the inverse transpose of the upper 3 × 3
		const n = new Matrix3().getNormalMatrix(m).elements;
		const a = normal.array as Float32Array;
		for (let i = 0; i < a.length; i += 3) {
			const x = a[i]!;
			const y = a[i + 1]!;
			const z = a[i + 2]!;
			let nx = n[0]! * x + n[3]! * y + n[6]! * z;
			let ny = n[1]! * x + n[4]! * y + n[7]! * z;
			let nz = n[2]! * x + n[5]! * y + n[8]! * z;
			const l = Math.hypot(nx, ny, nz) || 1;
			nx /= l;
			ny /= l;
			nz /= l;
			a[i] = nx;
			a[i + 1] = ny;
			a[i + 2] = nz;
		}
	}
}

/** The part of `geometry` that one material draws, compacted to the vertices it uses and moved by `matrix`. */
export function groupGeometry(
	source: BufferGeometry,
	start: number,
	count: number,
	matrix: Matrix4
): BufferGeometry | null {
	if (count <= 0) return null;
	const index = source.getIndex();
	if (!index) {
		// a non-indexed geometry (the parts' own): the range of vertices is the group
		const flat = gather(source, null, start, count);
		transform(flat, matrix);
		return flat;
	}
	const remap = new Map<number, number>();
	const used: number[] = [];
	const out = new Uint32Array(count);
	for (let i = 0; i < count; i++) {
		const v = index.getX(start + i);
		let n = remap.get(v);
		if (n === undefined) {
			n = used.length;
			remap.set(v, n);
			used.push(v);
		}
		out[i] = n;
	}
	const sub = gather(source, used, 0, 0);
	sub.setIndex(new BufferAttribute(out, 1));
	transform(sub, matrix);
	return sub;
}

const serials = new WeakMap<object, number>();
let nextSerial = 1;
/** A number per object, for telling a rebuilt model from the one it replaced. */
const serialOf = (o: object): number => {
	let n = serials.get(o);
	if (n === undefined) serials.set(o, (n = nextSerial++));
	return n;
};

/** The bounding sphere of a merged geometry from its float positions (three's own walks the points one by one). */
function boundingSphereOf(g: BufferGeometry): void {
	const a = g.getAttribute('position') as BufferAttribute | undefined;
	if (!a || !(a.array instanceof Float32Array) || a.itemSize !== 3) return;
	const p = a.array;
	let x0 = Infinity;
	let y0 = Infinity;
	let z0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	let z1 = -Infinity;
	for (let i = 0; i < p.length; i += 3) {
		const x = p[i]!;
		const y = p[i + 1]!;
		const z = p[i + 2]!;
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
		if (z < z0) z0 = z;
		if (z > z1) z1 = z;
	}
	if (x0 === Infinity) return;
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	const cz = (z0 + z1) / 2;
	let r2 = 0;
	for (let i = 0; i < p.length; i += 3) {
		const dx = p[i]! - cx;
		const dy = p[i + 1]! - cy;
		const dz = p[i + 2]! - cz;
		const d = dx * dx + dy * dy + dz * dz;
		if (d > r2) r2 = d;
	}
	g.boundingSphere = new Sphere(new Vector3(cx, cy, cz), Math.sqrt(r2));
}

/**
 * The part the batch is anchored to: the lowest id. Part transforms arrive in inertial axes, already
 * turned by the vessel's attitude (protocol.ts PartSnapshot), so the merge is made in this part's
 * frame, where a rigid vessel's parts stay still, and the merged meshes follow it every frame.
 */
function anchorOf(parts: ReadonlyMap<number, BatchPart>): BatchPart | undefined {
	let best: number | undefined;
	for (const id of parts.keys()) if (best === undefined || id < best) best = id;
	return best === undefined ? undefined : parts.get(best);
}

const inverseAnchor = new Quaternion();
const relPosition = new Vector3();
const relQuaternion = new Quaternion();

/**
 * A cheap signature of the batch's inputs: part ids, transforms relative to the anchor part and which
 * parts are out of it. Relative, so the vessel turning or the planet's spin does not change it.
 */
export function batchSignature(parts: ReadonlyMap<number, BatchPart>): number {
	let h = 2166136261;
	const mix = (x: number): void => {
		h = Math.imul(h ^ (Math.round(x * 1000) | 0), 16777619);
	};
	const anchor = anchorOf(parts)?.model.root;
	if (anchor) inverseAnchor.copy(anchor.quaternion).invert();
	for (const [id, p] of parts) {
		const r = p.model.root;
		relPosition.copy(r.position);
		relQuaternion.copy(r.quaternion);
		if (anchor) {
			relPosition.sub(anchor.position).applyQuaternion(inverseAnchor);
			relQuaternion.premultiply(inverseAnchor);
			// q and -q are the same turn: keep w non-negative so the sign flip does not rebuild
			if (relQuaternion.w < 0) relQuaternion.set(-relQuaternion.x, -relQuaternion.y, -relQuaternion.z, -relQuaternion.w);
		}
		mix(id);
		mix(relPosition.x);
		mix(relPosition.y);
		mix(relPosition.z);
		mix(relQuaternion.x);
		mix(relQuaternion.y);
		mix(relQuaternion.z);
		mix(relQuaternion.w);
		mix(p.model.cloned ? 1 : 0);
		mix(p.model.staticMesh ? serialOf(p.model.staticMesh) : 0);
	}
	return h >>> 0;
}

export class VesselBatch {
	private meshes: Mesh[] = [];
	private hidden: Mesh[] = [];
	private signature = -1;
	/** Draw calls the merge removed at the last rebuild (the parts' meshes less the merged ones). */
	saved = 0;

	constructor(private readonly group: Group) {}

	/** Rebuilds the merged meshes when the vessel's parts, their transforms or their glow changed. */
	sync(parts: ReadonlyMap<number, BatchPart>): void {
		// a measuring switch (plan 367): `globalThis.__orbitalNoBatch = true` draws the parts one by one
		if ((globalThis as { __orbitalNoBatch?: boolean }).__orbitalNoBatch === true) {
			if (this.meshes.length > 0) this.dispose();
			return;
		}
		const anchor = anchorOf(parts)?.model.root;
		const signature = batchSignature(parts);
		if (signature !== this.signature) {
			this.signature = signature;
			this.rebuild(parts, anchor);
		}
		// the merged meshes sit where the anchor part is now, turned as it is
		for (const m of this.meshes) {
			if (anchor) {
				m.position.copy(anchor.position);
				m.quaternion.copy(anchor.quaternion);
			}
		}
	}

	private rebuild(parts: ReadonlyMap<number, BatchPart>, anchor: Object3D | undefined): void {
		this.clear();
		const buckets = new Map<string, { material: Material; list: BufferGeometry[] }>();
		const matrix = new Matrix4();
		const toAnchor = new Matrix4();
		if (anchor) {
			anchor.updateMatrix();
			toAnchor.copy(anchor.matrix).invert();
		}
		let own = 0;
		for (const p of parts.values()) {
			const mesh = p.model.staticMesh;
			if (!mesh || p.model.cloned) continue;
			const geometry = mesh.geometry;
			if (!mesh.visible) continue;
			p.model.root.updateMatrix();
			mesh.updateMatrix();
			matrix.multiplyMatrices(p.model.root.matrix, mesh.matrix).premultiply(toAnchor);
			const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			const groups = geometry.groups.length
				? geometry.groups
				: [
						{
							start: 0,
							count: geometry.getIndex()?.count ?? geometry.getAttribute('position').count,
							materialIndex: 0
						}
					];
			const attributes = `${Object.keys(geometry.attributes).sort().join(',')}|${geometry.getIndex() ? 'i' : 'n'}`;
			let used = 0;
			for (const g of groups) {
				const material = materials[g.materialIndex ?? 0];
				if (!material) continue;
				const sub = groupGeometry(geometry, g.start, g.count, matrix);
				if (!sub) continue;
				const key = `${material.uuid}|${attributes}`;
				let b = buckets.get(key);
				if (!b) buckets.set(key, (b = { material, list: [] }));
				b.list.push(sub);
				used++;
			}
			if (used > 0) {
				mesh.visible = false;
				this.hidden.push(mesh);
				own += used;
			}
		}
		for (const { material, list } of buckets.values()) {
			const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
			if (!merged) continue;
			if (list.length > 1) for (const g of list) g.dispose();
			boundingSphereOf(merged);
			const mesh = new Mesh(merged, material);
			mesh.name = 'vessel-batch';
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.group.add(mesh);
			this.meshes.push(mesh);
		}
		this.saved = Math.max(0, own - this.meshes.length);
	}

	private clear(): void {
		for (const m of this.hidden) m.visible = true;
		this.hidden = [];
		for (const m of this.meshes) {
			m.removeFromParent();
			m.geometry.dispose();
		}
		this.meshes = [];
	}

	dispose(): void {
		this.clear();
		this.signature = -1;
	}
}
