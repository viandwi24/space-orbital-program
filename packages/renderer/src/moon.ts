/**
 * The moon pass (ADR 0054): an airless body drawn as three displaced meshes lit like the rest of the
 * scene. A whole-body icosphere is displaced by a baked cube map (about 580 m per texel); two
 * camera-centred grids (2 km and 16 km wide, 4 and 32 m per texel) take over near the camera. All
 * three read heights baked from the GLSL twin of `@orbital/core` `moonHeight`, so the ground the
 * camera sees is the ground the sim stands a lander on.
 */
import { moonHeight, type Vec3 } from '@orbital/core';
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	FloatType,
	HalfFloatType,
	IcosahedronGeometry,
	LinearFilter,
	Mesh,
	MeshLambertMaterial,
	NearestFilter,
	Object3D,
	OrthographicCamera,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	Uniform,
	Vector3,
	WebGLCubeRenderTarget,
	WebGLRenderTarget,
	type WebGLRenderer
} from 'three';
import {
	MOON_BAKE_DISTANCE,
	MOON_CUBE_SIZE,
	MOON_GLOBE_DETAIL,
	MOON_PATCHES,
	MOON_PATCH_MAX_ALTITUDE,
	MOON_SKIRT_DROP
} from './moon-model.ts';
import {
	moonBakeVertex,
	moonCubeFragment,
	moonFragmentBump,
	moonFragmentColor,
	moonFragmentCommon,
	moonGlobeBegin,
	moonGlobeNormal,
	moonGlobeVertex,
	moonPatchBegin,
	moonPatchFragment,
	moonPatchNormal,
	moonPatchVertex,
	moonVertexCommon
} from './shaders/moon.glsl.ts';
import {
	latticeDirection,
	patchFrame,
	patchNeedsRecentre,
	patchTexel,
	type PatchFrame
} from './terrain-patch.ts';
import { length, normalize, scale } from './vec.ts';

type U<T> = Uniform<T>;
const u = <T>(value: T): U<T> => new Uniform(value);

type PatchKind = 'mid' | 'fine';

interface PatchSlot {
	kind: PatchKind;
	span: number;
	texels: number;
	target: WebGLRenderTarget | null;
	frame: PatchFrame | null;
	wanted: PatchFrame | null;
	mesh: Mesh;
	uniforms: Record<string, U<unknown>>;
}

