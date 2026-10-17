/**
 * The exhaust trails as one camera-facing ribbon mesh (plan 040, ADR 0080). Trails live in the
 * body-fixed frame of the first body (the air turns with it); the vertex shader turns each point's
 * two vertices to face the camera, so the CPU writes only centres and tangents.
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	BufferAttribute,
	BufferGeometry,
	DoubleSide,
	DynamicDrawUsage,
	InterleavedBuffer,
	InterleavedBufferAttribute,
	Mesh,
	ShaderMaterial,
	Vector3
} from 'three';
import { toRenderSpace } from '../origin.ts';
import { add, rotate } from '../vec.ts';
import { TRAIL_FRAG, TRAIL_VERT } from './shaders.ts';
import {
	MAX_TRAILS,
	RIBBON_STRIDE,
	TRAIL_CAPACITY,
	TRAIL_LIFETIME,
	TrailBuffer,
	VERTICES_PER_POINT,
	writeRibbon,
	writeRibbonIndices,
	type TrailWind
} from './trail.ts';

/** Seconds an engine may be silent before its next point starts a new trail. */
const RUN_GAP = 0.5;
const MAX_VERTICES = MAX_TRAILS * TRAIL_CAPACITY * VERTICES_PER_POINT;
const MAX_INDICES = MAX_TRAILS * (TRAIL_CAPACITY - 1) * 6;

export class TrailRibbon {
	readonly mesh: Mesh;
	readonly trails = new Map<string, TrailBuffer>();
	/** Per engine: the run it is in and the time since it last fed a point (a relit engine starts a new trail). */
	private readonly runs = new Map<string, { id: number; since: number }>();
	private readonly data = new Float32Array(MAX_VERTICES * RIBBON_STRIDE);
	private readonly indices = new Uint16Array(MAX_INDICES);
	private readonly geometry = new BufferGeometry();
	private readonly material: ShaderMaterial;
	private readonly buffer: InterleavedBuffer;
	private readonly index: BufferAttribute;

	constructor() {
		this.buffer = new InterleavedBuffer(this.data, RIBBON_STRIDE);
		this.buffer.setUsage(DynamicDrawUsage);
		const attr = (offset: number, size: number): InterleavedBufferAttribute =>
			new InterleavedBufferAttribute(this.buffer, size, offset);
		// `position` is kept for three's bookkeeping; the vertex shader reads `aCentre` (same bytes).
		this.geometry.setAttribute('position', attr(0, 3));
		this.geometry.setAttribute('aCentre', attr(0, 3));
		this.geometry.setAttribute('aTan', attr(3, 3));
		this.geometry.setAttribute('aSide', attr(6, 1));
		this.geometry.setAttribute('aWidth', attr(7, 1));
		this.geometry.setAttribute('aAlpha', attr(8, 1));
		this.geometry.setAttribute('aAlong', attr(9, 1));
		// BufferAttribute keeps the array it is given (the typed-array subclasses copy it), so the writes below reach the GPU.
		this.index = new BufferAttribute(this.indices, 1);
		this.index.setUsage(DynamicDrawUsage);
		this.geometry.setIndex(this.index);
		this.geometry.setDrawRange(0, 0);
		this.material = new ShaderMaterial({
			vertexShader: TRAIL_VERT,
			fragmentShader: TRAIL_FRAG,
			uniforms: { uLight: { value: new Vector3(1, 1, 1) } },
			transparent: true,
			depthWrite: false,
			// the strip faces the camera by its vertices, so its winding depends on the view: both sides draw
			side: DoubleSide
		});
		this.mesh = new Mesh(this.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 8;
		this.mesh.visible = false;
		this.mesh.name = 'trails';
	}

	/**
	 * Offers a point from the engine `engine`. An engine silent for `RUN_GAP` s starts a new trail
	 * (no ribbon across the coast); the least recently fed trail makes room for a new one.
	 */
	offer(
		engine: string,
		x: number,
		y: number,
		z: number,
		width: number,
		density: number,
		dt: number
	): void {
		const run = this.runs.get(engine) ?? { id: 0, since: 0 };
		if (run.since > RUN_GAP) run.id++;
		run.since = 0;
		this.runs.set(engine, run);
		const key = `${engine}#${run.id}`;
		let trail = this.trails.get(key);
		if (!trail) {
			if (this.trails.size >= MAX_TRAILS) {
				let worst: string | undefined;
				let idle = -1;
				for (const [k, t] of this.trails) {
					if (t.idle > idle) {
						idle = t.idle;
						worst = k;
					}
				}
				if (worst !== undefined) this.trails.delete(worst);
			}
			trail = new TrailBuffer();
			this.trails.set(key, trail);
		}
		trail.add(x, y, z, width, density, dt);
	}

	step(dt: number, wind?: TrailWind): void {
		for (const [engine, run] of this.runs) {
			run.since += Math.max(0, dt);
			if (run.since > TRAIL_LIFETIME + RUN_GAP) this.runs.delete(engine);
		}
		for (const [key, trail] of this.trails) {
			trail.step(dt, wind);
			if (trail.count === 0) this.trails.delete(key);
		}
	}

	clear(): void {
		this.trails.clear();
		this.runs.clear();
	}

	get pointCount(): number {
		let n = 0;
		for (const t of this.trails.values()) n += t.count;
		return n;
	}

	/** Writes the vertices for this frame; `light` is the diffuse radiance of white smoke. */
	write(
		body: { world: Vec3; rotation: Quat } | undefined,
		origin: Vec3,
		light: readonly [number, number, number]
	): void {
		if (!body || this.trails.size === 0) {
			this.mesh.visible = false;
			return;
		}
		(this.material.uniforms.uLight!.value as Vector3).set(light[0], light[1], light[2]);
		const toRender = (x: number, y: number, z: number, into: [number, number, number]): void => {
			const p = toRenderSpace(add(body.world, rotate(body.rotation, { x, y, z })), origin);
			into[0] = p.x;
			into[1] = p.y;
			into[2] = p.z;
		};
		let vertices = 0;
		let indices = 0;
		for (const trail of this.trails.values()) {
			const n = writeRibbon(trail, toRender, this.data, vertices * RIBBON_STRIDE);
			if (n === 0) continue;
			indices += writeRibbonIndices(this.indices, indices, vertices, n / VERTICES_PER_POINT);
			vertices += n;
		}
		this.geometry.setDrawRange(0, indices);
		this.mesh.visible = indices > 0;
		this.buffer.needsUpdate = true;
		this.index.needsUpdate = true;
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
	}
}
