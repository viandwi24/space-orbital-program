/**
 * The planet pass: sphere, ground, ocean, atmosphere, clouds, stars and sun in one fullscreen
 * shader (ADR 0027). Holds the GPU objects; the maths it needs lives in pure modules
 * (`planet-frame.ts`, `atmosphere-model.ts`, `sun.ts`).
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	AlwaysDepth,
	BufferAttribute,
	FloatType,
	HalfFloatType,
	OrthographicCamera,
	Scene,
	WebGLCubeRenderTarget,
	WebGLRenderTarget,
	type WebGLRenderer,
	BufferGeometry,
	ClampToEdgeWrapping,
	DataTexture,
	DepthTexture,
	LessEqualCompare,
	NearestFilter,
	DoubleSide,
	LinearFilter,
	LinearMipmapLinearFilter,
	Matrix3,
	Matrix4,
	Mesh,
	NoColorSpace,
	RGBAFormat,
	RGFormat,
	RepeatWrapping,
	ShaderMaterial,
	Quaternion,
	UnsignedByteType,
	Vector2,
	Vector3,
	type PerspectiveCamera,
	type Uniform
} from 'three';
import { TERRAIN_MAP_WIDTH, cachedPlanetMap } from '@orbital/core';
import { type Atmosphere, type RGB } from './atmosphere-model.ts';
import { SUN_DEPTH_H, SUN_DEPTH_MU, sunDepthTable } from './sun-depth-table.ts';

import type { PlanetFrame } from './planet-frame.ts';
import { normalize, vec } from './vec.ts';
import type { PresetSettings } from './presets.ts';
import { CIRRUS_ALTITUDE, CLOUD_ALTITUDE } from './cloud-model.ts';
import { PAD_RADIUS } from './site.ts';
import { planetFragment, planetVertex } from './shaders/planet.glsl.ts';
import {
	terrainBakeFragment,
	terrainBakeVertex,
	terrainPatchFragment
} from './shaders/terrain.glsl.ts';
import { marchFragment, marchVertex } from './shaders/march.glsl.ts';
import { siteAxes, surfaceUp } from './sun.ts';
import { ORIGIN_GRID } from './origin.ts';
import { MARCH_BLOCK, MARCH_CONE_PIXELS, flatSkipRadius } from './terrain-model.ts';
import {
	PATCH_MAX_ALTITUDE,
	PATCH_SPANS,
	latticeDirection,
	patchFrame,
	patchNeedsRecentre,
	patchTexel,
	type PatchFrame
} from './terrain-patch.ts';
import { WAVES, WAVE_PERIOD, waveNumber } from './water-model.ts';

type U<T> = Uniform<T>;
const u = <T>(value: T): U<T> => ({ value }) as U<T>;

/** Atmosphere uniforms shared by every material that scatters light (planet pass, environment sky). */
export interface AtmosphereUniforms {
	uR: U<number>;
	uAtmH: U<number>;
	uBetaR: U<Vector3>;
	uBetaM: U<number>;
	uHR: U<number>;
	uHM: U<number>;
	uMieG: U<number>;
	uSunIrr: U<number>;
	uSkyBoost: U<number>;
	uMieBoost: U<number>;
	/** Baked optical depth along rays to the top of the atmosphere (plan 039); shared by every material of one atmosphere. */
	uSunDepthLUT: U<DataTexture>;
}

const sunDepthTextures = new Map<string, DataTexture>();
/** The table of an atmosphere as a half-float RG texture, baked once per atmosphere (about 25 ms). */
function sunDepthTexture(atm: Atmosphere): DataTexture {
	const key = [atm.radius, atm.height, atm.rayleighHeight, atm.mieHeight].join('|');
	let texture = sunDepthTextures.get(key);
	if (!texture) {
		texture = new DataTexture(
			sunDepthTable(atm),
			SUN_DEPTH_MU,
			SUN_DEPTH_H,
			RGFormat,
			HalfFloatType
		);
		texture.minFilter = LinearFilter;
		texture.magFilter = LinearFilter;
		texture.wrapS = ClampToEdgeWrapping;
		texture.wrapT = ClampToEdgeWrapping;
		texture.generateMipmaps = false;
		texture.colorSpace = NoColorSpace;
		texture.needsUpdate = true;
		sunDepthTextures.set(key, texture);
	}
	return texture;
}

