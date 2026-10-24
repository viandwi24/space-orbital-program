/**
 * Instanced vegetation with two levels of detail (plan 414, ADR 0371): the instances near the camera
 * draw with the full geometry, the rest with a coarse one. One list of instances lives here; the near
 * and far meshes each hold a buffer the list is sorted into when the camera has moved far enough, so a
 * frame is a count and a visibility flag, never a draw per instance, and nothing is built in play.
 */
import {
	Color,
	InstancedBufferAttribute,
	InstancedMesh,
	type BufferGeometry,
	type Matrix4,
	type MeshStandardMaterial
} from 'three';

/** The camera moving this far, m, sorts the list again. */
export const LOD_RESORT_DISTANCE = 8;

/** Which instances are near: pure, so a test can pin the split. */
export function splitNear(
	xz: ArrayLike<number>,
	camera: { x: number; z: number },
	radius: number
): { near: number[]; far: number[] } {
	const near: number[] = [];
	const far: number[] = [];
	const r2 = radius * radius;
	for (let i = 0; i < xz.length / 2; i++) {
		const dx = xz[i * 2]! - camera.x;
		const dz = xz[i * 2 + 1]! - camera.z;
		(dx * dx + dz * dz <= r2 ? near : far).push(i);
	}
	return { near, far };
}

export class LodInstances {
	readonly near: InstancedMesh;
	readonly far: InstancedMesh;
	private readonly matrices: Float32Array;
	private readonly colours: Float32Array;
	private readonly xz: Float32Array;
	private filled = 0;
	/** Measurement: hidden whatever the detail range says. */
	hidden = false;
	tag = '';
	private sortedAt: { x: number; z: number } | null = null;

	constructor(
		nearGeo: BufferGeometry,
		farGeo: BufferGeometry,
		material: MeshStandardMaterial,
		readonly capacity: number,
		cast: boolean,
		/** Metres within which an instance draws with the full geometry. */
		readonly radius: number
	) {
		this.near = new InstancedMesh(nearGeo, material, capacity);
		this.far = new InstancedMesh(farGeo, material, capacity);
		for (const m of [this.near, this.far]) {
			m.castShadow = cast;
			m.receiveShadow = true;
			m.frustumCulled = false;
			m.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
			m.count = 0;
		}
		this.matrices = new Float32Array(capacity * 16);
		this.colours = new Float32Array(capacity * 3);
		this.xz = new Float32Array(capacity * 2);
	}

	/** Adds an instance (its matrix, its colour and where it stands, site-local). */
	add(matrix: Matrix4, colour: Color, x: number, z: number): void {
		const i = this.filled++;
		matrix.toArray(this.matrices, i * 16);
		this.colours[i * 3] = colour.r;
		this.colours[i * 3 + 1] = colour.g;
		this.colours[i * 3 + 2] = colour.b;
		this.xz[i * 2] = x;
		this.xz[i * 2 + 1] = z;
	}

	get meshes(): [InstancedMesh, InstancedMesh] {
		return [this.near, this.far];
	}

	/** Sorts the instances into the two meshes for a camera at site-local (x, z); a no-op until it has moved. */
	update(camera: { x: number; z: number }): void {
		const last = this.sortedAt;
		if (last && Math.hypot(camera.x - last.x, camera.z - last.z) < LOD_RESORT_DISTANCE) return;
		this.sortedAt = { x: camera.x, z: camera.z };
		const { near, far } = splitNear(this.xz.subarray(0, this.filled * 2), camera, this.radius);
		this.fill(this.near, near);
		this.fill(this.far, far);
	}

	private fill(mesh: InstancedMesh, list: readonly number[]): void {
		const m = mesh.instanceMatrix.array as Float32Array;
		const c = mesh.instanceColor!.array as Float32Array;
		list.forEach((src, k) => {
			m.set(this.matrices.subarray(src * 16, src * 16 + 16), k * 16);
			c[k * 3] = this.colours[src * 3]!;
			c[k * 3 + 1] = this.colours[src * 3 + 1]!;
			c[k * 3 + 2] = this.colours[src * 3 + 2]!;
		});
		mesh.count = list.length;
		mesh.instanceMatrix.needsUpdate = true;
		mesh.instanceColor!.needsUpdate = true;
	}

	/** Shows the two meshes (or hides them all): `visible` from the site's detail range. */
	show(visible: boolean): void {
		this.near.visible = visible && !this.hidden && this.near.count > 0;
		this.far.visible = visible && !this.hidden && this.far.count > 0;
	}

	dispose(): void {
		this.near.dispose();
		this.far.dispose();
	}
}

export { Color };
