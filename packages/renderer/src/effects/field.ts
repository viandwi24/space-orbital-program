/** Instanced camera-facing quads with per-instance position, size, colour and seed (plan 020). */
import {
	AdditiveBlending,
	DataTexture,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	NoColorSpace,
	NormalBlending,
	PlaneGeometry,
	RGBAFormat,
	RepeatWrapping,
	ShaderMaterial,
	UnsignedByteType,
	Vector3
} from 'three';
import { FIELD_VERT } from './shaders.ts';
import { SMOKE_NOISE_SIZE, bakeSmokeNoise } from './smoke-noise.ts';

export class BillboardField {
	readonly mesh: Mesh;
	readonly capacity: number;
	private readonly geometry = new InstancedBufferGeometry();
	private readonly material: ShaderMaterial;
	private readonly pos: InstancedBufferAttribute;
	private readonly size: InstancedBufferAttribute;
	private readonly colour: InstancedBufferAttribute;
	private readonly seed: InstancedBufferAttribute;
	private noise: DataTexture | null = null;
	count = 0;

	/** `noisy` gives the fragment shader the tiling noise texture of `smoke-noise.ts` as `uNoise`. */
	constructor(capacity: number, fragmentShader: string, additive: boolean, noisy = false) {
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
			uniforms: {
				uSunWorld: { value: new Vector3(0, 1, 0) },
				...(noisy ? { uNoise: { value: this.makeNoise() } } : {})
			},
			transparent: true,
			depthWrite: false,
			blending: additive ? AdditiveBlending : NormalBlending
		});
		this.mesh = new Mesh(this.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
	}

	private makeNoise(): DataTexture {
		const t = new DataTexture(
			bakeSmokeNoise(),
			SMOKE_NOISE_SIZE,
			SMOKE_NOISE_SIZE,
			RGBAFormat,
			UnsignedByteType
		);
		t.colorSpace = NoColorSpace;
		t.wrapS = RepeatWrapping;
		t.wrapT = RepeatWrapping;
		t.magFilter = LinearFilter;
		t.minFilter = LinearMipmapLinearFilter;
		t.generateMipmaps = true;
		t.needsUpdate = true;
		this.noise = t;
		return t;
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

	/** Direction to the sun in render space (smoke is lit by it). */
	setSun(x: number, y: number, z: number): void {
		(this.material.uniforms.uSunWorld!.value as Vector3).set(x, y, z);
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
		this.noise?.dispose();
	}
}