export function createAtmosphereUniforms(atm: Atmosphere): AtmosphereUniforms {
	return {
		uR: u(atm.radius),
		uAtmH: u(atm.height),
		uBetaR: u(new Vector3(...atm.betaRayleigh)),
		uBetaM: u(atm.betaMie),
		uHR: u(atm.rayleighHeight),
		uHM: u(atm.mieHeight),
		uMieG: u(atm.mieG),
		uSunIrr: u(atm.sunIrradiance),
		uSkyBoost: u(atm.skyBoost),
		uMieBoost: u(atm.mieBoost),
		uSunDepthLUT: u(sunDepthTexture(atm))
	};
}

export interface PlanetUpdate {
	camera: PerspectiveCamera;
	/** Drawing-buffer height in pixels (device pixels). */
	pixelHeight: number;
	frame: PlanetFrame;
	bodyRotation: Quat;
	/** Unit vector toward the sun, inertial. */
	sun: Vec3;
	/** Unit vector toward the sun, body-fixed. */
	sunBodyFixed: Vec3;
	/** Sky irradiance at the camera (radiance already times pi) and mean sky radiance. */
	ambient: RGB;
	skyColour: RGB;
	/** Sun elevation sine at the camera (for the ambient scale). */
	ambientRefMu: number;
	/** 0 by day to 1 at night: the launch-site floodlights are on. */
	siteLamps: number;
	cloudCover: number;
	cloudAngle: number;
	/** Seconds since the environment started (the sea is periodic in `WAVE_PERIOD`). */
	time: number;
	starBrightness: number;
	shadow: {
		on: boolean;
		map: DepthTexture | null;
		matrix: Matrix4;
		bias: number;
		texel: number;
	};
}

const qMatrix3 = (q: Quat, inverse: boolean): Matrix3 =>
	new Matrix3().setFromMatrix4(
		new Matrix4().makeRotationFromQuaternion(
			new Quaternion(inverse ? -q.x : q.x, inverse ? -q.y : q.y, inverse ? -q.z : q.z, q.w)
		)
	);

/** One camera-centred terrain patch (ADR 0044): its texture, the frame it was baked for and the one wanted next. */
interface PatchSlot {
	spanMetres: number;
	target: WebGLRenderTarget | null;
	/** The frame the texture holds (the shader uses it); null until baked. */
	frame: PatchFrame | null;
	/** A frame to bake at the top of the next frame. */
	wanted: PatchFrame | null;
	/** Uniform names of this slot in the planet pass. */
	names: { texture: string; c: string; e: string; f: string; k: string };
}

export class PlanetPass {
	readonly mesh: Mesh;
	readonly material: ShaderMaterial;
	readonly atmosphere: AtmosphereUniforms;
	/**
	 * A shadow sampler must always have a depth texture with a compare mode bound; three's own
	 * empty one is never uploaded (WebGL then reports a sampler/texture mismatch and draws nothing).
	 */
	private readonly dummyShadow = (() => {
		const t = new DepthTexture(1, 1);
		t.compareFunction = LessEqualCompare;
		t.minFilter = NearestFilter;
		t.magFilter = NearestFilter;
		t.needsUpdate = true;
		return t;
	})();
	private map: DataTexture;
	private mapWidth: number;
	/** Baked terrain heights (ADR 0036): a cube map of height (m) and tangent gradient. */
	private terrainTarget: WebGLCubeRenderTarget | null = null;
	private terrainSize: number;
	private terrainDirty = true;
	private readonly bake: { scene: Scene; camera: OrthographicCamera; material: ShaderMaterial };
	/** Camera-centred patches (ADR 0044): texels per side (0 = off) and the two windows. */
	private patchSize: number;
	private readonly patchBake: { scene: Scene; material: ShaderMaterial };
	private readonly patches: { fine: PatchSlot; mid: PatchSlot };
	/** The march prepass (plan 039): the planet pass's per-block start distances, and the size of the target it matches. */
	private readonly marchPass: { scene: Scene; material: ShaderMaterial };
	private marchTarget: WebGLRenderTarget | null = null;
	/** null until the first frame says whether float render targets work. */
	private marchSupported: boolean | null = null;
	private targetWidth = 1;
	private targetHeight = 1;
	private refineSteps: number;
	private fullSteps: number;
	/** The canonical biome map every height is read from (the preset's own when that is the same size). */
	private terrainMap: DataTexture | null = null;
	private readonly radius: number;
	private siteLatitude: number;
	private siteLongitude: number;

