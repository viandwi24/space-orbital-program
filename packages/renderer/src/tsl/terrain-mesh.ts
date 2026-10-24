/**
 * The mesh terrain (plan 398, ADR 0371): the ground near the camera as a CDLOD quadtree of patches
 * (`terrain-quadtree.ts`, patch maths in `terrain-mesh-model.ts`), drawn as one instanced mesh into a
 * distance prepass: each pixel of the target holds the distance from the camera to the nearest ground
 * (0 where there is none). The planet pass reads it in place of sphere-tracing the heights, so its cost no
 * longer grows with march steps, and all of the ground's shading stays where it was. The heights are
 * the baked ones the march read (`TerrainSampler.heightAndSlope`), so the mesh and the shading agree.
 * No pipeline is built or changed in play: the patches are instance data, the morph a uniform-free
 * function of distance.
 */
import {
	BufferAttribute,
	Color,
	DoubleSide,
	InstancedBufferGeometry,
	InstancedInterleavedBuffer,
	InterleavedBufferAttribute,
	Mesh,
	NearestFilter,
	PerspectiveCamera,
	Quaternion,
	RedFormat,
	RenderTarget,
	Scene,
	FloatType,
	type Matrix4
} from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import { INSTANCE_FLOATS, MESH_GRID, SKIRT_SHARE, writeInstances } from '../terrain-mesh-model.ts';
import type { QuadNode, Vec3 } from '../terrain-quadtree.ts';
import type { TerrainSampler } from './terrain.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	abs,
	attribute,
	clamp,
	dot,
	float,
	fract,
	length,
	mat3,
	normalize,
	sqrt,
	varying,
	vec3,
	vec4
} = T;

/** The finest level of the quadtree: patches of about 28 m on a 600 km body, 1.8 m between vertices. */
export const MESH_MAX_LEVEL = 15;
/** The distance inside which the finest level is used, m; each level up doubles it. */
export const MESH_RANGE0 = 40;
/** The slope the height bounds of a patch allow for (the steepest ground), rise over run. */
const MAX_SLOPE = 1.2;

export class TerrainMesh {
	/** The distance prepass: R32F, 0 where no ground; read with `textureLoad` at the pass's pixel. */
	readonly target = new RenderTarget(1, 1, {
		type: FloatType,
		format: RedFormat,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		depthBuffer: true,
		generateMipmaps: false
	});
	private readonly scene = new Scene();
	private readonly camera = new PerspectiveCamera();
	private readonly geometry = new InstancedBufferGeometry();
	private readonly material = Object.assign(new MeshBasicNodeMaterial(), {
		name: 'terrain-mesh-prepass'
	});
	private readonly mesh: Mesh;
	private buffer: InstancedInterleavedBuffer;
	private data: Float32Array<ArrayBuffer> = new Float32Array(INSTANCE_FLOATS * 1024);
	private readonly heights = new Map<string, number>();
	/** How many patches the last `update` selected. */
	count = 0;

