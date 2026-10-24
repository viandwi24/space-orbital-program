/**
 * A vessel's static part meshes drawn once per material (plan 367, ADR 0344): every part model has
 * its own mesh per material slot, so a vessel of a hundred parts drew hundreds of calls, and the
 * shadow pass drew them again. The batch merges the static meshes of a vessel's parts, in the
 * vessel's frame, into one mesh per material (and per set of vertex attributes) and hides the parts'
 * own meshes. Moving pieces, shrouds, plumes, lamps and heat-glow parts (whose materials are their
 * own clones) stay out of it. The merge is redone only when the part set, a part's transform or
 * which parts glow changes: a vessel's parts are rigid, so that is staging, docking or a break.
 */
import {
	BufferAttribute,
	BufferGeometry,
	Matrix4,
	Mesh,
	type Group,
	type InterleavedBufferAttribute,
	type Material
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PartModel } from './types.ts';

/** What the batch needs of a part. */
export interface BatchPart {
	model: Pick<PartModel, 'root' | 'staticMesh'> & { readonly cloned?: boolean };
}

/** The part of `geometry` that one material draws, compacted to the vertices it uses and moved by `matrix`. */
export function groupGeometry(
	source: BufferGeometry,
	start: number,
	count: number,
	matrix: Matrix4
): BufferGeometry | null {
	const index = source.getIndex();
	if (count <= 0) return null;
	if (!index) {
		// a non-indexed geometry (the parts' own): the range of vertices is the group
		const flat = new BufferGeometry();
		for (const name of Object.keys(source.attributes)) {
			const a = source.attributes[name] as BufferAttribute | InterleavedBufferAttribute;
			const size = a.itemSize;
			const array = new (
				a.array.constructor as new (n: number) => ArrayLike<number> & {
					[i: number]: number;
				}
			)(count * size);
			for (let k = 0; k < count; k++)
				for (let c = 0; c < size; c++) array[k * size + c] = a.getComponent(start + k, c);
			flat.setAttribute(name, new BufferAttribute(array as never, size, a.normalized));
		}
		flat.applyMatrix4(matrix);
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
	const sub = new BufferGeometry();
	for (const name of Object.keys(source.attributes)) {
		const a = source.attributes[name] as BufferAttribute | InterleavedBufferAttribute;
		const size = a.itemSize;
		const array = new (
			a.array.constructor as new (n: number) => ArrayLike<number> & {
				[i: number]: number;
			}
		)(used.length * size);
		for (let k = 0; k < used.length; k++)
			for (let c = 0; c < size; c++) array[k * size + c] = a.getComponent(used[k]!, c);
		sub.setAttribute(name, new BufferAttribute(array as never, size, a.normalized));
	}
	sub.setIndex(new BufferAttribute(out, 1));
	sub.applyMatrix4(matrix);
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

/** A cheap signature of the batch's inputs: part ids, transforms and which parts are out of it. */
export function batchSignature(parts: ReadonlyMap<number, BatchPart>): number {
	let h = 2166136261;
	const mix = (x: number): void => {
		h = Math.imul(h ^ (Math.round(x * 1000) | 0), 16777619);
	};
	for (const [id, p] of parts) {
		const r = p.model.root;
		mix(id);
		mix(r.position.x);
		mix(r.position.y);
		mix(r.position.z);
		mix(r.quaternion.x);
		mix(r.quaternion.y);
		mix(r.quaternion.z);
		mix(r.quaternion.w);
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
		const signature = batchSignature(parts);
		if (signature === this.signature) return;
		this.signature = signature;
		this.clear();
		const buckets = new Map<string, { material: Material; list: BufferGeometry[] }>();
		const matrix = new Matrix4();
		let own = 0;
		for (const p of parts.values()) {
			const mesh = p.model.staticMesh;
			if (!mesh || p.model.cloned) continue;
			const geometry = mesh.geometry;
			if (!mesh.visible) continue;
			p.model.root.updateMatrix();
			mesh.updateMatrix();
			matrix.multiplyMatrices(p.model.root.matrix, mesh.matrix);
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
			merged.computeBoundingSphere();
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