	constructor(
		atm: Atmosphere,
		settings: PresetSettings,
		site: { latitude: number; longitude: number }
	) {
		this.radius = atm.radius;
		this.siteLatitude = site.latitude;
		this.siteLongitude = site.longitude;
		this.atmosphere = createAtmosphereUniforms(atm);
		this.mapWidth = settings.mapWidth;
		this.map = this.buildMap(settings.mapWidth);
		this.terrainSize = settings.terrainSize;
		this.patchSize = settings.terrainPatch;
		this.refineSteps = settings.terrainRefineSteps;
		this.fullSteps = Math.max(1, settings.terrainSteps);
		const axes = siteAxes(site.latitude, site.longitude);
		const geometry = new BufferGeometry();
		geometry.setAttribute(
			'position',
			new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
		);
		this.material = new ShaderMaterial({
			name: 'planet-pass',
			vertexShader: planetVertex,
			fragmentShader: planetFragment,
			defines: this.definesFor(settings),
			uniforms: {
				...this.atmosphere,
				uInvProj: u(new Matrix4()),
				uCamRot: u(new Matrix3()),
				uCamPos: u(new Vector3()),
				uCamUp: u(new Vector3(0, 1, 0)),
				uAlt: u(1),
				uPixelAngle: u(0.001),
				uSunDir: u(new Vector3(1, 0, 0)),
				uSunBF: u(new Vector3(1, 0, 0)),
				uBodyInv: u(new Matrix3()),
				uCamLocal: u(new Vector3()),
				uAnchorCell: u(new Vector3()),
				uCamToSite: u(new Vector3()),
				uSiteEast: u(new Vector3(axes.east.x, axes.east.y, axes.east.z)),
				uSiteNorth: u(new Vector3(axes.north.x, axes.north.y, axes.north.z)),
				uSiteUp: u(new Vector3(axes.up.x, axes.up.y, axes.up.z)),
				uMap: u(this.map),
				uMapTexel: u((2 * Math.PI * atm.radius) / settings.mapWidth),
				uAmbient: u(new Vector3(0.2, 0.3, 0.5)),
				uAmbientRefMu: u(0.5),
				uSkyColour: u(new Vector3(0.2, 0.3, 0.5)),
				uCloudCover: u(0.45),
				uSiteLamps: u(0),
				uCloudAngle: u(0),
				uCloudAlt: u(atm.radius + CLOUD_ALTITUDE),
				uCirrusAlt: u(atm.radius + CIRRUS_ALTITUDE),
				uStarBright: u(1),
				uShadowOn: u(0),
				uShadowMap: u(this.dummyShadow),
				uShadowMatrix: u(new Matrix4()),
				uShadowBias: u(-0.0004),
				uShadowTexel: u(1 / 2048),
				uSiteRadius: u(PAD_RADIUS * 40),
				uTerrain: u<unknown>(null),
				uTerrainOn: u(0),
				uPatchFine: u<unknown>(null),
				uPatchMid: u<unknown>(null),
				uPatchLinear: u(0),
				uFineC: u(new Vector3(1, 0, 0)),
				uFineE: u(new Vector3(0, 0, 1)),
				uFineF: u(new Vector3(0, 1, 0)),
				uFineK: u(new Vector2(1, 0)),
				uMidC: u(new Vector3(1, 0, 0)),
				uMidE: u(new Vector3(0, 0, 1)),
				uMidF: u(new Vector3(0, 1, 0)),
				uMidK: u(new Vector2(1, 0)),
				uSkipR: u(0),
				uMarchStart: u<unknown>(null),
				uMarchOn: u(0),
				uMarchSteps: u(Math.max(1, settings.terrainSteps)),
				uTime: u(0),
				uWaveAnchor: u(WAVES.map(() => 0))
			},
			side: DoubleSide,
			depthTest: true,
			depthWrite: true,
			depthFunc: AlwaysDepth
		});
		this.mesh = new Mesh(geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = -10;
		this.mesh.name = 'planet-pass';

		const bakeMaterial = new ShaderMaterial({
			name: 'terrain-bake',
			vertexShader: terrainBakeVertex,
			fragmentShader: terrainBakeFragment,
			uniforms: {
				uMap: u(this.map),
				uFace: u(0),
				uTexel: u(0.001),
				uRadius: u(atm.radius),
				uSiteDir: u(new Vector3(1, 0, 0))
			},
			depthTest: false,
			depthWrite: false
		});
		const bakeScene = new Scene();
		const bakeMesh = new Mesh(geometry, bakeMaterial);
		bakeMesh.frustumCulled = false;
		bakeScene.add(bakeMesh);
		this.bake = {
			scene: bakeScene,
			camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
			material: bakeMaterial
		};
		const patchMaterial = new ShaderMaterial({
			name: 'terrain-patch-bake',
			vertexShader: terrainBakeVertex,
			fragmentShader: terrainPatchFragment,
			uniforms: {
				uMap: u(this.map),
				uTexel: u(0.0001),
				uRadius: u(atm.radius),
				uSiteDir: u(new Vector3(1, 0, 0)),
				uPatchC: u(new Vector3(1, 0, 0)),
				uPatchE: u(new Vector3(0, 0, 1)),
				uPatchF: u(new Vector3(0, 1, 0)),
				uHalfTan: u(0.01)
			},
			depthTest: false,
			depthWrite: false
		});
		const patchScene = new Scene();
		const patchMesh = new Mesh(geometry, patchMaterial);
		patchMesh.frustumCulled = false;
		patchScene.add(patchMesh);
		this.patchBake = { scene: patchScene, material: patchMaterial };
		const shared = this.material.uniforms;
		const marchMaterial = new ShaderMaterial({
			name: 'terrain-march-prepass',
			vertexShader: marchVertex,
			fragmentShader: marchFragment,
			defines: this.marchDefines(settings),
			uniforms: {
				...this.atmosphere,
				uBodyInv: shared.uBodyInv!,
				uPixelAngle: shared.uPixelAngle!,
				uInvProj: shared.uInvProj!,
				uCamRot: shared.uCamRot!,
				uCamUp: shared.uCamUp!,
				uAlt: shared.uAlt!,
				uTerrain: shared.uTerrain!,
				uTerrainOn: shared.uTerrainOn!,
				uPatchFine: shared.uPatchFine!,
				uPatchMid: shared.uPatchMid!,
				uPatchLinear: shared.uPatchLinear!,
				uFineC: shared.uFineC!,
				uFineE: shared.uFineE!,
				uFineF: shared.uFineF!,
				uFineK: shared.uFineK!,
				uMidC: shared.uMidC!,
				uMidE: shared.uMidE!,
				uMidF: shared.uMidF!,
				uMidK: shared.uMidK!,
				uSkipR: shared.uSkipR!,
				uMarchStart: shared.uMarchStart!,
				uMarchOn: shared.uMarchOn!,
				uMarchSteps: shared.uMarchSteps!,
				uFullSize: u(new Vector2(1, 1)),
				uConeAngle: u(0.002)
			},
			depthTest: false,
			depthWrite: false
		});
		const marchScene = new Scene();
		const marchMesh = new Mesh(geometry, marchMaterial);
		marchMesh.frustumCulled = false;
		marchScene.add(marchMesh);
		this.marchPass = { scene: marchScene, material: marchMaterial };
		this.patches = {
			fine: {
				spanMetres: PATCH_SPANS.fine,
				target: null,
				frame: null,
				wanted: null,
				names: { texture: 'uPatchFine', c: 'uFineC', e: 'uFineE', f: 'uFineF', k: 'uFineK' }
			},
			mid: {
				spanMetres: PATCH_SPANS.mid,
				target: null,
				frame: null,
				wanted: null,
				names: { texture: 'uPatchMid', c: 'uMidC', e: 'uMidE', f: 'uMidF', k: 'uMidK' }
			}
		};
		this.setSiteDirection(site.latitude, site.longitude);
	}

	private setSiteDirection(latitude: number, longitude: number): void {
		const up = surfaceUp(latitude, longitude);
		(this.bake.material.uniforms.uSiteDir!.value as Vector3).set(up.x, up.y, up.z);
		(this.patchBake.material.uniforms.uSiteDir!.value as Vector3).set(up.x, up.y, up.z);
		this.invalidateTerrain();
	}

	/** The baked heights are stale (site, map or resolution changed): bake the cube again and drop the patches. */
	private invalidateTerrain(): void {
		this.terrainDirty = true;
		for (const slot of [this.patches.fine, this.patches.mid]) {
			slot.frame = null;
			slot.wanted = null;
			(this.material.uniforms[slot.names.k]!.value as Vector2).y = 0;
		}
	}

	/**
	 * Renders the terrain cube map when the site, the map or the resolution changed (first frame,
	 * `setSite`, `setQuality`) and the camera-centred patches that `update` asked for (ADR 0044).
	 * Needs a context, so the facade calls it at the top of every frame; Bun tests never do.
	 */
	bakeTerrain(gl: WebGLRenderer): void {
		if (this.terrainSize <= 0) return;
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		if (this.terrainDirty) this.bakeCube(gl);
		if (this.patchSize > 0) {
			for (const slot of [this.patches.fine, this.patches.mid]) this.bakePatch(gl, slot);
		}
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
	}

	private bakeCube(gl: WebGLRenderer): void {
		if (!this.terrainTarget || this.terrainTarget.width !== this.terrainSize) {
			this.terrainTarget?.dispose();
			this.terrainTarget = new WebGLCubeRenderTarget(this.terrainSize, {
				type: HalfFloatType,
				format: RGBAFormat,
				generateMipmaps: false,
				minFilter: LinearFilter,
				magFilter: LinearFilter,
				depthBuffer: false
			});
			this.material.uniforms.uTerrain!.value = this.terrainTarget.texture;
		}
		const uniforms = this.bake.material.uniforms;
		uniforms.uMap!.value = this.heightMap();
		uniforms.uTexel!.value = (1.2 * Math.PI) / 2 / this.terrainSize;
		for (let face = 0; face < 6; face++) {
			uniforms.uFace!.value = face;
			gl.setRenderTarget(this.terrainTarget, face);
			gl.render(this.bake.scene, this.bake.camera);
		}
		this.terrainDirty = false;
		this.material.uniforms.uTerrainOn!.value = 1;
	}

	/** Bakes the patch frame `update` wanted, then points the planet pass at it. */
	private bakePatch(gl: WebGLRenderer, slot: PatchSlot): void {
		const frame = slot.wanted;
		if (!frame) return;
		// Float textures filter in hardware only with OES_texture_float_linear; otherwise the shader does it.
		const linear = gl.extensions.get('OES_texture_float_linear') !== null;
		this.material.uniforms.uPatchLinear!.value = linear ? 1 : 0;
		if (!slot.target || slot.target.width !== this.patchSize) {
			slot.target?.dispose();
			slot.target = new WebGLRenderTarget(this.patchSize, this.patchSize, {
				type: FloatType,
				format: RGBAFormat,
				generateMipmaps: false,
				minFilter: linear ? LinearFilter : NearestFilter,
				magFilter: linear ? LinearFilter : NearestFilter,
				wrapS: ClampToEdgeWrapping,
				wrapT: ClampToEdgeWrapping,
				depthBuffer: false
			});
			this.material.uniforms[slot.names.texture]!.value = slot.target.texture;
		}
		const uniforms = this.patchBake.material.uniforms;
		uniforms.uMap!.value = this.heightMap();
		uniforms.uPatchC!.value.set(frame.centre.x, frame.centre.y, frame.centre.z);
		uniforms.uPatchE!.value.set(frame.east.x, frame.east.y, frame.east.z);
		uniforms.uPatchF!.value.set(frame.north.x, frame.north.y, frame.north.z);
		uniforms.uHalfTan!.value = frame.halfTan;
		uniforms.uTexel!.value = patchTexel(frame, this.patchSize);
		gl.setRenderTarget(slot.target);
		gl.render(this.patchBake.scene, this.bake.camera);
		const m = this.material.uniforms;
		(m[slot.names.c]!.value as Vector3).set(frame.centre.x, frame.centre.y, frame.centre.z);
		(m[slot.names.e]!.value as Vector3).set(frame.east.x, frame.east.y, frame.east.z);
		(m[slot.names.f]!.value as Vector3).set(frame.north.x, frame.north.y, frame.north.z);
		(m[slot.names.k]!.value as Vector2).set(1 / frame.halfTan, 1);
		slot.frame = frame;
		slot.wanted = null;
	}

	/**
	 * Debug (plan 031 manual run): the baked patch `which` read back from the GPU, decoded to heights
	 * (m) at the texel centres, row by row, with the frame it was baked for; null when not baked.
	 */
	debugReadPatch(
		gl: WebGLRenderer,
		which: 'fine' | 'mid'
	): { frame: PatchFrame; size: number; heights: Float32Array } | null {
		const slot = this.patches[which];
		if (!slot.target || !slot.frame) return null;
		const size = slot.target.width;
		const raw = new Float32Array(size * size * 4);
		gl.readRenderTargetPixels(slot.target, 0, 0, size, size, raw);
		const heights = new Float32Array(size * size);
		for (let i = 0; i < heights.length; i++) {
			heights[i] = raw[i * 4]!;
		}
		return { frame: slot.frame, size, heights };
	}

	/** The biome map the heights are read from: the canonical width whatever the preset's colour map is. */
	private heightMap(): DataTexture {
		if (this.mapWidth === TERRAIN_MAP_WIDTH) return this.map;
		this.terrainMap ??= this.buildMap(TERRAIN_MAP_WIDTH);
		return this.terrainMap;
	}

	private buildMap(width: number): DataTexture {
		const m = cachedPlanetMap(width, this.siteLatitude, this.siteLongitude);
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

	private definesFor(s: PresetSettings): Record<string, number> {
		return {
			VIEW_SAMPLES: s.viewSamples,
			GROUND_OCTAVES: s.groundOctaves,
			CLOUD_OCTAVES: s.cloudOctaves,
			CLOUDS: 1,
			CLOUD_SHADOWS: s.cloudOctaves >= 4 ? 1 : 0,
			TERRAIN: s.terrainSteps > 0 ? 1 : 0,
			TERRAIN_STEPS: Math.max(1, s.terrainSteps),
			TERRAIN_PRE_STEPS: Math.max(1, s.terrainSteps),
			TERRAIN_SHADOW_STEPS: s.terrainShadowSteps
		};
	}

	/** The prepass only needs the march; the atmosphere functions it includes still want sample counts to compile. */
	private marchDefines(s: PresetSettings): Record<string, number> {
		return {
			TERRAIN: s.terrainSteps > 0 ? 1 : 0,
			TERRAIN_STEPS: Math.max(1, s.terrainSteps),
			TERRAIN_PRE_STEPS: Math.max(1, s.terrainSteps),
			TERRAIN_SHADOW_STEPS: 0,
			VIEW_SAMPLES: 1
		};
	}

	/** The size in pixels of the target the planet pass draws into; the prepass has one texel per block. */
	setTargetSize(width: number, height: number): void {
		this.targetWidth = Math.max(1, Math.round(width));
		this.targetHeight = Math.max(1, Math.round(height));
	}

	/**
	 * The march prepass (plan 039, ADR 0053): one texel per `MARCH_BLOCK` x `MARCH_BLOCK` pixels holding
	 * where that block's rays may first meet the ground. Needs a context, so the facade calls it every
	 * frame after `bakeTerrain`. Without float render targets the planet pass marches from the camera as
	 * before.
	 */
	marchPrepass(gl: WebGLRenderer): void {
		const u = this.material.uniforms;
		if (this.terrainSize <= 0 || (u.uTerrainOn!.value as number) < 0.5) {
			u.uMarchOn!.value = 0;
			u.uMarchSteps!.value = this.fullSteps;
			return;
		}
		this.marchSupported ??= gl.extensions.has('EXT_color_buffer_float');
		if (!this.marchSupported) {
			u.uMarchOn!.value = 0;
			u.uMarchSteps!.value = this.fullSteps;
			return;
		}
		const w = Math.ceil(this.targetWidth / MARCH_BLOCK);
		const h = Math.ceil(this.targetHeight / MARCH_BLOCK);
		if (!this.marchTarget || this.marchTarget.width !== w || this.marchTarget.height !== h) {
			this.marchTarget?.dispose();
			this.marchTarget = new WebGLRenderTarget(w, h, {
				type: FloatType,
				format: RGBAFormat,
				generateMipmaps: false,
				minFilter: NearestFilter,
				magFilter: NearestFilter,
				depthBuffer: false
			});
			u.uMarchStart!.value = this.marchTarget.texture;
		}
		const m = this.marchPass.material.uniforms;
		(m.uFullSize!.value as Vector2).set(this.targetWidth, this.targetHeight);
		m.uConeAngle!.value = MARCH_CONE_PIXELS * (u.uPixelAngle!.value as number);
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		gl.setRenderTarget(this.marchTarget);
		gl.render(this.marchPass.scene, this.bake.camera);
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
		u.uMarchOn!.value = 1;
		u.uMarchSteps!.value = this.refineSteps;
	}

	/**
	 * A material that is the planet pass compiled for another preset: it shares this pass's uniforms and
	 * is never drawn. Compiling it ahead (`WebGLRenderer.compileAsync`) fills three's program cache, so the
	 * switch to that preset reuses the program instead of compiling it in the middle of a frame (plan 039).
	 */
	variantFor(settings: PresetSettings): ShaderMaterial {
		const variant = new ShaderMaterial({
			name: 'planet-pass-variant',
			vertexShader: planetVertex,
			fragmentShader: planetFragment,
			defines: this.definesFor(settings),
			uniforms: this.material.uniforms,
			side: this.material.side,
			depthTest: this.material.depthTest,
			depthWrite: this.material.depthWrite,
			depthFunc: this.material.depthFunc
		});
		return variant;
	}

	/** Moves the painted launch site (pad, roads, aprons) to another surface point. */
	setSite(latitude: number, longitude: number): void {
		const moved = latitude !== this.siteLatitude || longitude !== this.siteLongitude;
		this.siteLatitude = latitude;
		this.siteLongitude = longitude;
		if (moved) {
			// The biome map is flattened around the site, and every height reads it.
			this.map.dispose();
			this.map = this.buildMap(this.mapWidth);
			this.material.uniforms.uMap!.value = this.map;
			this.terrainMap?.dispose();
			this.terrainMap = null;
		}
		this.setSiteDirection(latitude, longitude);
		const axes = siteAxes(latitude, longitude);
		const u = this.material.uniforms;
		(u.uSiteEast!.value as Vector3).set(axes.east.x, axes.east.y, axes.east.z);
		(u.uSiteNorth!.value as Vector3).set(axes.north.x, axes.north.y, axes.north.z);
		(u.uSiteUp!.value as Vector3).set(axes.up.x, axes.up.y, axes.up.z);
	}

	/** Phase of each wave at the 1024 m anchor, kept in float64 and reduced to [0, 2 pi) so the GPU never sees large phases. */
	private updateWaveAnchors(cell: Vec3): void {
		const axes = siteAxes(this.siteLatitude, this.siteLongitude);
		const out = this.material.uniforms.uWaveAnchor!.value as number[];
		WAVES.forEach((w, i) => {
			const dx = Math.cos(w.direction);
			const dy = Math.sin(w.direction);
			const d = {
				x: dx * axes.east.x + dy * axes.north.x,
				y: dx * axes.east.y + dy * axes.north.y,
				z: dx * axes.east.z + dy * axes.north.z
			};
			const along = 1024 * (d.x * cell.x + d.y * cell.y + d.z * cell.z);
			const phase = (waveNumber(w.wavelength) * along) % (2 * Math.PI);
			out[i] = phase < 0 ? phase + 2 * Math.PI : phase;
		});
	}

	/**
	 * Builds the biome maps of other widths ahead of a preset switch (they are cached per width and site):
	 * the first visit to `low` spent about a second in `buildMap` inside `setPreset` (plan 039).
	 */
	warmMaps(widths: readonly number[]): void {
		for (const width of widths) {
			if (width !== this.mapWidth) cachedPlanetMap(width, this.siteLatitude, this.siteLongitude);
		}
	}

	/** Applies a preset: recompiles for new sample counts, rebuilds the biome map at a new size. */
	setQuality(settings: PresetSettings): void {
		this.material.defines = this.definesFor(settings);
		this.material.needsUpdate = true;
		this.marchPass.material.defines = this.marchDefines(settings);
		this.marchPass.material.needsUpdate = true;
		this.refineSteps = settings.terrainRefineSteps;
		this.fullSteps = Math.max(1, settings.terrainSteps);
		if (settings.mapWidth !== this.mapWidth) {
			this.map.dispose();
			this.mapWidth = settings.mapWidth;
			this.map = this.buildMap(settings.mapWidth);
			this.material.uniforms.uMap!.value = this.map;
			this.material.uniforms.uMapTexel!.value = (2 * Math.PI * this.radius) / settings.mapWidth;
			this.terrainMap?.dispose();
			this.terrainMap = null;
			this.invalidateTerrain();
		}
		if (settings.terrainSize !== this.terrainSize) {
			this.terrainSize = settings.terrainSize;
			this.invalidateTerrain();
		}
		if (settings.terrainPatch !== this.patchSize) {
			this.patchSize = settings.terrainPatch;
			this.invalidateTerrain();
		}
	}

	/**
	 * Decides which patch frames the next `bakeTerrain` renders (ADR 0044): each patch follows the
	 * camera's ground direction, re-centred on a lattice when the camera leaves its core, and is
	 * unused above `PATCH_MAX_ALTITUDE`.
	 */
	private planPatches(frame: PlanetFrame): void {
		if (this.patchSize <= 0 || this.terrainSize <= 0) return;
		const camera = vec(
			frame.camLocal.x + frame.anchorCell.x * ORIGIN_GRID,
			frame.camLocal.y + frame.anchorCell.y * ORIGIN_GRID,
			frame.camLocal.z + frame.anchorCell.z * ORIGIN_GRID
		);
		const direction = normalize(camera);
		const high = frame.altitude > PATCH_MAX_ALTITUDE;
		for (const slot of [this.patches.fine, this.patches.mid]) {
			const k = this.material.uniforms[slot.names.k]!.value as Vector2;
			if (high) {
				k.y = 0;
				continue;
			}
			if (slot.frame && k.y === 0) k.y = 1;
			if (patchNeedsRecentre(slot.wanted ?? slot.frame, direction)) {
				slot.wanted = patchFrame(
					latticeDirection(direction, this.radius),
					this.radius,
					slot.spanMetres
				);
			}
		}
	}

	update(p: PlanetUpdate): void {
		const un = this.material.uniforms as Record<string, U<unknown>>;
		const set = <T>(k: string, fn: (v: T) => void): void => fn(un[k]!.value as T);
		p.camera.updateMatrixWorld();
		set<Matrix4>('uInvProj', (m) => m.copy(p.camera.projectionMatrixInverse));
		set<Matrix3>('uCamRot', (m) => m.setFromMatrix4(p.camera.matrixWorld));
		set<Vector3>('uCamPos', (v) => v.copy(p.camera.position));
		set<Vector3>('uCamUp', (v) => v.set(p.frame.up.x, p.frame.up.y, p.frame.up.z));
		un.uAlt!.value = p.frame.altitude;
		this.planPatches(p.frame);
		const toSite = p.frame.camToSite;
		const horizontal = Math.sqrt(
			Math.max(toSite.x ** 2 + toSite.y ** 2 + toSite.z ** 2 - p.frame.altitude ** 2, 0)
		);
		un.uSkipR!.value = flatSkipRadius(horizontal);
		un.uPixelAngle!.value =
			(2 * Math.tan((p.camera.fov * Math.PI) / 360)) / Math.max(1, p.pixelHeight);
		set<Vector3>('uSunDir', (v) => v.set(p.sun.x, p.sun.y, p.sun.z));
		set<Vector3>('uSunBF', (v) => v.set(p.sunBodyFixed.x, p.sunBodyFixed.y, p.sunBodyFixed.z));
		set<Matrix3>('uBodyInv', (m) => m.copy(qMatrix3(p.bodyRotation, true)));
		set<Vector3>('uCamLocal', (v) =>
			v.set(p.frame.camLocal.x, p.frame.camLocal.y, p.frame.camLocal.z)
		);
		set<Vector3>('uAnchorCell', (v) =>
			v.set(p.frame.anchorCell.x, p.frame.anchorCell.y, p.frame.anchorCell.z)
		);
		set<Vector3>('uCamToSite', (v) =>
			v.set(p.frame.camToSite.x, p.frame.camToSite.y, p.frame.camToSite.z)
		);
		set<Vector3>('uAmbient', (v) => v.set(...p.ambient));
		set<Vector3>('uSkyColour', (v) => v.set(...p.skyColour));
		un.uAmbientRefMu!.value = p.ambientRefMu;
		un.uCloudCover!.value = p.cloudCover;
		un.uSiteLamps!.value = p.siteLamps;
		un.uCloudAngle!.value = p.cloudAngle;
		un.uTime!.value = p.time % WAVE_PERIOD;
		this.updateWaveAnchors(p.frame.anchorCell);
		un.uStarBright!.value = p.starBrightness;
		un.uShadowOn!.value = p.shadow.on && p.shadow.map ? 1 : 0;
		un.uShadowMap!.value = p.shadow.map ?? this.dummyShadow;
		set<Matrix4>('uShadowMatrix', (m) => m.copy(p.shadow.matrix));
		un.uShadowBias!.value = p.shadow.bias;
		un.uShadowTexel!.value = p.shadow.texel;
	}

	dispose(): void {
		this.terrainTarget?.dispose();
		this.marchTarget?.dispose();
		this.marchPass.material.dispose();
		this.bake.material.dispose();
		this.patchBake.material.dispose();
		this.patches.fine.target?.dispose();
		this.patches.mid.target?.dispose();
		this.terrainMap?.dispose();
		this.dummyShadow.dispose();
		this.map.dispose();
		this.material.dispose();
		this.mesh.geometry.dispose();
	}
}