/** A grid of patch coordinates with a one-vertex skirt ring (`position.z = 1`) around it. */
export function patchGrid(quads: number): BufferGeometry {
	const side = quads + 3; // vertices: the grid (quads + 1) plus the ring on both sides
	const positions = new Float32Array(side * side * 3);
	for (let j = 0; j < side; j++) {
		for (let i = 0; i < side; i++) {
			const skirt = i === 0 || j === 0 || i === side - 1 || j === side - 1;
			const gi = Math.min(Math.max(i - 1, 0), quads);
			const gj = Math.min(Math.max(j - 1, 0), quads);
			const k = (j * side + i) * 3;
			positions[k] = -1 + (2 * gi) / quads;
			positions[k + 1] = -1 + (2 * gj) / quads;
			positions[k + 2] = skirt ? 1 : 0;
		}
	}
	const cells = side - 1;
	const indices = new Uint32Array(cells * cells * 6);
	let n = 0;
	for (let j = 0; j < cells; j++) {
		for (let i = 0; i < cells; i++) {
			const a = j * side + i;
			const b = a + 1;
			const c = a + side;
			const d = c + 1;
			indices.set([a, b, c, b, d, c], n);
			n += 6;
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(positions, 3));
	geometry.setIndex(new BufferAttribute(indices, 1));
	return geometry;
}

const FOOTPRINT = /* glsl */ `
uniform vec3 uCoverC;
uniform vec3 uCoverE;
uniform vec3 uCoverF;
uniform float uCoverK;
uniform float uCoverOn;
bool covered(vec3 n) {
	if (uCoverOn < 0.5) return false;
	float d = dot(n, uCoverC);
	if (d <= 0.0) return false;
	vec2 st = vec2(dot(n, uCoverE), dot(n, uCoverF)) / (d * uCoverK);
	return max(abs(st.x), abs(st.y)) < 0.97;
}
`;

export class MoonPass {
	readonly root = new Object3D();
	readonly radius: number;
	private readonly globe: Mesh;
	private readonly slots: Record<PatchKind, PatchSlot>;
	private readonly shared: Record<string, U<unknown>>;
	private cube: WebGLCubeRenderTarget | null = null;
	private readonly bakeScene: Scene;
	private readonly bakeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private readonly cubeMaterial: ShaderMaterial;
	private readonly patchMaterial: ShaderMaterial;
	private cubeWanted = false;
	/** Faces of the cube map baked so far; one face per frame keeps the first approach free of a hitch. */
	private cubeFaces = 0;
	private patchesOn = false;

	constructor(
		readonly id: string,
		radius: number,
		options: { tint?: [number, number, number] } = {}
	) {
		this.radius = radius;
		const tint = options.tint ?? [0.135, 0.13, 0.122];
		this.shared = {
			uRadius: u(radius),
			uTint: u(new Color().setRGB(tint[0], tint[1], tint[2]))
		};
		this.root.name = `moon:${id}`;

		const corner = new BufferGeometry();
		corner.setAttribute(
			'position',
			new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
		);
		this.cubeMaterial = new ShaderMaterial({
			vertexShader: moonBakeVertex,
			fragmentShader: moonCubeFragment,
			uniforms: { uRadius: this.shared.uRadius!, uFace: u(0) },
			depthTest: false,
			depthWrite: false
		});
		this.patchMaterial = new ShaderMaterial({
			vertexShader: moonBakeVertex,
			fragmentShader: moonPatchFragment,
			uniforms: {
				uRadius: this.shared.uRadius!,
				uPatchC: u(new Vector3()),
				uPatchE: u(new Vector3()),
				uPatchF: u(new Vector3()),
				uHalfTan: u(0.01)
			},
			depthTest: false,
			depthWrite: false
		});
		this.bakeScene = new Scene();
		const quad = new Mesh(corner, this.cubeMaterial);
		quad.frustumCulled = false;
		this.bakeScene.add(quad);
		this.bakeQuad = quad;

		const globeGeometry = new IcosahedronGeometry(1, MOON_GLOBE_DETAIL);
		const globeUniforms = {
			...this.shared,
			uCube: u<unknown>(null),
			uCubeOn: u(0),
			uCoverC: u(new Vector3(1, 0, 0)),
			uCoverE: u(new Vector3(0, 1, 0)),
			uCoverF: u(new Vector3(0, 0, 1)),
			uCoverK: u(0.01),
			uCoverOn: u(0)
		};
		this.globe = new Mesh(globeGeometry, this.material('globe', globeUniforms));
		this.globe.frustumCulled = false;
		this.globe.receiveShadow = true;
		this.globe.renderOrder = -5;
		this.globe.userData.uniforms = globeUniforms;
		this.root.add(this.globe);

		const makeSlot = (kind: PatchKind, order: number): PatchSlot => {
			const spec = MOON_PATCHES[kind];
			const uniforms: Record<string, U<unknown>> = {
				...this.shared,
				uPatch: u(null),
				uTexels: u(spec.texels),
				uC: u(new Vector3(1, 0, 0)),
				uE: u(new Vector3(0, 1, 0)),
				uF: u(new Vector3(0, 0, 1)),
				uK: u(spec.span / (2 * radius)),
				uHc: u(0),
				uDrop: u(MOON_SKIRT_DROP),
				uCoverC: u(new Vector3(1, 0, 0)),
				uCoverE: u(new Vector3(0, 1, 0)),
				uCoverF: u(new Vector3(0, 0, 1)),
				uCoverK: u(0.01),
				uCoverOn: u(0)
			};
			const mesh = new Mesh(patchGrid(spec.quads), this.material('patch', uniforms));
			mesh.frustumCulled = false;
			mesh.receiveShadow = true;
			mesh.visible = false;
			mesh.renderOrder = order;
			this.root.add(mesh);
			return {
				kind,
				span: spec.span,
				texels: spec.texels,
				target: null,
				frame: null,
				wanted: null,
				mesh,
				uniforms
			};
		};
		this.slots = { mid: makeSlot('mid', -4), fine: makeSlot('fine', -3) };
	}

	private bakeQuad: Mesh;

	private material(
		kind: 'globe' | 'patch',
		uniforms: Record<string, U<unknown>>
	): MeshLambertMaterial {
		const material = new MeshLambertMaterial({ color: 0xffffff });
		material.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, uniforms);
			const globe = kind === 'globe';
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					`#include <common>\n${moonVertexCommon}\n${globe ? moonGlobeVertex : moonPatchVertex}`
				)
				.replace('#include <beginnormal_vertex>', globe ? moonGlobeNormal : moonPatchNormal)
				.replace('#include <begin_vertex>', globe ? moonGlobeBegin : moonPatchBegin);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', `#include <common>\n${moonFragmentCommon}\n${FOOTPRINT}`)
				.replace('void main() {', 'void main() {\n\tif (covered(vMoonN)) discard;')
				.replace('#include <color_fragment>', `#include <color_fragment>\n${moonFragmentColor}`)
				.replace(
					'#include <normal_fragment_maps>',
					`#include <normal_fragment_maps>\n${moonFragmentBump}`
				);
		};
		material.customProgramCacheKey = () => `moon-${kind}`;
		return material;
	}

	/** Dev/screenshot hook: the regolith's base colour (linear RGB). */
	setTint(r: number, g: number, b: number): void {
		(this.shared.uTint as U<Color>).value.setRGB(r, g, b);
	}

	/** Height of the ground (the same field the sim uses) along a unit body-fixed direction, m. */
	groundHeight(direction: Vec3): number {
		return moonHeight(direction, this.radius);
	}

	/**
	 * Decide what to bake from the camera position (body-fixed, m from the body's centre): the cube map
	 * once the camera is near, the patches that follow the camera below `MOON_PATCH_MAX_ALTITUDE`.
	 */
	update(cameraBodyFixed: Vec3): void {
		const distance = length(cameraBodyFixed);
		if (distance < MOON_BAKE_DISTANCE * this.radius) this.cubeWanted = true;
		const direction = normalize(cameraBodyFixed);
		const altitude = distance - this.radius - this.groundHeight(direction);
		this.patchesOn = altitude < MOON_PATCH_MAX_ALTITUDE;
		for (const slot of Object.values(this.slots)) {
			if (!this.patchesOn) continue;
			if (patchNeedsRecentre(slot.frame, direction)) {
				slot.wanted = patchFrame(latticeDirection(direction, this.radius), this.radius, slot.span);
			}
		}
		const visible = (slot: PatchSlot): boolean => this.patchesOn && slot.frame !== null;
		this.slots.mid.mesh.visible = visible(this.slots.mid);
		this.slots.fine.mesh.visible = visible(this.slots.fine);
		this.setCover(this.globe.userData.uniforms as Record<string, U<unknown>>, this.slots.mid);
		this.setCover(this.slots.mid.uniforms, this.slots.fine);
	}

	private setCover(target: Record<string, U<unknown>>, by: PatchSlot): void {
		const on = this.patchesOn && by.frame !== null;
		(target.uCoverOn as U<number>).value = on ? 1 : 0;
		if (!by.frame) return;
		(target.uCoverC as U<Vector3>).value.set(
			by.frame.centre.x,
			by.frame.centre.y,
			by.frame.centre.z
		);
		(target.uCoverE as U<Vector3>).value.set(by.frame.east.x, by.frame.east.y, by.frame.east.z);
		(target.uCoverF as U<Vector3>).value.set(by.frame.north.x, by.frame.north.y, by.frame.north.z);
		(target.uCoverK as U<number>).value = by.frame.halfTan;
	}

	/** Render what `update` asked for. Needs a context, so the facade calls it every frame; Bun tests never do. */
	bake(gl: WebGLRenderer): void {
		if (!this.cubeWanted && !Object.values(this.slots).some((s) => s.wanted)) return;
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		if (this.cubeWanted && this.cubeFaces < 6) this.bakeCube(gl);
		for (const slot of Object.values(this.slots)) this.bakePatch(gl, slot);
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
	}

	private bakeCube(gl: WebGLRenderer): void {
		this.cube ??= new WebGLCubeRenderTarget(MOON_CUBE_SIZE, {
			type: HalfFloatType,
			format: RGBAFormat,
			generateMipmaps: false,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			depthBuffer: false
		});
		this.bakeQuad.material = this.cubeMaterial;
		this.cubeMaterial.uniforms.uFace!.value = this.cubeFaces;
		gl.setRenderTarget(this.cube, this.cubeFaces);
		gl.render(this.bakeScene, this.bakeCamera);
		this.cubeFaces++;
		if (this.cubeFaces < 6) return;
		const uniforms = this.globe.userData.uniforms as Record<string, U<unknown>>;
		uniforms.uCube!.value = this.cube.texture;
		(uniforms.uCubeOn as U<number>).value = 1;
	}

	private bakePatch(gl: WebGLRenderer, slot: PatchSlot): void {
		const frame = slot.wanted;
		if (!frame) return;
		if (!slot.target) {
			slot.target = new WebGLRenderTarget(slot.texels, slot.texels, {
				type: FloatType,
				format: RGBAFormat,
				generateMipmaps: false,
				minFilter: NearestFilter,
				magFilter: NearestFilter,
				depthBuffer: false
			});
			slot.uniforms.uPatch!.value = slot.target.texture;
		}
		this.bakeQuad.material = this.patchMaterial;
		const uniforms = this.patchMaterial.uniforms;
		(uniforms.uPatchC!.value as Vector3).set(frame.centre.x, frame.centre.y, frame.centre.z);
		(uniforms.uPatchE!.value as Vector3).set(frame.east.x, frame.east.y, frame.east.z);
		(uniforms.uPatchF!.value as Vector3).set(frame.north.x, frame.north.y, frame.north.z);
		uniforms.uHalfTan!.value = frame.halfTan;
		gl.setRenderTarget(slot.target);
		gl.render(this.bakeScene, this.bakeCamera);
		const hc = this.groundHeight(frame.centre);
		const m = slot.uniforms;
		(m.uC!.value as Vector3).set(frame.centre.x, frame.centre.y, frame.centre.z);
		(m.uE!.value as Vector3).set(frame.east.x, frame.east.y, frame.east.z);
		(m.uF!.value as Vector3).set(frame.north.x, frame.north.y, frame.north.z);
		m.uK!.value = frame.halfTan;
		m.uHc!.value = hc;
		const centre = scale(frame.centre, this.radius + hc);
		slot.mesh.position.set(centre.x, centre.y, centre.z);
		slot.frame = frame;
		slot.wanted = null;
	}

	/** Debug: the baked patch read back as heights (m), row by row, with its frame; null when not baked. */
	debugReadPatch(
		gl: WebGLRenderer,
		which: PatchKind
	): { frame: PatchFrame; size: number; heights: Float32Array } | null {
		const slot = this.slots[which];
		if (!slot.target || !slot.frame) return null;
		const size = slot.target.width;
		const raw = new Float32Array(size * size * 4);
		gl.readRenderTargetPixels(slot.target, 0, 0, size, size, raw);
		const heights = new Float32Array(size * size);
		for (let i = 0; i < heights.length; i++) heights[i] = raw[i * 4]!;
		return { frame: slot.frame, size, heights };
	}

	/** Texel size of a patch in metres (for the readback test). */
	texelMetres(which: PatchKind): number {
		const slot = this.slots[which];
		return slot.frame ? patchTexel(slot.frame, slot.texels) * this.radius : 0;
	}

	dispose(): void {
		this.globe.geometry.dispose();
		(this.globe.material as MeshLambertMaterial).dispose();
		for (const slot of Object.values(this.slots)) {
			slot.mesh.geometry.dispose();
			(slot.mesh.material as MeshLambertMaterial).dispose();
			slot.target?.dispose();
		}
		this.cube?.dispose();
		this.cubeMaterial.dispose();
		this.patchMaterial.dispose();
		this.bakeQuad.geometry.dispose();
	}
}