	constructor(
		sampler: TerrainSampler,
		private radius: number,
		private readonly maxHeight: number,
		private readonly minHeight: number,
		/** The CPU terrain height at a body-fixed unit direction (the sim's), for the patches' bounds. */
		private heightAt: (dir: Vec3) => number
	) {
		this.buffer = new InstancedInterleavedBuffer(this.data, INSTANCE_FLOATS, 1);
		this.buffer.setUsage(35048);
		const g = MESH_GRID;
		// the grid with a skirt ring: position = (column, row, skirt) over 0..g, the ring a copy of the edge
		const side = g + 3;
		const pos = new Float32Array(side * side * 3);
		for (let j = 0; j < side; j++)
			for (let i = 0; i < side; i++) {
				const k = (j * side + i) * 3;
				pos[k] = Math.min(Math.max(i - 1, 0), g);
				pos[k + 1] = Math.min(Math.max(j - 1, 0), g);
				pos[k + 2] = i === 0 || j === 0 || i === side - 1 || j === side - 1 ? 1 : 0;
			}
		const idx: number[] = [];
		for (let j = 0; j < side - 1; j++)
			for (let i = 0; i < side - 1; i++) {
				const a = j * side + i;
				idx.push(a, a + 1, a + side, a + 1, a + side + 1, a + side);
			}
		this.geometry.setAttribute('position', new BufferAttribute(pos, 3));
		this.geometry.setIndex(idx);
		for (const [name, offset] of [
			['iA', 0],
			['iB', 4],
			['iC', 8],
			['iD', 12]
		] as const)
			this.geometry.setAttribute(name, new InterleavedBufferAttribute(this.buffer, 4, offset));
		this.geometry.instanceCount = 0;
		this.build(sampler);
		this.mesh = new Mesh(this.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.scene.add(this.mesh);
		this.camera.matrixAutoUpdate = false;
	}

	/** The vertex and fragment of the prepass. */
	private build(sampler: TerrainSampler): void {
		const R = float(this.radius);
		const iA = attribute('iA', 'vec4');
		const iB = attribute('iB', 'vec4');
		const iC = attribute('iC', 'vec4');
		const iD = attribute('iD', 'vec4');
		const g = attribute('position', 'vec3');
		const span = iB.w;
		const rho = iA.w;
		const chat = iB.xyz;
		const U = iC.xyz;
		const V = iD.xyz;
		const range = iC.w;
		const GRID = float(MESH_GRID);
		/** The unit direction of grid position (gx, gy) and its offset from the patch centre on the sea sphere. */
		const vertex = (gx: N, gy: N): { dir: N; diff: N } => {
			const du = gx.div(GRID).sub(0.5).mul(span);
			const dv = gy.div(GRID).sub(0.5).mul(span);
			const w = U.mul(du).add(V.mul(dv));
			const cw = rho.mul(dot(chat, w));
			const ww = du.mul(du).add(dv.mul(dv));
			const len = sqrt(rho.mul(rho).add(cw.mul(2.0)).add(ww));
			const delta = cw.mul(2.0).add(ww).div(len.add(rho));
			const dir = chat.mul(rho).add(w).div(len);
			const diff = w.sub(chat.mul(delta)).div(len);
			return { dir, diff };
		};
		const gxy = g.xy.toVar();
		// the morph by the distance of the vertex without its height (CDLOD): odd grid positions slide to the even
		const v0 = vertex(gxy.x, gxy.y);
		const dist0 = length(iA.xyz.add(v0.diff.mul(R)));
		const k = clamp(dist0.sub(range.mul(0.7)).div(range.mul(0.3)), 0.0, 1.0);
		const gm = gxy.sub(fract(gxy.mul(0.5)).mul(2.0).mul(k)).toVar();
		const v = vertex(gm.x, gm.y);
		const identity = mat3(1, 0, 0, 0, 1, 0, 0, 0, 1);
		void identity;
		const h = sampler.heightAndSlope(v.dir).x;
		// the skirt ring drops below its edge: a crack left between two levels shows the ground under it
		const drop = span
			.mul(R)
			.mul(0.8 * SKIRT_SHARE)
			.mul(g.z);
		const rel = Fn(() => iA.xyz.add(v.diff.mul(R)).add(v.dir.mul(h.sub(drop))))().toVar();
		this.material.positionNode = rel;
		const relV = varying(rel);
		this.material.fragmentNode = vec4(length(relV), 0.0, 0.0, 1.0);
		this.material.side = DoubleSide;
		this.material.depthTest = true;
		this.material.depthWrite = true;
		void abs;
		void normalize;
		void vec3;
	}

	setRadius(radius: number): void {
		if (radius === this.radius) return;
		this.radius = radius;
		this.heights.clear();
	}

	/** The terrain heights changed (a new terrain): the cached bounds of the patches go. */
	setHeightFn(heightAt: (dir: Vec3) => number): void {
		this.heightAt = heightAt;
		this.heights.clear();
	}

	/**
	 * The patches for a camera at `camBody` (body-fixed, m, float64): selects them, writes the instance
	 * buffer and returns how many. Patch bounds use the terrain height at the patch's centre, cached by node.
	 */
	update(camBody: Vec3): number {
		const cache = this.heights;
		if (cache.size > 40_000) cache.clear();
		const out = writeInstances(
			camBody,
			{
				radius: this.radius,
				maxLevel: MESH_MAX_LEVEL,
				range0: MESH_RANGE0,
				minHeight: this.minHeight,
				maxHeight: this.maxHeight,
				maxSlope: MAX_SLOPE,
				heightAt: (dir: Vec3, node: QuadNode) => {
					const key = `${node.face}:${node.level}:${node.x}:${node.y}`;
					let h = cache.get(key);
					if (h === undefined) {
						h = this.heightAt(dir);
						cache.set(key, h);
					}
					return h;
				}
			},
			this.data
		);
		if (out.data !== this.data) {
			this.data = out.data as Float32Array<ArrayBuffer>;
			this.buffer = new InstancedInterleavedBuffer(this.data, INSTANCE_FLOATS, 1);
			this.buffer.setUsage(35048);
			for (const [name, offset] of [
				['iA', 0],
				['iB', 4],
				['iC', 8],
				['iD', 12]
			] as const)
				this.geometry.setAttribute(name, new InterleavedBufferAttribute(this.buffer, 4, offset));
		}
		this.buffer.addUpdateRange(0, out.count * INSTANCE_FLOATS);
		this.buffer.needsUpdate = true;
		this.geometry.instanceCount = out.count;
		this.count = out.count;
		return out.count;
	}

	/**
	 * Draws the distance prepass into `target` for a camera at the body-fixed origin looking as `view`
	 * (the camera's orientation in body-fixed axes) with `projection` (jittered under TAAU).
	 */
	render(
		renderer: WebGPURenderer,
		width: number,
		height: number,
		view: Quaternion,
		projection: Matrix4,
		near: number,
		far: number
	): void {
		if (this.count === 0) return;
		if (this.target.width !== width || this.target.height !== height)
			this.target.setSize(width, height);
		const cam = this.camera;
		cam.near = near;
		cam.far = far;
		cam.position.set(0, 0, 0);
		cam.quaternion.copy(view);
		cam.updateMatrix();
		cam.matrixWorld.copy(cam.matrix);
		cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
		cam.projectionMatrix.copy(projection);
		cam.projectionMatrixInverse.copy(projection).invert();
		const prev = renderer.getRenderTarget();
		const clear = renderer.getClearColor(new Color());
		const alpha = renderer.getClearAlpha();
		renderer.setClearColor(0x000000, 0);
		renderer.setRenderTarget(this.target);
		renderer.clear(true, true, false);
		renderer.render(this.scene, cam);
		renderer.setRenderTarget(prev);
		renderer.setClearColor(clear, alpha);
	}

	/** Builds the pipeline now (the loading screen's warm-up): one degenerate patch drawn into a small target. */
	warm(renderer: WebGPURenderer): void {
		this.data.fill(0);
		this.data[3] = 1;
		this.data[7] = 1e-6;
		this.data[11] = 1;
		this.geometry.instanceCount = 1;
		this.buffer.needsUpdate = true;
		this.count = 1;
		this.render(renderer, 64, 64, new Quaternion(), this.camera.projectionMatrix, 0.1, 1e9);
		this.count = 0;
		this.geometry.instanceCount = 0;
	}

	dispose(): void {
		this.target.dispose();
		this.geometry.dispose();
		this.material.dispose();
	}
}
