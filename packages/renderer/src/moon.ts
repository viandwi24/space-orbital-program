/**
 * The moon pass (ADR 0054): an airless body drawn as three displaced meshes lit like the rest of the
 * scene. A whole-body icosphere is displaced by a baked cube map (about 580 m per texel); two
 * camera-centred grids (2 km and 16 km wide, 4 and 32 m per texel) take over near the camera. All
 * three read heights baked from the GLSL twin of `@orbital/core` `moonHeight`, so the ground the
 * camera sees is the ground the sim stands a lander on.
 */
import {
	TERRAIN_MAP_WIDTH,
	cachedPlanetMap,
	createTerrainField,
	moonHeight,
	stoneSalt,
	type TerrainField,
	type Vec3
} from '@orbital/core';
import {
	BufferAttribute,
	BufferGeometry,
	ClampToEdgeWrapping,
	Color,
	DataTexture,
	FloatType,
	HalfFloatType,
	IcosahedronGeometry,
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	MeshDepthMaterial,
	MeshLambertMaterial,
	NearestFilter,
	NoColorSpace,
	Object3D,
	OrthographicCamera,
	RGBADepthPacking,
	RGBAFormat,
	RepeatWrapping,
	Scene,
	ShaderChunk,
	ShaderMaterial,
	Sphere,
	Uniform,
	UnsignedByteType,
	Vector3,
	WebGLCubeRenderTarget,
	WebGLRenderTarget,
	type WebGLRenderer
} from 'three';
import {
	GROUND_SPECS,
	MOON_PATCHES,
	MOON_PATCH_MAX_ALTITUDE,
	type GroundKind,
	type GroundSpec
} from './moon-model.ts';
import {
	hillsCubeFragment,
	hillsFragmentBump,
	hillsFragmentColor,
	hillsFragmentCommon,
	hillsGlobeTail,
	hillsPatchFragment,
	hillsPatchTail,
	hillsVertexCommon,
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
	moonShadowCommon,
	moonShadowFragment,
	moonStoneBegin,
	moonStoneColor,
	moonStoneNormal,
	moonStoneVertex,
	moonVertexCommon
} from './shaders/moon.glsl.ts';
import { MoonStones } from './moon-stones.ts';
import { SHADOW_STEPS } from './terrain-shadow.ts';
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

/** The canonical biome map (the one the sim's height function reads) as a texture, for a hills body's bake and colours. */
function biomeTexture(): DataTexture {
	const m = cachedPlanetMap(TERRAIN_MAP_WIDTH);
	const t = new DataTexture(m.data, m.width, m.height, RGBAFormat, UnsignedByteType);
	t.colorSpace = NoColorSpace;
	t.wrapS = RepeatWrapping;
	t.wrapT = ClampToEdgeWrapping;
	t.magFilter = LinearFilter;
	t.minFilter = LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	return t;
}

/** A stone's shadow ray starts this far above the ground under it, m (its body is as high as that). */
const STONES_LIFT = 0.3;

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

/** `MeshLambertMaterial`'s directional light, with the terrain's sun visibility (`moonSunVis`, ADR 0068) on its colour. */
const LIGHTS_WITH_TERRAIN_SHADOW = ShaderChunk.lights_fragment_begin.replace(
	'getDirectionalLightInfo( directionalLight, directLight );',
	'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= moonSunVis;'
);

export class MoonPass {
	readonly root = new Object3D();
	readonly radius: number;
	/** The crater field seed of the body (ADR 0067). */
	readonly seed: number;
	/** The ground the pass draws (ADR 0090). */
	readonly kind: GroundKind;
	private readonly spec: GroundSpec;
	/** The sim's own height field of a hills body (the same function the GPU bake runs). */
	private hillsField: TerrainField | null = null;
	/** The biome map a hills body is baked and coloured from. */
	private readonly biome: DataTexture | null;
	/** Stones as instanced geometry round the camera (ADR 0068). */
	readonly stones: MoonStones;
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
	private readonly stoneCam: U<Vector3>;
	private readonly stonePosition = new Vector3();
	private stonesOn = true;

