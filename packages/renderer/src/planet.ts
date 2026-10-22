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
import { LEGACY_ZONE, TERRAIN_MAP_WIDTH, cachedPlanetMap } from '@orbital/core';
import {
	LEGACY_TERRAIN,
	setZoneUniforms,
	zoneUniforms,
	type WorldTerrainSpec,
	type ZoneUniforms
} from './terrain-zones.ts';
import { type Atmosphere, type RGB } from './atmosphere-model.ts';
import { SUN_DEPTH_H, SUN_DEPTH_MU, sunDepthTable } from './sun-depth-table.ts';

import type { PlanetFrame } from './planet-frame.ts';
import { normalize, rotateInverse, vec } from './vec.ts';
import { auroraStrength, auroraTime, magneticAxis, magneticFrame } from './aurora-model.ts';
import type { PresetSettings } from './presets.ts';
import { CIRRUS_ALTITUDE, CLOUD_ALTITUDE } from './cloud-model.ts';
import { CLOUD_TOP } from './cloud-volume.ts';
import { PAD_RADIUS } from './site.ts';
import { planetFragment, planetVertex } from './shaders/planet.glsl.ts';
import {
	terrainBakeFragment,
	terrainBakeVertex,
	terrainPatchFragment
} from './shaders/terrain.glsl.ts';
import { marchFragment, marchVertex } from './shaders/march.glsl.ts';
import { upsampleFragment, upsampleVertex } from './shaders/upsample.glsl.ts';
import { HALF_PLANET_SCALE, budgetScale } from './half-res.ts';
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
import { CLOUD_MAP_H, CLOUD_MAP_OCTAVES, CLOUD_MAP_W, shaftStrength } from './light-shaft.ts';
import { cloudMapFragment } from './shaders/cloud-field.glsl.ts';
import { skyBakeFragment, skyBakeVertex } from './shaders/starfield.glsl.ts';
import { skyMapSize, skyTexelAngle } from './sky-model.ts';
import { DETAIL_SIZE, detailImage } from './detail-textures.ts';
import {
	SCALED_PASSES_PER_FRAME,
	scaledSpaceSize,
	scaledTexelMetres
} from './scaled-space-model.ts';
import { WAVES, WAVE_PERIOD, waveNumber } from './water-model.ts';

type U<T> = Uniform<T>;
const u = <T>(value: T): U<T> => ({ value }) as U<T>;

