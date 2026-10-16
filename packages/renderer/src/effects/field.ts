/** Instanced camera-facing quads with per-instance position, size, colour and seed (plan 020). */
import {
	AdditiveBlending,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	Mesh,
	NormalBlending,
	PlaneGeometry,
	ShaderMaterial
} from 'three';
import { FIELD_VERT } from './shaders.ts';

export class BillboardField {
	readonly mesh: Mesh;
	readonly capacity: number;
	private readonly geometry = new InstancedBufferGeometry();
	private readonly material: ShaderMaterial;
	private readonly pos: InstancedBufferAttribute;
	private readonly size: InstancedBufferAttribute;
	private readonly colour: InstancedBufferAttribute;
	private readonly seed: InstancedBufferAttribute;
	count = 0;

	constructor(capacity: number, fragmentShader: string, additive: boolean) {
		this.capacity = Math.max(1, capacity);
		const quad = new PlaneGeometry(1, 1);
		this.geometry.index = quad.index;
		this.geometry.setAttribute('position', quad.getAttribute('position'));
		this.geometry.setAttribute('uv', quad.getAttribute('uv'));
		quad.dispose();
		const n = this.capacity;
		this.pos = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
		this.size = new InstancedBufferAttribute(new Float32Array(n), 1);
		this.colour = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
		this.seed = new InstancedBufferAttribute(new Float32Array(n), 1);
		for (const a of [this.pos, this.size, this.colour, this.seed]) a.setUsage(35048); // DynamicDrawUsage
		this.geometry.setAttribute('iPos', this.pos);
		this.geometry.setAttribute('iSize', this.size);
		this.geometry.setAttribute('iColor', this.colour);
		this.geometry.setAttribute('iSeed', this.seed);
		this.geometry.instanceCount = 0;
		this.material = new ShaderMaterial({
			vertexShader: FIELD_VERT,
			fragmentShader,
			transparent: true,
			depthWrite: false,
			blending: additive ? AdditiveBlending : NormalBlending
		});
		this.mesh = new Mesh(this.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
	}

	/** Writes instance `i` (must be below `capacity`). */
	set(
		i: number,
		x: number,
		y: number,
		z: number,
		size: number,
		r: number,
		g: number,
		b: number,
		a: number,
		seed: number
	): void {
		this.pos.setXYZ(i, x, y, z);
		this.size.setX(i, size);
		this.colour.setXYZW(i, r, g, b, a);
		this.seed.setX(i, seed);
	}

	/** Draws the first `count` instances. */
	commit(count: number): void {
		this.count = Math.min(count, this.capacity);
		this.geometry.instanceCount = this.count;
		this.mesh.visible = this.count > 0;
		this.pos.needsUpdate = true;
		this.size.needsUpdate = true;
		this.colour.needsUpdate = true;
		this.seed.needsUpdate = true;
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
	}
}