	constructor(
		readonly id: string,
		radius: number,
		options: { tint?: [number, number, number]; seed?: number; kind?: GroundKind } = {}
	) {
		this.radius = radius;
		this.seed = options.seed ?? 0;
		this.kind = options.kind ?? 'craters';
		this.spec = GROUND_SPECS[this.kind];
		this.biome = this.kind === 'hills' ? biomeTexture() : null;
		const hills = this.kind === 'hills';
		const tint = options.tint ?? [0.135, 0.13, 0.122];
		this.shared = {
			uRadius: u(radius),
			// the stones' lattice salt (core's `stoneSalt`): the shader hashes the same integers
			uStoneSalt: u(stoneSalt(this.seed)),
			uTint: u(new Color().setRGB(tint[0], tint[1], tint[2])),
			// unit body-fixed direction to the sun, and the share of the sun light the lit scene gets
			// (the vessel's own terrain shadow, ADR 0068): the ground divides it out again
			uSunBody: u(new Vector3(1, 0, 0)),
			uSunScale: u(1),
			// terrain shadows are the craters' (ADR 0090); a hills body's march constants would be wrong
			uShadowOn: u(hills ? 0 : 1),
			uShadowSteps: u(SHADOW_STEPS.high),
			uMap: u<unknown>(this.biome)
		};
		this.root.name = `moon:${id}`;

		const corner = new BufferGeometry();
		corner.setAttribute(
			'position',
			new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
		);
		this.cubeMaterial = new ShaderMaterial({
			vertexShader: moonBakeVertex,
			fragmentShader: hills ? hillsCubeFragment : moonCubeFragment,
			uniforms: {
				uRadius: this.shared.uRadius!,
				uFace: u(0),
				uSeed: u(this.seed),
				uMap: this.shared.uMap!,
				uSiteDir: u(new Vector3(1, 0, 0))
			},
			depthTest: false,
			depthWrite: false
		});
		this.patchMaterial = new ShaderMaterial({
			vertexShader: moonBakeVertex,
			fragmentShader: hills ? hillsPatchFragment : moonPatchFragment,
			uniforms: {
				uRadius: this.shared.uRadius!,
				uSeed: u(this.seed),
				uMap: this.shared.uMap!,
				uSiteDir: u(new Vector3(1, 0, 0)),
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

		const globeGeometry = new IcosahedronGeometry(1, this.spec.globeDetail);
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
		if (hills) {
			// the unit sphere is displaced in the vertex shader: tell the culling where the ground really is
			globeGeometry.boundingSphere = new Sphere(new Vector3(), radius + 6_000);
			this.globe.frustumCulled = true;
		}
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
				uDrop: u(this.spec.skirtDrop),
				uCoverC: u(new Vector3(1, 0, 0)),
				uCoverE: u(new Vector3(0, 1, 0)),
				uCoverF: u(new Vector3(0, 0, 1)),
				uCoverK: u(0.01),
				uCoverOn: u(0),
				// the next coarser patch, which a shadow ray enters when it leaves this one (set below)
				uSecPatch: u(null),
				uSecTexels: u(spec.texels),
				uSecC: u(new Vector3(1, 0, 0)),
				uSecE: u(new Vector3(0, 1, 0)),
				uSecF: u(new Vector3(0, 0, 1)),
				uSecK: u(0.01),
				uSecOn: u(0)
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
		// the fine patch's rays continue in the mid patch: the same uniform objects, so a re-bake shows at once
		const fine = this.slots.fine.uniforms;
		const mid = this.slots.mid.uniforms;
		fine.uSecPatch = mid.uPatch!;
		fine.uSecTexels = mid.uTexels!;
		fine.uSecC = mid.uC!;
		fine.uSecE = mid.uE!;
		fine.uSecF = mid.uF!;
		fine.uSecK = mid.uK!;

		const stoneUniforms: Record<string, U<unknown>> = {
			...this.slots.fine.uniforms,
			uStoneCam: u(new Vector3())
		};
		this.stoneCam = stoneUniforms.uStoneCam as U<Vector3>;
		this.stones = new MoonStones(
			radius,
			this.material('stone', stoneUniforms),
			this.stoneDepthMaterial(stoneUniforms),
			this.seed
		);
		this.root.add(this.stones.near, this.stones.far);
	}

	private bakeQuad: Mesh;

	private material(
		kind: 'globe' | 'patch' | 'stone',
		uniforms: Record<string, U<unknown>>
	): MeshLambertMaterial {
		const material = new MeshLambertMaterial({ color: 0xffffff });
		const hills = this.kind === 'hills';
		material.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, uniforms);
			const globe = kind === 'globe';
			const stone = kind === 'stone';
			const tail = hills ? (globe ? hillsGlobeTail : hillsPatchTail) : '';
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					`#include <common>\n${moonVertexCommon}\n${hills ? hillsVertexCommon : ''}${globe ? moonGlobeVertex : moonPatchVertex}${stone ? moonStoneVertex : ''}`
				)
				.replace(
					'#include <beginnormal_vertex>',
					globe ? moonGlobeNormal : stone ? moonStoneNormal : moonPatchNormal
				)
				.replace(
					'#include <begin_vertex>',
					`${globe ? moonGlobeBegin : stone ? moonStoneBegin : moonPatchBegin}${tail}`
				);
			if (hills) {
				// A hills body: the biome colours and a grain bump; no terrain shadows and no stones (ADR 0090).
				shader.fragmentShader = shader.fragmentShader
					.replace('#include <common>', `#include <common>\n${hillsFragmentCommon}\n${FOOTPRINT}`)
					.replace('void main() {', 'void main() {\n\tif (covered(vMoonN)) discard;')
					.replace('#include <color_fragment>', `#include <color_fragment>\n${hillsFragmentColor}`)
					.replace(
						'#include <normal_fragment_maps>',
						`#include <normal_fragment_maps>\n${hillsFragmentBump}`
					);
				return;
			}
			// Terrain shadows on the patches and the stones; the whole-body mesh is seen from too far for them.
			const shadowed = !globe;
			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <common>',
					`#include <common>\n${moonFragmentCommon}\n${FOOTPRINT}${shadowed ? moonShadowCommon : ''}`
				)
				.replace(
					'void main() {',
					stone ? 'void main() {' : 'void main() {\n\tif (covered(vMoonN)) discard;'
				)
				.replace(
					'#include <color_fragment>',
					`#include <color_fragment>\n${stone ? moonStoneColor : moonFragmentColor}`
				)
				.replace(
					'#include <normal_fragment_maps>',
					`#include <normal_fragment_maps>\n${stone ? '' : moonFragmentBump}${
						shadowed ? moonShadowFragment(stone ? STONES_LIFT : 0) : ''
					}`
				);
			if (shadowed) {
				shader.fragmentShader = shader.fragmentShader.replace(
					'#include <lights_fragment_begin>',
					LIGHTS_WITH_TERRAIN_SHADOW
				);
			}
		};
		material.customProgramCacheKey = () => `moon-${this.kind === 'hills' ? 'hills-' : ''}${kind}`;
		return material;
	}

	/** What the sun's shadow map draws of a stone: the same displacement as its vertex shader. */
	private stoneDepthMaterial(uniforms: Record<string, U<unknown>>): MeshDepthMaterial {
		const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
		material.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, uniforms);
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					`#include <common>\n${moonVertexCommon}\n${moonPatchVertex}${moonStoneVertex}`
				)
				.replace('#include <begin_vertex>', `${moonStoneNormal}\n${moonStoneBegin}`);
		};
		material.customProgramCacheKey = () => 'moon-stone-depth';
		return material;
	}

	/** Dev/screenshot hook: the regolith's base colour (linear RGB). */
	setTint(r: number, g: number, b: number): void {
		(this.shared.uTint as U<Color>).value.setRGB(r, g, b);
	}

	/** Height of the ground (the same field the sim uses) along a unit body-fixed direction, m. */
	groundHeight(direction: Vec3): number {
		if (this.kind === 'hills') {
			this.hillsField ??= createTerrainField({ radius: this.radius });
			return this.hillsField.heightAt(direction);
		}
		return moonHeight(direction, this.radius, this.seed);
	}

	/** Steps of the shadow march (`SHADOW_STEPS` of the graphics preset). */
	setShadowSteps(steps: number): void {
		(this.shared.uShadowSteps as U<number>).value = steps;
	}

	/** Dev/benchmark hook: the terrain shadows and the instanced stones on or off. */
	setDetail(shadows: boolean, stones: boolean): void {
		if (this.kind === 'craters') {
			(this.shared.uShadowOn as U<number>).value = shadows ? 1 : 0;
			this.stonesOn = stones;
		}
	}

	/**
	 * The sun for the terrain shadows: the unit body-fixed direction to it, and the share of the sun's
	 * light the lit scene gets (below 1 while the active vessel is in a terrain shadow, ADR 0068).
	 */
	setSun(direction: Vec3, scaleOfLight: number): void {
		(this.shared.uSunBody as U<Vector3>).value.set(direction.x, direction.y, direction.z);
		(this.shared.uSunScale as U<number>).value = scaleOfLight;
	}

	/**
	 * Decide what to bake from the camera position (body-fixed, m from the body's centre): the cube map
	 * once the camera is near, the patches that follow the camera below `MOON_PATCH_MAX_ALTITUDE`.
	 */
	update(cameraBodyFixed: Vec3): void {
		const distance = length(cameraBodyFixed);
		const bakeAt = this.spec.bakeDistance * this.radius;
		if (distance < bakeAt) this.cubeWanted = true;
		else if (this.spec.releaseCube && distance > 2 * bakeAt) this.releaseCube();
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
		// a ray leaving the fine patch continues in the mid one, when that is baked
		(this.slots.fine.uniforms.uSecOn as U<number>).value = visible(this.slots.mid) ? 1 : 0;
		// the camera in the stones' object space: body-fixed position minus the patch centre point
		const p = this.stonePosition.copy(this.slots.fine.mesh.position);
		this.stoneCam.value.set(
			cameraBodyFixed.x - p.x,
			cameraBodyFixed.y - p.y,
			cameraBodyFixed.z - p.z
		);
		this.stones.update(
			direction,
			altitude,
			this.patchesOn && this.stonesOn && this.kind === 'craters' ? this.slots.fine.frame : null
		);
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

	/** The camera is far from a hills body: its 50 MB cube map goes and the globe is a plain sphere until the camera returns. */
	private releaseCube(): void {
		if (!this.cubeWanted && !this.cube) return;
		this.cubeWanted = false;
		this.cubeFaces = 0;
		this.cube?.dispose();
		this.cube = null;
		const uniforms = this.globe.userData.uniforms as Record<string, U<unknown>>;
		uniforms.uCube!.value = null;
		(uniforms.uCubeOn as U<number>).value = 0;
	}

	private bakeCube(gl: WebGLRenderer): void {
		this.cube ??= new WebGLCubeRenderTarget(this.spec.cubeSize, {
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
		// the stones' vertex shader works in the fine patch's local space, like the patch mesh
		if (slot.kind === 'fine') this.stones.setOrigin(centre.x, centre.y, centre.z);
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
		this.stones.dispose();
		(this.stones.near.material as MeshLambertMaterial).dispose();
		this.cube?.dispose();
		this.biome?.dispose();
		this.cubeMaterial.dispose();
		this.patchMaterial.dispose();
		this.bakeQuad.geometry.dispose();
	}
}