/** Atmosphere uniforms shared by every material that scatters light (planet pass, environment sky). */
export interface AtmosphereUniforms {
	uR: U<number>;
	uAtmH: U<number>;
	uBetaR: U<Vector3>;
	uBetaO: U<Vector3>;
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
/** The ground detail maps as a tiling, mipmapped RGBA8 texture (plan 364), one per pass. */
function detailTexture(): DataTexture {
	const t = new DataTexture(detailImage(), DETAIL_SIZE, DETAIL_SIZE, RGBAFormat, UnsignedByteType);
	t.wrapS = t.wrapT = RepeatWrapping;
	t.minFilter = LinearMipmapLinearFilter;
	t.magFilter = LinearFilter;
	t.generateMipmaps = true;
	t.colorSpace = NoColorSpace;
	t.needsUpdate = true;
	return t;
}

/** The table of an atmosphere as a half-float RGBA texture (Rayleigh, Mie, ozone), baked once per atmosphere (about 25 ms). */
function sunDepthTexture(atm: Atmosphere): DataTexture {
	const key = [atm.radius, atm.height, atm.rayleighHeight, atm.mieHeight, ...atm.betaOzone].join(
		'|'
	);
	let texture = sunDepthTextures.get(key);
	if (!texture) {
		texture = new DataTexture(
			sunDepthTable(atm),
			SUN_DEPTH_MU,
			SUN_DEPTH_H,
			RGBAFormat,
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
		uBetaO: u(new Vector3(...atm.betaOzone)),
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
	/** The environment asks for the sun's shadow on the ground (the TSL pass waits for the map, plan 370). */
	shadowWanted = false;
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
	/**
	 * A cube map of another size being baked one face per frame while `terrainTarget` keeps drawing
	 * (ADR 0055); swapped in when all six faces are done.
	 */
	private cubeJob: { target: WebGLCubeRenderTarget; face: number } | null = null;
	private readonly bake: { scene: Scene; camera: OrthographicCamera; material: ShaderMaterial };
	/** Camera-centred patches (ADR 0044): texels per side (0 = off) and the two windows. */
	private patchSize: number;
	private readonly patchBake: { scene: Scene; material: ShaderMaterial };
	/**
	 * Cloud coverage as an equirectangular map (plan 054, ADR 0070): the light shafts read it once per sample instead of
	 * evaluating the noise. Baked at the first frame and whenever the cover changes; `cover` is the value baked (-1: none).
	 */
	private readonly cloudMap: {
		target: WebGLRenderTarget;
		scene: Scene;
		camera: OrthographicCamera;
		material: ShaderMaterial;
		cover: number;
	};
	/**
	 * The night sky's octahedral map (plan 364, ADR 0306): the Milky Way, nebulae and haze, baked once
	 * (again when the preset wants another size); `size` is the size baked (0: none yet).
	 */
	private readonly skyBake: {
		target: WebGLRenderTarget | null;
		scene: Scene;
		camera: OrthographicCamera;
		size: number;
		wanted: number;
	};
	/**
	 * The scaled-space bake (plan 364, ADR 0306): albedo and normal cube maps of the whole planet from
	 * `surfaceAt`, a face's two maps a frame; `next` is the next pass (face × 2 + map), 12 when done.
	 */
	private readonly scaledBake: {
		material: ShaderMaterial;
		scene: Scene;
		camera: OrthographicCamera;
		albedo: WebGLCubeRenderTarget | null;
		normal: WebGLCubeRenderTarget | null;
		size: number;
		key: string;
		next: number;
	};
	/** The cloud map is kept up to date (shafts or map shadows on); otherwise it is baked once. */
	private shaftsWanted: boolean;
	/**
	 * Counts the height cube's bakes (a new site, seed or size): the scaled-space bake (plan 364)
	 * follows the heights, so it bakes again when this moves.
	 */
	terrainEpoch = 0;
	private readonly patches: { fine: PatchSlot; mid: PatchSlot };
	/** The march prepass (plan 039): the planet pass's per-block start distances, and the size of the target it matches. */
	private readonly marchPass: { scene: Scene; material: ShaderMaterial };
	private marchTarget: WebGLRenderTarget | null = null;
	/** null until the first frame says whether float render targets work. */
	private marchSupported: boolean | null = null;
	/** Size in pixels of the scene target the planet pass is drawn into (`passSize` is the pass's own). */
	private targetWidth = 1;
	private targetHeight = 1;
	/**
	 * The half-resolution rung (plan 050, ADR 0061): the planet pass draws into `halfTarget` (rgb radiance,
	 * alpha the fragment depth) and `upsample` stands in its place in the scene. `wantedScale` is what the
	 * host asked for, `activeScale` what the last frame did (1 without float render targets).
	 */
	private readonly half: { scene: Scene; mesh: Mesh; upsample: ShaderMaterial };
	/** The full-resolution redraw of the edge pixels over the upsample (plan 056); visible on the half rung only. */
	private readonly edge: ShaderMaterial;
	readonly edgeMesh: Mesh;
	private halfTarget: WebGLRenderTarget | null = null;
	private wantedScale = 1;
	private activeScale = 1;
	/** The pixel budget of the pass (plan 252, ADR 0234): 0 = none. */
	private pixelBudget = 0;
	private halfSupported: boolean | null = null;
	/** The pixel angle at the scene target's resolution (the pass's is that over `activeScale`). */
	private fullPixelAngle = 0.001;
	private refineSteps: number;
	private fullSteps: number;
	/** The canonical biome map every height is read from (the preset's own when that is the same size). */
	private terrainMap: DataTexture | null = null;
	private readonly radius: number;
	private readonly atmosphereHeight: number;
	/** Steps of the aurora march of the active preset, 0 = none. */
	private auroraSteps: number;
	/**
	 * Whether the pass is drawn with the aurora march compiled in. The march is a compile-time variant
	 * (`AURORA_STEPS`): the pass uses the program without it (the one of the build before plan 061) until the aurora is
	 * in reach, so a long branch that is never taken does not lengthen the program that draws the day (ADR 0093).
	 */
	private auroraLive = false;
	private current: PresetSettings;
	private siteLatitude: number;
	private siteLongitude: number;
	/** The world's terrain: seed and flat zones (ADR 0142); the bakes, the map and the lakes read it. */
	private terrain: WorldTerrainSpec;
	/** Zone and seed uniforms, one set shared by the planet pass and both bakes. */
	private readonly zones: ZoneUniforms;

	constructor(
		atm: Atmosphere,
		settings: PresetSettings,
		site: { latitude: number; longitude: number },
		/** The body has an aurora (its definition, `atmosphere.aurora`, plan 061). */
		private readonly auroraEnabled = true,
		/** The world's terrain; default the Legacy seed with one Legacy-sized zone at `site`. */
		terrain?: WorldTerrainSpec
	) {
		this.radius = atm.radius;
		this.atmosphereHeight = atm.height;
		this.auroraSteps = settings.auroraSteps;
		this.current = settings;
		this.siteLatitude = site.latitude;
		this.siteLongitude = site.longitude;
		this.terrain = terrain ?? {
			seed: LEGACY_TERRAIN.seed,
			zones: [{ ...LEGACY_ZONE, latitude: site.latitude, longitude: site.longitude }]
		};
		this.zones = zoneUniforms(this.terrain);
		this.atmosphere = createAtmosphereUniforms(atm);
		this.mapWidth = settings.mapWidth;
		this.map = this.buildMap(settings.mapWidth);
		this.terrainSize = settings.terrainSize;
		this.shaftsWanted = settings.shaftSteps > 0 || settings.cloudShadowMap;
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
				...this.zones,
				uMap: u(this.map),
				uMapTexel: u((2 * Math.PI * atm.radius) / settings.mapWidth),
				uAmbient: u(new Vector3(0.2, 0.3, 0.5)),
				uAmbientRefMu: u(0.5),
				uSkyColour: u(new Vector3(0.2, 0.3, 0.5)),
				uCloudCover: u(0.45),
				uSiteLamps: u(0),
				uCloudAngle: u(0),
				uCloudAlt: u(atm.radius + CLOUD_ALTITUDE),
				uCloudTop: u(atm.radius + CLOUD_TOP),
				uShaft: u(0),
				uAurora: u(0),
				uAuroraAxis: u(new Vector3(0, 1, 0)),
				uAuroraMid: u(new Vector3(1, 0, 0)),
				uAuroraSide: u(new Vector3(0, 0, 1)),
				uAuroraTime: u(0),
				uCirrusAlt: u(atm.radius + CIRRUS_ALTITUDE),
				uStarBright: u(1),
				uSkyMap: u<unknown>(null),
				uScaledA: u<unknown>(null),
				uScaledN: u<unknown>(null),
				uScaledTexelM: u(scaledTexelMetres(atm.radius, scaledSpaceSize(settings))),
				uScaledOn: u(0),
				uScaledMode: u(1),
				uDetailOn: u(1),
				uDetail: u(detailTexture()),
				uBakeFace: u(0),
				uBakeWhat: u(0),
				uBakeSize: u(1),
				uSkyTexel: u(skyTexelAngle(skyMapSize(settings.mapWidth))),
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
				uCloudMap: u<unknown>(null),
				uMarchStart: u<unknown>(null),
				uMarchOn: u(0),
				uMarchSteps: u(Math.max(1, settings.terrainSteps)),
				uTime: u(0),
				uPackDepth: u(0),
				uEdgeOnly: u(0),
				uSilhouetteAA: u(1),
				uEdgeHalf: u<unknown>(null),
				uEdgeFullSize: u(new Vector2(1, 1)),
				uEdgeHalfSize: u(new Vector2(1, 1)),
				uEdgeOctaves: u(32),
				uMarchScale: u(1),
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
		// The edge pass of the half rung (plan 056, ADR 0087): the same program drawn again at full resolution, over the
		// upsample, for the pixels whose half-resolution texels disagree (`uEdgeOnly`); it shares every uniform but these.
		this.edge = new ShaderMaterial({
			name: 'planet-edge',
			vertexShader: planetVertex,
			fragmentShader: planetFragment,
			defines: this.definesFor(settings),
			uniforms: {
				...this.material.uniforms,
				uPackDepth: u(0),
				uPixelAngle: u(0.001),
				uEdgeOnly: u(1),
				uEdgeHalf: u<unknown>(null),
				uEdgeFullSize: u(new Vector2(1, 1)),
				uEdgeHalfSize: u(new Vector2(1, 1)),
				uEdgeOctaves: u(32),
				uMarchScale: u(HALF_PLANET_SCALE)
			},
			side: DoubleSide,
			depthTest: true,
			depthWrite: true,
			depthFunc: AlwaysDepth
		});
		this.edgeMesh = new Mesh(geometry, this.edge);
		this.edgeMesh.frustumCulled = false;
		this.edgeMesh.renderOrder = -9;
		this.edgeMesh.name = 'planet-edge-pass';
		this.edgeMesh.visible = false;
		const upsample = new ShaderMaterial({
			name: 'planet-upsample',
			vertexShader: upsampleVertex,
			fragmentShader: upsampleFragment,
			uniforms: {
				uHalf: u<unknown>(null),
				uFullSize: u(new Vector2(1, 1)),
				uHalfSize: u(new Vector2(1, 1)),
				uOctaves: u(32)
			},
			side: DoubleSide,
			depthTest: true,
			depthWrite: true,
			depthFunc: AlwaysDepth
		});
		const halfScene = new Scene();
		const halfMesh = new Mesh(geometry, this.material);
		halfMesh.frustumCulled = false;
		halfScene.add(halfMesh);
		this.half = { scene: halfScene, mesh: halfMesh, upsample };

		const bakeMaterial = new ShaderMaterial({
			name: 'terrain-bake',
			vertexShader: terrainBakeVertex,
			fragmentShader: terrainBakeFragment,
			uniforms: {
				uMap: u(this.map),
				uFace: u(0),
				uTexel: u(0.001),
				uRadius: u(atm.radius),
				...this.zones
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
				...this.zones,
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
		const cloudMapMaterial = new ShaderMaterial({
			name: 'cloud-map-bake',
			vertexShader: terrainBakeVertex,
			fragmentShader: cloudMapFragment,
			defines: { CLOUD_MAP_OCTAVES },
			uniforms: { uR: u(atm.radius), uCloudCover: u(0.42) },
			depthTest: false,
			depthWrite: false
		});
		const cloudMapScene = new Scene();
		const cloudMapMesh = new Mesh(geometry, cloudMapMaterial);
		cloudMapMesh.frustumCulled = false;
		cloudMapScene.add(cloudMapMesh);
		const cloudMapTarget = new WebGLRenderTarget(CLOUD_MAP_W, CLOUD_MAP_H, {
			format: RGFormat,
			type: UnsignedByteType,
			depthBuffer: false,
			generateMipmaps: false,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			wrapS: RepeatWrapping,
			wrapT: ClampToEdgeWrapping
		});
		this.material.uniforms.uCloudMap!.value = cloudMapTarget.texture;
		const scaledMaterial = new ShaderMaterial({
			name: 'planet-scaled-bake',
			vertexShader: planetVertex,
			fragmentShader: planetFragment,
			defines: { ...this.definesFor(settings), SCALED_BAKE: 1 },
			// the bake reads the noise at absolute body-fixed positions: its own anchor at zero
			uniforms: { ...this.material.uniforms, uAnchorCell: u(new Vector3()) },
			depthTest: false,
			depthWrite: false
		});
		const scaledScene = new Scene();
		const scaledMesh = new Mesh(geometry, scaledMaterial);
		scaledMesh.frustumCulled = false;
		scaledScene.add(scaledMesh);
		this.scaledBake = {
			material: scaledMaterial,
			scene: scaledScene,
			camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
			albedo: null,
			normal: null,
			size: 0,
			key: '',
			next: 12
		};
		const skyScene = new Scene();
		const skyMesh = new Mesh(
			geometry,
			new ShaderMaterial({
				name: 'sky-map-bake',
				vertexShader: skyBakeVertex,
				fragmentShader: skyBakeFragment,
				depthTest: false,
				depthWrite: false
			})
		);
		skyMesh.frustumCulled = false;
		skyScene.add(skyMesh);
		this.skyBake = {
			target: null,
			scene: skyScene,
			camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
			size: 0,
			wanted: skyMapSize(settings.mapWidth)
		};
		this.cloudMap = {
			target: cloudMapTarget,
			scene: cloudMapScene,
			camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
			material: cloudMapMaterial,
			cover: -1
		};
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
		this.invalidateTerrain();
	}

	/**
	 * The world's terrain changed (another world, or the primary site moved): new uniforms, a new
	 * biome map, and every bake again.
	 */
	setTerrain(terrain: WorldTerrainSpec): void {
		setZoneUniforms(this.zones, terrain);
		const mapChanged =
			cachedPlanetMap(this.mapWidth, terrain) !== cachedPlanetMap(this.mapWidth, this.terrain);
		this.terrain = terrain;
		if (mapChanged) {
			// The biome map is flattened around the sites, and every height reads it.
			this.map.dispose();
			this.map = this.buildMap(this.mapWidth);
			this.material.uniforms.uMap!.value = this.map;
			this.bake.material.uniforms.uMap!.value = this.heightMap();
			this.patchBake.material.uniforms.uMap!.value = this.heightMap();
			this.terrainMap?.dispose();
			this.terrainMap = null;
		}
		this.invalidateTerrain();
	}

	/** The baked heights are stale (site changed): bake the cube again and drop the patches. */
	private invalidateTerrain(): void {
		this.terrainDirty = true;
		this.cubeJob?.target.dispose();
		this.cubeJob = null;
		this.resetPatches();
	}

	/** Bakes the cloud coverage map on the first frame (so its program compiles with the rest) and when the cover changes while shafts are on. */
	private bakeCloudMap(gl: WebGLRenderer): void {
		const cover = this.material.uniforms.uCloudCover!.value as number;
		const map = this.cloudMap;
		if (map.cover >= 0 && (!this.shaftsWanted || Math.abs(cover - map.cover) < 1e-4)) return;
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		map.material.uniforms.uCloudCover!.value = cover;
		gl.setRenderTarget(map.target);
		gl.render(map.scene, map.camera);
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
		map.cover = cover;
	}

	/**
	 * The scaled-space bake: once the heights are baked, again when they or the map change; two passes
	 * a frame (a face's albedo and normal). The ground reads it once every face is done.
	 */
	private bakeScaled(gl: WebGLRenderer): void {
		const b = this.scaledBake;
		const un = this.material.uniforms;
		if (this.terrainSize > 0 && (un.uTerrainOn!.value as number) < 0.5) return;
		const size = scaledSpaceSize(this.current);
		const key = `${this.terrainEpoch}:${this.map.uuid}:${this.terrainSize > 0}`;
		if (size !== b.size || key !== b.key) {
			if (size !== b.size) {
				b.albedo?.dispose();
				b.normal?.dispose();
				const make = (): WebGLCubeRenderTarget =>
					new WebGLCubeRenderTarget(size, {
						type: UnsignedByteType,
						format: RGBAFormat,
						generateMipmaps: true,
						minFilter: LinearMipmapLinearFilter,
						magFilter: LinearFilter,
						depthBuffer: false
					});
				b.albedo = make();
				b.normal = make();
			}
			b.size = size;
			b.key = key;
			b.next = 0;
			un.uScaledOn!.value = 0;
			un.uScaledTexelM!.value = scaledTexelMetres(this.radius, size);
		}
		if (b.next >= 12) return;
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		const bu = b.material.uniforms;
		bu.uBakeSize!.value = size;
		for (let i = 0; i < SCALED_PASSES_PER_FRAME && b.next < 12; i++, b.next++) {
			const face = b.next >> 1;
			const what = b.next & 1;
			bu.uBakeFace!.value = face;
			bu.uBakeWhat!.value = what;
			gl.setRenderTarget(what === 0 ? b.albedo : b.normal, face);
			gl.render(b.scene, b.camera);
		}
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
		if (b.next >= 12) {
			un.uScaledA!.value = b.albedo!.texture;
			un.uScaledN!.value = b.normal!.texture;
			un.uScaledOn!.value = 1;
		}
	}

	/** Bakes the sky's map at the first frame and when the preset wants another size (a few ms). */
	private bakeSkyMap(gl: WebGLRenderer): void {
		const sky = this.skyBake;
		if (sky.size === sky.wanted) return;
		sky.target?.dispose();
		sky.target = new WebGLRenderTarget(sky.wanted, sky.wanted, {
			type: HalfFloatType,
			format: RGBAFormat,
			depthBuffer: false,
			generateMipmaps: true,
			minFilter: LinearMipmapLinearFilter,
			magFilter: LinearFilter,
			wrapS: ClampToEdgeWrapping,
			wrapT: ClampToEdgeWrapping
		});
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		gl.setRenderTarget(sky.target);
		gl.render(sky.scene, sky.camera);
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
		sky.size = sky.wanted;
		this.material.uniforms.uSkyMap!.value = sky.target.texture;
		this.material.uniforms.uSkyTexel!.value = skyTexelAngle(sky.wanted);
	}

	private resetPatches(): void {
		for (const slot of [this.patches.fine, this.patches.mid]) {
			slot.frame = null;
			slot.wanted = null;
			(this.material.uniforms[slot.names.k]!.value as Vector2).y = 0;
		}
	}

	/**
	 * Renders the terrain cube map when the site changed or nothing is baked yet (first frame,
	 * `setSite`), at once; a change of resolution is baked one face per frame beside the map in use and
	 * swapped in when complete (ADR 0055). Also renders the camera-centred patches that `update` asked for
	 * (ADR 0044). Needs a context, so the facade calls it at the top of every frame; Bun tests never do.
	 */
	bakeTerrain(gl: WebGLRenderer): void {
		this.bakeCloudMap(gl);
		this.bakeSkyMap(gl);
		if (this.terrainSize <= 0) {
			this.bakeScaled(gl);
			return;
		}
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		let busy = false;
		if (this.debugRebake) {
			this.terrainDirty = true;
			for (const slot of [this.patches.fine, this.patches.mid]) slot.wanted ??= slot.frame;
		}
		if (this.terrainDirty || !this.terrainTarget) this.bakeCube(gl);
		else busy = this.stepCubeJob(gl);
		if (this.patchSize > 0) {
			// a patch whose texture has the old size is re-baked one per frame, not in a frame that baked a face
			let resizing = busy ? 0 : 1;
			for (const slot of [this.patches.fine, this.patches.mid]) {
				if (slot.target && slot.target.width !== this.patchSize) {
					if (resizing-- <= 0) continue;
				}
				this.bakePatch(gl, slot);
			}
		}
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
		// after the heights it reads (plan 364)
		this.bakeScaled(gl);
	}

	private newCubeTarget(size: number): WebGLCubeRenderTarget {
		return new WebGLCubeRenderTarget(size, {
			type: HalfFloatType,
			format: RGBAFormat,
			generateMipmaps: false,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			depthBuffer: false
		});
	}

	private bakeFace(gl: WebGLRenderer, target: WebGLCubeRenderTarget, face: number): void {
		const uniforms = this.bake.material.uniforms;
		uniforms.uMap!.value = this.heightMap();
		uniforms.uTexel!.value = (1.2 * Math.PI) / 2 / target.width;
		uniforms.uFace!.value = face;
		gl.setRenderTarget(target, face);
		gl.render(this.bake.scene, this.bake.camera);
	}

	/** All six faces in this frame: the first bake, and after the site moved. */
	private bakeCube(gl: WebGLRenderer): void {
		if (!this.terrainTarget || this.terrainTarget.width !== this.terrainSize) {
			this.terrainTarget?.dispose();
			this.terrainTarget = this.newCubeTarget(this.terrainSize);
			this.material.uniforms.uTerrain!.value = this.terrainTarget.texture;
		}
		for (let face = 0; face < 6; face++) this.bakeFace(gl, this.terrainTarget, face);
		this.terrainDirty = false;
		this.material.uniforms.uTerrainOn!.value = 1;
		this.terrainEpoch++;
	}

	/** One face of the cube map of the new size, when the preset changed it; swaps when all six are done. True when it baked one. */
	private stepCubeJob(gl: WebGLRenderer): boolean {
		if (this.cubeJob && this.cubeJob.target.width !== this.terrainSize) {
			this.cubeJob.target.dispose();
			this.cubeJob = null;
		}
		const current = this.terrainTarget;
		if (!current || current.width === this.terrainSize) return false;
		this.cubeJob ??= { target: this.newCubeTarget(this.terrainSize), face: 0 };
		const job = this.cubeJob;
		this.bakeFace(gl, job.target, job.face++);
		if (job.face < 6) return true;
		current.dispose();
		this.terrainTarget = job.target;
		this.material.uniforms.uTerrain!.value = job.target.texture;
		this.cubeJob = null;
		this.terrainEpoch++;
		return true;
	}

	/**
	 * The terrain bakes due now, for a renderer that bakes them itself (plan 261: the WebGPU pass,
	 * `tsl/terrain.ts`): the cube when it is stale (`cube`, at `cubeSize` texels a face), the patches
	 * `update` asked for, the map the heights read and the zone uniforms. Report each done with
	 * `markCubeBaked` and `markPatchBaked`, which set the uniforms the march reads.
	 */
	terrainJobs(): {
		cube: boolean;
		cubeSize: number;
		patchSize: number;
		patches: { slot: 'fine' | 'mid'; frame: PatchFrame }[];
		map: DataTexture;
		zones: ZoneUniforms;
	} {
		const patches: { slot: 'fine' | 'mid'; frame: PatchFrame }[] = [];
		if (this.patchSize > 0)
			for (const slot of ['fine', 'mid'] as const) {
				// plan 068's rebake measurement bakes the patches in place every frame too
				const frame =
					this.patches[slot].wanted ?? (this.debugRebake ? this.patches[slot].frame : null);
				if (frame) patches.push({ slot, frame });
			}
		return {
			cube: this.terrainSize > 0 && (this.terrainDirty || this.debugRebake),
			cubeSize: this.terrainSize,
			patchSize: this.patchSize,
			patches,
			map: this.heightMap(),
			zones: this.zones
		};
	}

	/** The cube of `terrainJobs` is baked: the march may read the heights. */
	markCubeBaked(): void {
		this.terrainEpoch++;
		this.terrainDirty = false;
		this.material.uniforms.uTerrainOn!.value = 1;
	}

	/** A patch of `terrainJobs` is baked for `frame`: the march reads it inside its window. */
	markPatchBaked(which: 'fine' | 'mid', frame: PatchFrame): void {
		const slot = this.patches[which];
		const m = this.material.uniforms;
		(m[slot.names.c]!.value as Vector3).set(frame.centre.x, frame.centre.y, frame.centre.z);
		(m[slot.names.e]!.value as Vector3).set(frame.east.x, frame.east.y, frame.east.z);
		(m[slot.names.f]!.value as Vector3).set(frame.north.x, frame.north.y, frame.north.z);
		(m[slot.names.k]!.value as Vector2).set(1 / frame.halfTan, 1);
		slot.frame = frame;
		slot.wanted = null;
	}

	/** Bakes the patch frame `update` wanted, then points the planet pass at it. */
	private bakePatch(gl: WebGLRenderer, slot: PatchSlot): void {
		const frame = slot.wanted;
		if (!frame) return;
		// Float textures filter in hardware only with OES_texture_float_linear; otherwise the shader does it.
		const linear = gl.extensions.get('OES_texture_float_linear') !== null;
		this.material.uniforms.uPatchLinear!.value = linear ? 1 : 0;
		// A new size is baked into a new target and swapped in below, so the old texture draws until then.
		const resized = !slot.target || slot.target.width !== this.patchSize;
		const target = resized
			? new WebGLRenderTarget(this.patchSize, this.patchSize, {
					type: FloatType,
					format: RGBAFormat,
					generateMipmaps: false,
					minFilter: linear ? LinearFilter : NearestFilter,
					magFilter: linear ? LinearFilter : NearestFilter,
					wrapS: ClampToEdgeWrapping,
					wrapT: ClampToEdgeWrapping,
					depthBuffer: false
				})
			: slot.target!;
		const uniforms = this.patchBake.material.uniforms;
		uniforms.uMap!.value = this.heightMap();
		uniforms.uPatchC!.value.set(frame.centre.x, frame.centre.y, frame.centre.z);
		uniforms.uPatchE!.value.set(frame.east.x, frame.east.y, frame.east.z);
		uniforms.uPatchF!.value.set(frame.north.x, frame.north.y, frame.north.z);
		uniforms.uHalfTan!.value = frame.halfTan;
		uniforms.uTexel!.value = patchTexel(frame, this.patchSize);
		gl.setRenderTarget(target);
		gl.render(this.patchBake.scene, this.bake.camera);
		if (resized) {
			slot.target?.dispose();
			slot.target = target;
			this.material.uniforms[slot.names.texture]!.value = target.texture;
		}
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
	/**
	 * Plan 068's measurement (development only): with `rebake` on, every frame bakes the cube and
	 * both patches again, so a frame benchmark with and without it gives the bake cost.
	 * `gradient` picks the bake program: `analytic` (the shipped one, ADR 0116), `fd` (the forward
	 * differences of before plan 068, two extra heights per texel) or `none` (one height, no gradient).
	 */
	/** Plan 133: the silhouette coverage on (the shipped default) or off, for before/after screenshots. */
	/** Plan 364: the scaled-space bake as drawn (`on`), never (`off`) or for every ground pixel (`only`). */
	debugScaledSpace(mode: 'on' | 'off' | 'only'): void {
		(this.material.uniforms['uScaledMode'] as { value: number }).value =
			mode === 'off' ? 0 : mode === 'only' ? 2 : 1;
	}

	/** Plan 364: the triplanar ground detail on or off (its cost and look). */
	debugGroundDetail(on: boolean): void {
		(this.material.uniforms['uDetailOn'] as { value: number }).value = on ? 1 : 0;
	}

	debugSilhouetteAA(on: boolean): void {
		(this.material.uniforms['uSilhouetteAA'] as { value: number }).value = on ? 1 : 0;
	}

	debugBakeMode(rebake: boolean, gradient: 'analytic' | 'fd' | 'none'): void {
		this.debugRebake = rebake;
		for (const m of [this.bake.material, this.patchBake.material]) {
			const { TERRAIN_NO_GRADIENT: _a, TERRAIN_FD_GRADIENT: _b, ...rest } = m.defines ?? {};
			m.defines =
				gradient === 'none'
					? { ...rest, TERRAIN_NO_GRADIENT: 1 }
					: gradient === 'fd'
						? { ...rest, TERRAIN_FD_GRADIENT: 1 }
						: rest;
			m.needsUpdate = true;
		}
		this.terrainDirty = true;
	}
	private debugRebake = false;

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
		const m = cachedPlanetMap(width, this.terrain);
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

	private definesFor(s: PresetSettings, aurora = this.auroraLive): Record<string, number> {
		return {
			VIEW_SAMPLES: s.viewSamples,
			GROUND_OCTAVES: s.groundOctaves,
			CLOUD_OCTAVES: s.cloudOctaves,
			CLOUD_STEPS: s.cloudSteps,
			CLOUD_DETAIL: s.cloudDetail,
			CLOUDS: 1,
			SHAFT_STEPS: s.shaftSteps,
			AURORA_STEPS: aurora && this.auroraEnabled ? s.auroraSteps : 0,
			SHAFT_TERRAIN: s.terrainSteps > 0 ? s.shaftTerrain : 0,
			CLOUD_SHADOW_MAP: s.cloudShadowMap ? 1 : 0,
			CLOUD_SHADOWS: s.cloudShadowOctaves > 0 ? 1 : 0,
			CLOUD_SHADOW_OCTAVES: Math.max(1, s.cloudShadowOctaves),
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

	/** Size in pixels of what the planet pass draws into: the scene target, or half of it on the half rung. */
	private passSize(): { width: number; height: number } {
		return {
			width: Math.max(1, Math.round(this.targetWidth * this.activeScale)),
			height: Math.max(1, Math.round(this.targetHeight * this.activeScale))
		};
	}

	/**
	 * Asks for the planet pass at `HALF_PLANET_SCALE` of the scene target's side (plan 050) or at full
	 * size (1). Takes effect at the next `beginFrame`; no program is compiled by the switch.
	 */
	setPlanetScale(scale: number): void {
		this.wantedScale = scale < 1 ? HALF_PLANET_SCALE : 1;
	}

	/**
	 * The most pixels the planet pass may draw (plan 252, ADR 0234), or 0 for no limit. The pass runs at
	 * the smaller of this budget's scale and what `setPlanetScale` asked for, so a Retina screen starts on
	 * a fractional rung and the governor's half rung still goes lower. Takes effect at the next `beginFrame`.
	 */
	setPixelBudget(pixels: number): void {
		this.pixelBudget = pixels > 0 ? pixels : 0;
	}

	/** The scale of the planet pass for the governor's wish and the budget, before the float-target check. */
	private scaleWanted(): number {
		return Math.min(
			this.wantedScale,
			budgetScale(this.targetWidth, this.targetHeight, this.pixelBudget)
		);
	}

	/** The material of the full-resolution upsample, for `precompile`. */
	get upsampleMaterial(): ShaderMaterial {
		return this.half.upsample;
	}

	get planetScale(): number {
		return this.activeScale;
	}

	/** Whether the context can render the half-resolution pass (float colour attachments). */
	halfAvailable(gl: WebGLRenderer): boolean {
		this.halfSupported ??= gl.extensions.has('EXT_color_buffer_float');
		return this.halfSupported;
	}

	/**
	 * Top of every frame, before the march prepass: settles which resolution the planet pass runs at and
	 * puts the matching mesh material in the scene (the pass itself, or the upsample that replaces it).
	 */
	beginFrame(gl: WebGLRenderer): void {
		const wanted = this.scaleWanted();
		this.activeScale = wanted < 1 && this.halfAvailable(gl) ? wanted : 1;
		const half = this.activeScale < 1;
		// the edge pass draws full-resolution pixels: its march texel is the pass's own, `activeScale` smaller
		this.edge.uniforms.uMarchScale!.value = this.activeScale;
		this.mesh.material = half ? this.half.upsample : this.material;
		this.edgeMesh.visible = half;
		this.edge.uniforms.uPixelAngle!.value = this.fullPixelAngle;
		this.material.uniforms.uPackDepth!.value = half ? 1 : 0;
		this.material.uniforms.uPixelAngle!.value = this.fullPixelAngle / this.activeScale;
	}

	/**
	 * The half-resolution planet pass itself, after `marchPrepass`: draws the planet material into the
	 * float target; the scene's upsample reads it. Does nothing on the full-resolution rung.
	 */
	drawHalf(gl: WebGLRenderer, camera: PerspectiveCamera): void {
		if (this.activeScale >= 1) {
			this.halfTarget?.dispose();
			this.halfTarget = null;
			return;
		}
		const { width, height } = this.passSize();
		if (!this.halfTarget || this.halfTarget.width !== width || this.halfTarget.height !== height) {
			this.halfTarget?.dispose();
			this.halfTarget = new WebGLRenderTarget(width, height, {
				type: FloatType,
				format: RGBAFormat,
				generateMipmaps: false,
				minFilter: NearestFilter,
				magFilter: NearestFilter,
				depthBuffer: false
			});
		}
		const up = this.half.upsample.uniforms;
		up.uHalf!.value = this.halfTarget.texture;
		(up.uFullSize!.value as Vector2).set(this.targetWidth, this.targetHeight);
		(up.uHalfSize!.value as Vector2).set(width, height);
		up.uOctaves!.value = Math.log2(camera.far + 1);
		const ed = this.edge.uniforms;
		ed.uEdgeHalf!.value = this.halfTarget.texture;
		(ed.uEdgeFullSize!.value as Vector2).set(this.targetWidth, this.targetHeight);
		(ed.uEdgeHalfSize!.value as Vector2).set(width, height);
		ed.uEdgeOctaves!.value = Math.log2(camera.far + 1);
		const previous = gl.getRenderTarget();
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		gl.setRenderTarget(this.halfTarget);
		gl.render(this.half.scene, camera);
		gl.setRenderTarget(previous);
		gl.autoClear = autoClear;
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
		const pass = this.passSize();
		const w = Math.ceil(pass.width / MARCH_BLOCK);
		const h = Math.ceil(pass.height / MARCH_BLOCK);
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
		(m.uFullSize!.value as Vector2).set(pass.width, pass.height);
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
			defines: this.definesFor(settings, false),
			uniforms: this.material.uniforms,
			side: this.material.side,
			depthTest: this.material.depthTest,
			depthWrite: this.material.depthWrite,
			depthFunc: this.material.depthFunc
		});
		return variant;
	}

	/** The planet pass of `settings` with the aurora march compiled in, for `compileAsync` ahead of the first time the aurora is in reach; null when there is none to draw. */
	auroraVariantFor(settings: PresetSettings): ShaderMaterial | null {
		if (!this.auroraEnabled || settings.auroraSteps <= 0) return null;
		return new ShaderMaterial({
			name: 'planet-pass-aurora-variant',
			vertexShader: planetVertex,
			fragmentShader: planetFragment,
			defines: this.definesFor(settings, true),
			uniforms: this.material.uniforms,
			side: this.material.side,
			depthTest: this.material.depthTest,
			depthWrite: this.material.depthWrite,
			depthFunc: this.material.depthFunc
		});
	}

	/** The march prepass compiled for another preset, the same way as `variantFor` (plan 048). */
	marchVariantFor(settings: PresetSettings): ShaderMaterial {
		return new ShaderMaterial({
			name: 'terrain-march-prepass-variant',
			vertexShader: marchVertex,
			fragmentShader: marchFragment,
			defines: this.marchDefines(settings),
			uniforms: this.marchPass.material.uniforms,
			depthTest: false,
			depthWrite: false
		});
	}

	/** Moves the painted launch site (pad, roads, aprons) to another surface point. */
	setSite(latitude: number, longitude: number): void {
		const moved = latitude !== this.siteLatitude || longitude !== this.siteLongitude;
		this.siteLatitude = latitude;
		this.siteLongitude = longitude;
		// the primary zone follows the painted site
		if (moved) {
			const [primary, ...rest] = this.terrain.zones;
			this.setTerrain({ ...this.terrain, zones: [{ ...primary!, latitude, longitude }, ...rest] });
		}
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
			if (width !== this.mapWidth) cachedPlanetMap(width, this.terrain);
		}
	}

	/** Applies a preset: recompiles for new sample counts, rebuilds the biome map at a new size. */
	setQuality(settings: PresetSettings): void {
		this.shaftsWanted = settings.shaftSteps > 0 || settings.cloudShadowMap;
		this.auroraSteps = settings.auroraSteps;
		this.current = settings;
		this.skyBake.wanted = skyMapSize(settings.mapWidth);
		this.material.defines = this.definesFor(settings);
		this.material.needsUpdate = true;
		this.edge.defines = this.definesFor(settings);
		this.scaledBake.material.defines = { ...this.definesFor(settings), SCALED_BAKE: 1 };
		this.scaledBake.material.needsUpdate = true;
		this.edge.needsUpdate = true;
		this.marchPass.material.defines = this.marchDefines(settings);
		this.marchPass.material.needsUpdate = true;
		this.refineSteps = settings.terrainRefineSteps;
		this.fullSteps = Math.max(1, settings.terrainSteps);
		if (settings.mapWidth !== this.mapWidth) {
			// The heights read the canonical-width map whatever the colour map's width is, so the baked
			// terrain stays valid (ADR 0055). Hand the canonical map over instead of dropping it.
			if (this.mapWidth === TERRAIN_MAP_WIDTH) {
				this.terrainMap?.dispose();
				this.terrainMap = this.map;
			} else {
				this.map.dispose();
				if (settings.mapWidth === TERRAIN_MAP_WIDTH) {
					this.terrainMap?.dispose();
					this.terrainMap = null;
				}
			}
			this.mapWidth = settings.mapWidth;
			this.map = this.buildMap(settings.mapWidth);
			this.material.uniforms.uMap!.value = this.map;
			this.material.uniforms.uMapTexel!.value = (2 * Math.PI * this.radius) / settings.mapWidth;
		}
		// A new cube size is baked in the background by `bakeTerrain`; it keeps the baked map until then.
		this.terrainSize = settings.terrainSize;
		if (settings.terrainPatch !== this.patchSize) {
			this.patchSize = settings.terrainPatch;
			// Re-bake the frames the patches hold at the new size, one per frame; off clears them.
			if (this.patchSize <= 0) this.resetPatches();
			else {
				for (const slot of [this.patches.fine, this.patches.mid]) slot.wanted ??= slot.frame;
			}
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
		this.fullPixelAngle =
			(2 * Math.tan((p.camera.fov * Math.PI) / 360)) / Math.max(1, p.pixelHeight);
		un.uPixelAngle!.value = this.fullPixelAngle / this.activeScale;
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
		un.uShaft!.value = shaftStrength(
			Math.asin(Math.max(-1, Math.min(1, p.ambientRefMu))),
			p.frame.altitude
		);
		this.updateAurora(un, p);
		un.uSiteLamps!.value = p.siteLamps;
		un.uCloudAngle!.value = p.cloudAngle;
		un.uTime!.value = p.time % WAVE_PERIOD;
		this.updateWaveAnchors(p.frame.anchorCell);
		un.uStarBright!.value = p.starBrightness;
		this.shadowWanted = p.shadow.on;
		un.uShadowOn!.value = p.shadow.on && p.shadow.map ? 1 : 0;
		un.uShadowMap!.value = p.shadow.map ?? this.dummyShadow;
		set<Matrix4>('uShadowMatrix', (m) => m.copy(p.shadow.matrix));
		un.uShadowBias!.value = p.shadow.bias;
		un.uShadowTexel!.value = p.shadow.texel;
	}

	/** Swaps the planet pass between the program with the aurora march and the one without (three keeps both once compiled). */
	private setAuroraLive(live: boolean): void {
		if (live === this.auroraLive) return;
		this.auroraLive = live;
		this.material.defines = this.definesFor(this.current);
		this.material.needsUpdate = true;
		this.edge.defines = this.definesFor(this.current);
		this.edge.needsUpdate = true;
	}

	/** The strength gate and the magnetic frame of the aurora (plan 061); 0 strength means the pass skips the march. */
	private updateAurora(un: Record<string, U<unknown>>, p: PlanetUpdate): void {
		if (!this.auroraEnabled || this.auroraSteps <= 0) {
			(un.uAurora as U<number>).value = 0;
			this.setAuroraLive(false);
			return;
		}
		const upBodyFixed = rotateInverse(p.bodyRotation, p.frame.up);
		const strength = auroraStrength({
			up: upBodyFixed,
			sunBodyFixed: p.sunBodyFixed,
			altitude: p.frame.altitude,
			atmosphereHeight: this.atmosphereHeight,
			radius: this.radius,
			darkSky: p.starBrightness,
			enabled: true
		});
		(un.uAurora as U<number>).value = strength;
		this.setAuroraLive(strength > 0);
		if (strength <= 0) return;
		const frame = magneticFrame(p.sunBodyFixed, magneticAxis());
		(un.uAuroraAxis!.value as Vector3).set(frame.axis.x, frame.axis.y, frame.axis.z);
		(un.uAuroraMid!.value as Vector3).set(frame.midnight.x, frame.midnight.y, frame.midnight.z);
		(un.uAuroraSide!.value as Vector3).set(frame.side.x, frame.side.y, frame.side.z);
		(un.uAuroraTime as U<number>).value = auroraTime(p.time);
	}

	dispose(): void {
		this.terrainTarget?.dispose();
		this.marchTarget?.dispose();
		this.halfTarget?.dispose();
		this.half.upsample.dispose();
		this.marchPass.material.dispose();
		this.bake.material.dispose();
		this.patchBake.material.dispose();
		this.skyBake.target?.dispose();
		this.scaledBake.albedo?.dispose();
		this.scaledBake.normal?.dispose();
		this.scaledBake.material.dispose();
		this.patches.fine.target?.dispose();
		this.patches.mid.target?.dispose();
		this.terrainMap?.dispose();
		this.dummyShadow.dispose();
		this.map.dispose();
		this.material.dispose();
		this.mesh.geometry.dispose();
	}
}
