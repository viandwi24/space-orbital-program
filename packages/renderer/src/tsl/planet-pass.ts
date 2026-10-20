/**
 * The planet pass in TSL for the WebGPU renderer (plan 261 Phase 2, slice 2a; ADR 0246).
 *
 * It draws what `planet.glsl.ts` draws for a ray that meets the sea-level sphere or the sky, from
 * the uniforms the WebGL `PlanetPass` already keeps (its `update` runs on the CPU either way):
 * - the air through the LUT sky (`lut-sky.ts`): every order of scattering where the GLSL multiplies
 *   single scattering by `skyBoost`;
 * - the ground on the sphere: the biome map through the coast warp, its fractal coast and colour
 *   detail, vegetation, rock, snow, beach and sea colours, the launch site's paving;
 * - sunlight through the transmittance table, the sky's ambient, the sea's reflection and glint;
 * - the stars and the sun's disc, and a logarithmic depth so meshes sort against the ground.
 *
 * Slice 2b adds the terrain (`terrain.ts`): the baked heights marched per pixel with the GLSL's
 * steps, crest look-ahead, Illinois root finding and silhouette parabola; the hill relief and slope
 * normals, rock, alpine and snow by height and slope, the grazing fix, the sun's shadow from the
 * terrain, and the air in front of terrain marched with the tables.
 *
 * Not yet (slice 2c): lakes, rivers, shore and sea waves, clouds, light shafts, aurora, the
 * vessel's and the clouds' shadows, the march prepass and the half-size pass.
 */
import {
	AlwaysDepth,
	FloatType,
	Mesh,
	NearestFilter,
	RenderTarget,
	Vector2,
	Vector3,
	type DataTexture,
	type IUniform,
	type PerspectiveCamera
} from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import {
	EDGE_CHROMA,
	EDGE_DEPTH_OCTAVES,
	SKY_DEPTH,
	UPSAMPLE_TOLERANCE_OCTAVES,
	budgetScale
} from '../half-res.ts';
import { MARCH_BLOCK, MARCH_CONE_PIXELS, MARCH_NO_HIT } from '../terrain-model.ts';
import {
	BEACH_WIDTH,
	HIGHLAND,
	SEA_LEVEL,
	TERRAIN_MAX_HEIGHT,
	TERRAIN_MAX_SLOPE,
	LAKE_SHAPE
} from '@orbital/core';
import { TERRAIN_VEIL, type Atmosphere } from '../atmosphere-model.ts';
import type { PresetSettings } from '../presets.ts';
import {
	SLOPE_EXAGGERATION,
	SLOPE_EXAGGERATION_RANGE,
	STEP_FAR_FRACTION,
	STEP_MIN_FRACTION,
	STEP_MIN_METRES,
	STEP_RELAX,
	TERRAIN_MARCH_SLOPE_MIN
} from '../terrain-model.ts';
import { TerrainTSL, type TerrainSampler } from './terrain.ts';
import {
	CloudMapTSL,
	cirrusDensity,
	cloudBillowShade,
	cloudDensityQ,
	cloudErosion,
	cloudFill,
	cloudPowder,
	cloudScatterGain,
	cloudSlabDensity,
	cloudSunDepth,
	hgPhase,
	rotY
} from './clouds.ts';
import { riverField, rippleAt, surfFoam, swashOffset, waveGradient } from './water.ts';
import {
	CLOUD_EXTRA_PATH,
	CLOUD_MAX_PATH,
	CLOUD_RADIANCE_KNEE,
	CLOUD_SIGMA,
	CLOUD_THICKNESS
} from '../cloud-volume.ts';
import { SHAFT, SHAFT_TERRAIN } from '../light-shaft.ts';
import { AURORA } from '../aurora-model.ts';
import { LAKE_WAVE_SHARE, SHORE_WAVE_HEIGHT } from '../shore-wave.ts';
import { WAVES } from '../water-model.ts';
import { FLOW_CYCLE, FLOW_SPEED } from '../water-flow.ts';
import { FLOOD_LIGHT_INTENSITY, floodLightPositions } from '../site.ts';
import { noiseT } from './noise.ts';
import type { PlanetPass } from '../planet.ts';
import { APRONS, PAD_RADIUS, ROADS, SCORCH_RADIUS } from '../site.ts';
import { createLutSky, type LutSky } from './lut-sky.ts';
import { fbmF, hash13i, hash33i, noiseA, noiseF, warpedLatLon } from './noise.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	If,
	Loop,
	Discard,
	textureLoad,
	ivec2,
	atan,
	acos,
	cos,
	sin,
	screenCoordinate,
	uniformArray,
	floatBitsToUint,
	uint,
	Break,
	abs,
	bool,
	dFdx,
	dFdy,
	sign,
	transpose,
	clamp,
	cameraFar,
	cameraNear,
	cross,
	dot,
	exp,
	exp2,
	float,
	floor,
	fract,
	ivec3,
	length,
	log2,
	max,
	min,
	mix,
	normalize,
	positionGeometry,
	pow,
	select,
	smoothstep,
	sqrt,
	step,
	texture,
	uniform,
	varying,
	vec2,
	vec3,
	vec4,
	viewZToLogarithmicDepth
} = T;

const PI = Math.PI;
const SUN_ANGULAR_RADIUS = 0.0055;
const SUN_DISC_RADIANCE = 70.0;
const NIGHT_AMBIENT: [number, number, number] = [0.0035, 0.0048, 0.0095];
/**
 * The LUT sky computes multiple scattering, which lights the sky less than the march's 2.2 boost;
 * this brings its brightness to the march's under the same exposure (the spike's calibration).
 */
const SKY_GAIN = 1.3;

/** Whether the GPU filters 32-bit float textures (the terrain patches are read by hand otherwise). */
function float32Filterable(renderer: WebGPURenderer): boolean {
	const b = renderer.backend as { isWebGPUBackend?: boolean; gl?: WebGL2RenderingContext };
	if (b.isWebGPUBackend) return renderer.hasFeature('float32-filterable');
	return b.gl?.getExtension('OES_texture_float_linear') != null;
}

export class PlanetPassTSL {
	readonly mesh: Mesh;
	private readonly sky: LutSky;
	private readonly material = new MeshBasicNodeMaterial();
	private readonly syncs: (() => void)[] = [];
	private readonly pixelAngle = uniform(0.001);
	/** The half-size pass's pixel angle (the full one over the scale). */
	private readonly pixelAngleHalf = uniform(0.002);
	/** The camera's near and far, for the logarithmic depth every pass writes or reads. */
	private readonly uNear = uniform(0.1);
	private readonly uFar = uniform(1e9);
	/** The march prepass (plan 039): on, the steps a pixel may take after it, and the texels per pixel. */
	private readonly uMarchOn = uniform(0);
	private readonly uMarchSteps = uniform(1);
	private readonly uMarchScale = uniform(1);
	/** The prepass's target size (px of the pass it serves) and its cone, rad. */
	private readonly uPreSize = uniform(new Vector2(1, 1));
	private readonly uConeAngle = uniform(0.002);
	/** The half-size pass (plan 050, ADR 0061, budget ADR 0234): full and half sizes, depth octaves. */
	private readonly uFullSize = uniform(new Vector2(1, 1));
	private readonly uHalfSize = uniform(new Vector2(1, 1));
	private readonly uOctaves = uniform(32);
	private readonly halfTarget = new RenderTarget(1, 1, {
		type: FloatType,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		depthBuffer: false,
		generateMipmaps: false
	});
	private readonly marchTarget = new RenderTarget(1, 1, {
		type: FloatType,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		depthBuffer: false,
		generateMipmaps: false
	});
	private readonly halfMaterial = new MeshBasicNodeMaterial();
	private readonly edgeMaterial = new MeshBasicNodeMaterial();
	private readonly upMaterial = new MeshBasicNodeMaterial();
	private readonly preMaterial = new MeshBasicNodeMaterial();
	private readonly halfQuad = new QuadMesh(this.halfMaterial);
	private readonly preQuad = new QuadMesh(this.preMaterial);
	/** The upsample and the edge pass, in the scene in the full pass's place on the half rung. */
	readonly upMesh: Mesh;
	readonly edgeMesh: Mesh;
	/** Every mesh the scene needs: the full pass, the upsample, the edge pass. */
	readonly meshes: Mesh[];
	/** The scale the governor asks for (1 or 0.5), and the one the last frame drew at. */
	private wantedScale = 1;
	private activeScale = 1;
	private builtMap: DataTexture | null = null;
	private builtTerrain = -1;
	/** The sun's shadow map the shader samples (three's, once it exists), or null before. */
	private builtShadow: unknown = null;
	private needsBuild = true;
	private baked = false;
	private terrain: TerrainTSL | null = null;
	private cloudMap: CloudMapTSL | null = null;
	private readonly up = new Vector3();
	private readonly sun = new Vector3();

	constructor(
		private readonly planet: PlanetPass,
		private readonly atm: Atmosphere,
		private settings: PresetSettings
	) {
		this.sky = createLutSky(atm);
		this.material.name = 'planet-pass-tsl';
		this.material.depthFunc = AlwaysDepth;
		this.material.depthWrite = true;
		this.mesh = new Mesh(planet.mesh.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = planet.mesh.renderOrder;
		this.mesh.name = 'planet-pass-tsl';
		for (const m of [this.halfMaterial, this.preMaterial]) {
			m.depthTest = false;
			m.depthWrite = false;
		}
		for (const m of [this.edgeMaterial, this.upMaterial]) {
			m.depthFunc = AlwaysDepth;
			m.depthWrite = true;
		}
		this.edgeMaterial.name = 'planet-pass-tsl-edge';
		this.upMaterial.name = 'planet-pass-tsl-upsample';
		this.upMesh = new Mesh(planet.mesh.geometry, this.upMaterial);
		this.upMesh.frustumCulled = false;
		this.upMesh.renderOrder = planet.mesh.renderOrder;
		this.upMesh.name = 'planet-pass-tsl-upsample';
		this.edgeMesh = new Mesh(planet.mesh.geometry, this.edgeMaterial);
		this.edgeMesh.frustumCulled = false;
		this.edgeMesh.renderOrder = planet.mesh.renderOrder + 1;
		this.edgeMesh.name = 'planet-pass-tsl-edge';
		this.meshes = [this.mesh, this.upMesh, this.edgeMesh];
	}

	/** Plan 068's bake measurement on WebGPU (`debug.bakeMode`). */
	debugBakeMode(rebake: boolean, gradient: 'analytic' | 'fd' | 'none'): void {
		this.terrain?.debugBakeMode(rebake, gradient);
	}

	/** The governor's planet scale: 0.5 asks for the half-size pass, 1 for the full one (plan 050). */
	setScale(scale: number): void {
		this.wantedScale = scale < 1 ? scale : 1;
	}

	/** The scale the last frame drew the planet pass at. */
	get scale(): number {
		return this.activeScale;
	}

	/** The preset's ground octaves and terrain steps; the shader is rebuilt when they change. */
	setSettings(settings: PresetSettings): void {
		const s = this.settings;
		this.needsBuild ||=
			settings.groundOctaves !== s.groundOctaves ||
			settings.terrainSteps !== s.terrainSteps ||
			settings.terrainShadowSteps !== s.terrainShadowSteps ||
			settings.cloudOctaves !== s.cloudOctaves ||
			settings.cloudSteps !== s.cloudSteps ||
			settings.cloudDetail !== s.cloudDetail ||
			settings.viewSamples !== s.viewSamples ||
			settings.shaftSteps !== s.shaftSteps ||
			settings.shaftTerrain !== s.shaftTerrain ||
			settings.auroraSteps !== s.auroraSteps ||
			settings.cloudShadowMap !== s.cloudShadowMap;
		this.settings = settings;
	}

	/**
	 * Bakes what the terrain needs, copies this frame's uniforms from the WebGL pass, follows its
	 * visibility and rebuilds the sky view for the camera. Call after the scene model's
	 * `prepareFrame`, before drawing.
	 */
	update(renderer: WebGPURenderer, camera: PerspectiveCamera, width: number, height: number): void {
		const u = this.planet.material.uniforms;
		const visible = this.planet.mesh.visible;
		this.mesh.visible = this.upMesh.visible = this.edgeMesh.visible = false;
		if (!visible) return;
		const R = u.uR!.value as number;
		this.terrain ??= new TerrainTSL(this.planet, R, float32Filterable(renderer));
		this.terrain.bake(renderer);
		this.cloudMap ??= new CloudMapTSL(R);
		this.cloudMap.update(renderer, u.uCloudCover!.value as number);
		if (
			this.needsBuild ||
			u.uMap!.value !== this.builtMap ||
			this.shadowMap() !== this.builtShadow ||
			this.terrain.version !== this.builtTerrain
		)
			this.build();
		for (const s of this.syncs) s();
		const scale = Math.min(
			this.wantedScale,
			budgetScale(width, height, this.settings.planetPixels)
		);
		this.activeScale = scale;
		const half = scale < 1;
		const passW = Math.max(1, Math.round(width * scale));
		const passH = Math.max(1, Math.round(height * scale));
		this.pixelAngle.value =
			(2 * Math.tan(((camera.fov * Math.PI) / 180) * 0.5)) / Math.max(height, 1);
		this.pixelAngleHalf.value = this.pixelAngle.value / scale;
		this.uNear.value = camera.near;
		this.uFar.value = camera.far;
		this.uOctaves.value = Math.log2(camera.far / Math.max(camera.near, 1e-6));
		this.uFullSize.value.set(width, height);
		this.uHalfSize.value.set(passW, passH);
		this.uMarchScale.value = scale;
		this.mesh.visible = !half;
		this.upMesh.visible = this.edgeMesh.visible = half;
		if (!this.baked) {
			this.sky.bake(renderer);
			this.baked = true;
		}
		this.up.copy(u.uCamUp!.value as Vector3);
		this.sun.copy(u.uSunDir!.value as Vector3);
		this.sky.update(renderer, R + Math.max(u.uAlt!.value as number, 0), this.up, this.sun);
		const prev = renderer.getRenderTarget();
		// the march prepass: where each block of the pass's pixels may first meet the ground (plan 039)
		const terrainOn = this.settings.terrainSteps > 0 && (u.uTerrainOn!.value as number) > 0.5;
		this.uMarchOn.value = terrainOn ? 1 : 0;
		this.uMarchSteps.value = terrainOn
			? this.settings.terrainRefineSteps
			: Math.max(1, this.settings.terrainSteps);
		if (terrainOn) {
			const mw = Math.ceil(passW / MARCH_BLOCK);
			const mh = Math.ceil(passH / MARCH_BLOCK);
			if (this.marchTarget.width !== mw || this.marchTarget.height !== mh)
				this.marchTarget.setSize(mw, mh);
			this.uPreSize.value.set(passW, passH);
			this.uConeAngle.value =
				MARCH_CONE_PIXELS * (half ? this.pixelAngleHalf.value : this.pixelAngle.value);
			renderer.setRenderTarget(this.marchTarget);
			this.preQuad.render(renderer);
		}
		if (half) {
			if (this.halfTarget.width !== passW || this.halfTarget.height !== passH)
				this.halfTarget.setSize(passW, passH);
			renderer.setRenderTarget(this.halfTarget);
			this.halfQuad.render(renderer);
		}
		renderer.setRenderTarget(prev);
	}

	dispose(): void {
		for (const m of [
			this.material,
			this.halfMaterial,
			this.edgeMaterial,
			this.upMaterial,
			this.preMaterial
		])
			m.dispose();
		this.halfTarget.dispose();
		this.marchTarget.dispose();
		this.sky.dispose();
		this.terrain?.dispose();
		this.cloudMap?.dispose();
	}

	/**
	 * The depth texture of the sun's shadow (three's own on WebGPU, once the shadow pass has run), or
	 * null while the planet pass holds its 1 × 1 stand-in.
	 */
	private shadowMap(): unknown {
		const t = this.planet.material.uniforms.uShadowMap!.value as {
			image?: { width?: number };
		} | null;
		return t && (t.image?.width ?? 0) > 1 ? t : null;
	}

	/** A TSL uniform that follows the WebGL pass's uniform of the same name each frame. */
	private link(name: string, type?: string): N {
		const src = this.planet.material.uniforms[name] as IUniform;
		const node = type ? uniform(src.value, type) : uniform(src.value);
		this.syncs.push(() => {
			node.value = src.value;
		});
		return node;
	}

	private build(): void {
		this.syncs.length = 0;
		const U = this.planet.material.uniforms;
		this.builtMap = U.uMap!.value as DataTexture;
		this.builtTerrain = this.terrain?.version ?? -1;
		this.builtShadow = this.shadowMap();
		this.needsBuild = false;
		const graph = (mode: 'full' | 'half' | 'edge' | 'prepass'): N => {
			const uR = this.link('uR');
			const uInvProj = this.link('uInvProj');
			const uCamRot = this.link('uCamRot');
			const uCamUp = this.link('uCamUp');
			const uAlt = this.link('uAlt');
			const uSunDir = this.link('uSunDir');
			const uSunBF = this.link('uSunBF');
			const uBodyInv = this.link('uBodyInv');
			const uCamLocal = this.link('uCamLocal');
			const uAnchorCell = this.link('uAnchorCell');
			const uCamToSite = this.link('uCamToSite');
			const uSiteEast = this.link('uSiteEast');
			const uSiteNorth = this.link('uSiteNorth');
			const uMapTexel = this.link('uMapTexel');
			const uAmbient = this.link('uAmbient');
			const uAmbientRefMu = this.link('uAmbientRefMu');
			const uSkyColour = this.link('uSkyColour');
			const uStarBright = this.link('uStarBright');
			const uSunIrr = this.link('uSunIrr');
			const uSiteRadius = this.link('uSiteRadius');
			const uTerrainShift = this.link('uTerrainShift', 'int');
			const uTime = this.link('uTime');
			const uSiteLamps = this.link('uSiteLamps');
			const uCloudCover = this.link('uCloudCover');
			const uCloudAngle = this.link('uCloudAngle');
			const uCloudAlt = this.link('uCloudAlt');
			const uCloudTop = this.link('uCloudTop');
			const uCirrusAlt = this.link('uCirrusAlt');
			const uShaft = this.link('uShaft');
			const uAurora = this.link('uAurora');
			const uAuroraAxis = this.link('uAuroraAxis');
			const uAuroraMid = this.link('uAuroraMid');
			const uAuroraSide = this.link('uAuroraSide');
			const uAuroraTime = this.link('uAuroraTime');
			// the waves' phases at the anchor, one uniform each, copied from the GLSL pass's array
			const anchorSrc = U.uWaveAnchor!.value as number[];
			const anchors = WAVES.map((_, i) => {
				const node = uniform(anchorSrc[i] ?? 0);
				this.syncs.push(() => {
					node.value = (U.uWaveAnchor!.value as number[])[i] ?? 0;
				});
				return node;
			});
			void uniformArray;
			const map = this.builtMap;
			const pixelAngle =
				mode === 'half' || mode === 'prepass' ? this.pixelAngleHalf : this.pixelAngle;
			const sky = this.sky;
			const octaves = this.settings.groundOctaves;
			const cfg = this.settings;
			const cloudMap = this.cloudMap;
			const zonesOf = (n: N): N => this.terrain?.zones(n) ?? vec3(1.0, 1e9, 1.0);
			const steps = Math.max(1, this.settings.terrainSteps);
			const shadowSteps = this.settings.terrainShadowSteps;
			const uAtmH = this.link('uAtmH');
			const uTerrainOn = this.link('uTerrainOn');
			const uSkipR = this.link('uSkipR');
			const uMarchSteps = this.uMarchSteps;
			const uSilhouetteAA = this.link('uSilhouetteAA');
			const shadowTex = this.builtShadow;
			const uShadowOn = this.link('uShadowOn');
			const uShadowMatrix = this.link('uShadowMatrix');
			const uShadowBias = this.link('uShadowBias');
			const uShadowTexel = this.link('uShadowTexel');
			const uCamPos = this.link('uCamPos');
			/**
			 * `shadowFactor`: the vessel's and the site's shadow on the ground from the sun's shadow map,
			 * 3 × 3 comparison taps; WebGPU's texture rows run top-down (as three's ShadowNode).
			 */
			const shadowFactor = (posRender: N): N => {
				if (!shadowTex) return float(1.0);
				const sc = uShadowMatrix.mul(vec4(posRender, 1.0));
				const p = sc.xyz.div(sc.w).toVar();
				const z = p.z.add(uShadowBias);
				const at = vec2(p.x, p.y.oneMinus());
				let sum: N = float(0.0);
				for (let i = -1; i <= 1; i++)
					for (let j = -1; j <= 1; j++)
						sum = sum.add(texture(shadowTex, at.add(vec2(i, j).mul(uShadowTexel))).compare(z));
				const inside = uShadowOn
					.greaterThan(0.5)
					.and(p.x.greaterThanEqual(0.0))
					.and(p.x.lessThanEqual(1.0))
					.and(p.y.greaterThanEqual(0.0))
					.and(p.y.lessThanEqual(1.0))
					.and(p.z.lessThanEqual(1.0));
				return select(inside, sum.div(9.0), float(1.0));
			};
			const terrain: TerrainSampler | null =
				this.settings.terrainSteps > 0
					? (this.terrain?.sampler((n) => this.link(n), uBodyInv) ?? null)
					: null;
			const nA = (pl: N, lam: number, salt: number): N => noiseA(pl, lam, salt, uAnchorCell);
			// NaN or infinity by the bits: fast math may fold x != x away (Metal)
			const nan = (x: N): N => floatBitsToUint(x).bitAnd(uint(0x7f800000)).equal(uint(0x7f800000));
			/** x, or the fallback where x is NaN or infinite (screen derivatives next to a silhouette). */
			const finite = (x: N, fallback: number): N => {
				const v = float(x).toVar();
				return select(nan(v), float(fallback), v);
			};
			const mapAt = (st: N, lod: N): N => texture(map, st).level(lod);

			/** sitePaving: the pad, its ring and scorch, roads and aprons; (colour, pave, dirt). */
			const sitePaving = (q: N, base: N, px: N) => {
				const colour = vec3(base).toVar();
				const dirt = float(0.0).toVar();
				const dPad = length(q);
				const padEdge = float(PAD_RADIUS).sub(dPad);
				const paving = smoothstep(px.negate(), px, padEdge);
				const c = vec3(0.34, 0.335, 0.32)
					.mul(
						noiseF(vec3(q.mul(0.35), 1.0))
							.mul(0.2)
							.add(0.9)
					)
					.toVar();
				const g = abs(fract(q.div(5.0).add(0.5)).sub(0.5)).mul(5.0);
				c.mulAssign(
					float(1.0).sub(smoothstep(0.0, px.add(0.06), min(g.x, g.y)).oneMinus().mul(0.28))
				);
				const scorch = smoothstep(SCORCH_RADIUS * 0.4, SCORCH_RADIUS * 1.8, dPad)
					.oneMinus()
					.mul(
						noiseF(vec3(q.mul(0.6), 3.0))
							.mul(0.4)
							.add(0.6)
					);
				c.assign(mix(c, vec3(0.045, 0.04, 0.04), clamp(scorch, 0.0, 0.92)));
				const ring = smoothstep(0.2, px.add(0.45), abs(dPad.sub(PAD_RADIUS - 1.4))).oneMinus();
				const cross1 = smoothstep(0.15, px.add(0.4), min(abs(q.x), abs(q.y)))
					.oneMinus()
					.mul(step(dPad, PAD_RADIUS - 2.4))
					.mul(step(SCORCH_RADIUS * 1.6, dPad));
				c.assign(mix(c, vec3(0.75, 0.74, 0.7), max(ring, cross1.mul(0.8))));
				colour.assign(mix(colour, c, paving));
				const pave = float(paving).toVar();
				dirt.assign(
					smoothstep(0.0, 6.0, padEdge.negate()).oneMinus().mul(paving.oneMinus()).mul(0.8)
				);
				for (const r of ROADS) {
					const a = vec2(r.ax, r.az);
					const b = vec2(r.bx, r.bz);
					const ab = b.sub(a);
					const t = clamp(dot(q.sub(a), ab).div(dot(ab, ab)), 0.0, 1.0);
					const d = length(q.sub(a.add(ab.mul(t))));
					const hw = r.width * 0.5;
					const m = smoothstep(px.negate(), px, float(hw).sub(d));
					let asphalt = vec3(0.075, 0.075, 0.08).mul(
						noiseF(vec3(q.mul(0.8), 5.0))
							.mul(0.3)
							.add(0.85)
					);
					if (r.width >= 7) {
						const along = dot(q.sub(a), normalize(ab));
						const dash = step(0.5, fract(along.div(6.0))).mul(
							smoothstep(0.1, px.add(0.2), d).oneMinus()
						);
						asphalt = mix(asphalt, vec3(0.6, 0.55, 0.3), dash);
						const edgeLine = smoothstep(0.08, px.add(0.16), abs(d.sub(hw - 0.5))).oneMinus();
						asphalt = mix(asphalt, vec3(0.6), edgeLine.mul(0.8));
					}
					colour.assign(mix(colour, asphalt, m));
					pave.assign(max(pave, m));
					dirt.assign(
						max(dirt, smoothstep(0.0, 3.5, d.sub(hw)).oneMinus().mul(m.oneMinus()).mul(0.7))
					);
				}
				for (const ap of APRONS) {
					const centre = vec2(ap.x, ap.z);
					const dd = abs(q.sub(centre)).sub(vec2(ap.hx, ap.hz));
					const sd = max(dd.x, dd.y);
					const m = smoothstep(px.negate(), px, sd.negate());
					const gg = abs(fract(q.sub(centre).div(6.0).add(0.5)).sub(0.5)).mul(6.0);
					const c2 = vec3(0.4, 0.39, 0.37)
						.mul(
							noiseF(vec3(q.mul(0.3), 7.0))
								.mul(0.2)
								.add(0.9)
						)
						.mul(
							float(1.0).sub(smoothstep(0.0, px.add(0.06), min(gg.x, gg.y)).oneMinus().mul(0.22))
						);
					colour.assign(mix(colour, c2, m));
					pave.assign(max(pave, m));
					dirt.assign(max(dirt, smoothstep(0.0, 4.0, sd).oneMinus().mul(m.oneMinus()).mul(0.7)));
				}
				return { colour, pave, dirt };
			};

			/**
			 * Hill relief for shading only (the GLSL's `macroRelief`): metres from the octaves at or above
			 * lamMin; the two largest only on mountains (`mount` > 0.05).
			 */
			const macroRelief = Fn(([p, lamMin, mount]: N[]) => {
				const h = float(0.0).toVar();
				for (let i = 0; i < 6; i++) {
					const lam = 1024 / 2 ** i;
					const wanted = float(lam).greaterThanEqual(lamMin);
					If(i < 2 ? wanted.and(mount.greaterThan(0.05)) : wanted, () => {
						const fade = clamp(float(lam).div(lamMin).sub(1.0).mul(1.5), 0.0, 1.0);
						h.addAssign(
							nA(p, lam, 60 + i)
								.sub(0.5)
								.mul(320 * (lam / 1024) ** 1.5)
								.mul(fade)
						);
					});
				}
				return h;
			});

			/**
			 * surfaceAt: albedo, normal (body-fixed) and how much is water (the GLSL's `spec`), at height hT
			 * with the terrain's body-fixed gradient gT (0 on the sea-level sphere).
			 */
			const surfaceAt = (nBF: N, pl: N, footprint: N, viewBF: N, hT: N, gT: N) => {
				const ll = warpedLatLon(nBF, uR, uTerrainShift);
				const st = vec2(ll.y.div(2 * PI).add(0.5), ll.x.div(PI).add(0.5)).toVar();
				const lod = max(log2(footprint.div(uMapTexel)), 0.0).toVar();
				const m = mapAt(st, lod).toVar();
				const e = m.r;
				const moist = m.g;
				const temp = m.b;
				const rockMap = m.a;
				const tw = uMapTexel.div(uR.mul(2 * PI)).mul(exp2(lod));
				const ex = mapAt(st.add(vec2(tw, 0.0)), lod).r.sub(mapAt(st.sub(vec2(tw, 0.0)), lod).r);
				const ey = mapAt(st.add(vec2(0.0, tw.mul(2.0))), lod).r.sub(
					mapAt(st.sub(vec2(0.0, tw.mul(2.0))), lod).r
				);
				const texelM = uMapTexel.mul(exp2(lod));
				const gPerM = max(
					length(vec2(ex, ey)).mul(0.5).div(texelM),
					float(0.006).div(uMapTexel)
				).toVar();

				// fractal detail: coast displacement, relief height, colour noise and fine tone
				const hM = float(0.0).toVar();
				const eDetail = float(0.0).toVar();
				const colourNoise = float(0.0).toVar();
				const fine = float(0.0).toVar();
				const lamMin = footprint.mul(1.6);
				for (let i = 0; i < octaves; i++) {
					const lam = 1024 / 2 ** i;
					If(lamMin.lessThanEqual(lam), () => {
						const fade = clamp(float(lam).div(lamMin).sub(1.0).mul(1.5), 0.0, 1.0);
						const n = nA(pl, lam, i).sub(0.5);
						eDetail.addAssign(n.mul(0.7).mul(gPerM).mul(lam).mul(fade));
						hM.addAssign(n.mul(lam * 0.22).mul(fade));
						if (lam < 64) fine.addAssign(n.mul(fade).mul(lam < 8 ? 1.0 : 0.6));
						if (lam > 6 && lam < 200) colourNoise.addAssign(n.mul(fade).mul(0.7));
					});
				}
				const e2 = e.add(eDetail).toVar();
				const aa = max(footprint.mul(gPerM), 0.0004);
				const landW = smoothstep(float(SEA_LEVEL).sub(aa), float(SEA_LEVEL).add(aa), e2).toVar();
				const sdCoast = float(SEA_LEVEL).sub(e2).div(gPerM).toVar();
				const depth = clamp(float(SEA_LEVEL).sub(e2).div(0.18), 0.0, 1.0).toVar();
				const depthNear = clamp(sdCoast.div(60.0), 0.0, 1.0).toVar();
				const depthSea = float(depth).toVar();

				// lakes (plan 038, ADR 0072): basins of the core terrain, gated by every site's zone
				const lakeLvl = noiseT(
					nBF.mul(uR.div(1000.0)),
					1 / LAKE_SHAPE.wavelengthKm,
					LAKE_SHAPE.salt,
					uTerrainShift
				)
					.mul(zonesOf(nBF).z)
					.toVar();
				const lakeGradPx = finite(length(vec2(dFdx(lakeLvl), dFdy(lakeLvl))), 0.0);
				const lakeIn = float(-1.0e5).toVar();
				const lakeOnly = float(0.0).toVar();
				If(footprint.lessThan(2500.0).and(lakeLvl.greaterThan(LAKE_SHAPE.to - 0.1)), () => {
					const gl = clamp(
						lakeGradPx.div(max(footprint, 0.05)),
						0.3 * LAKE_SHAPE.gradientBound,
						1.1 * LAKE_SHAPE.gradientBound
					);
					// the shore is ragged inward only, so it never moves onto ground above the water
					lakeIn.assign(
						lakeLvl
							.sub(LAKE_SHAPE.to)
							.div(gl)
							.sub(
								nA(pl, 32, 77)
									.mul(7.0)
									.mul(smoothstep(30.0, 160.0, footprint).oneMinus())
							)
					);
					landW.mulAssign(smoothstep(footprint.negate(), footprint, lakeIn).oneMinus());
					sdCoast.assign(max(sdCoast, lakeIn));
					depth.assign(
						max(depth, clamp(lakeIn.div(LAKE_SHAPE.depthRampMetres), 0.0, 1.0).mul(0.3))
					);
					depthNear.assign(clamp(sdCoast.div(60.0), 0.0, 1.0));
					lakeOnly.assign(
						smoothstep(0.0, 6.0, lakeIn).mul(smoothstep(0.0, 0.05, depthSea).oneMinus())
					);
				});
				// shore waves: the waterline runs up and down the beach; surf bands parallel to the shore
				const sdGrad = finite(length(vec2(dFdx(sdCoast), dFdy(sdCoast))), 1.0).div(
					max(footprint, 0.02)
				);
				const sdM = sdCoast.div(clamp(sdGrad, 1.0, 12.0)).toVar();
				const shoreH = mix(
					float(SHORE_WAVE_HEIGHT),
					SHORE_WAVE_HEIGHT * LAKE_WAVE_SHARE,
					lakeOnly
				).toVar();
				const swash = float(0.0).toVar();
				const nearShore = smoothstep(12.0, 50.0, footprint)
					.oneMinus()
					.mul(smoothstep(14.0, 30.0, abs(sdM)).oneMinus());
				If(nearShore.greaterThan(0.0), () => {
					swash.assign(swashOffset(uTime, shoreH).mul(0.5));
					landW.assign(
						mix(
							landW,
							smoothstep(footprint.negate(), footprint, sdM.add(swash)).oneMinus(),
							nearShore
						)
					);
				});
				const vS = uCamToSite.add(viewBF).toVar();
				const siteDist = length(vS).toVar();

				// hill shading: a normal from finite differences of a few octaves, away from the launch site
				const reliefBase = smoothstep(500.0, 2500.0, siteDist)
					.mul(smoothstep(25.0, 160.0, footprint).oneMinus())
					.mul(landW)
					.mul(mix(0.45, 1.0, smoothstep(0.45, 0.85, e2.add(rockMap.mul(0.25)))));
				// crags on real mountains: the large octaves too, stronger where the terrain is high
				const rug = smoothstep(150.0, 1100.0, hT).toVar();
				const reliefAmp = max(
					reliefBase,
					rug.mul(1.3).mul(smoothstep(25.0, 200.0, footprint).oneMinus())
				);
				const Nr = vec3(nBF).toVar();
				If(reliefAmp.greaterThan(0.01), () => {
					const eps = max(footprint.mul(1.5), 6.0);
					const lm = max(footprint.mul(2.5), eps.mul(3.0));
					const T1 = normalize(
						cross(
							nBF,
							select(abs(nBF.y).greaterThan(0.99), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0))
						)
					);
					const T2 = cross(nBF, T1);
					const h0 = macroRelief(pl, lm, rug);
					const h1 = macroRelief(pl.add(T1.mul(eps)), lm, rug);
					const h2 = macroRelief(pl.add(T2.mul(eps)), lm, rug);
					Nr.assign(
						normalize(
							nBF.sub(
								T1.mul(h1.sub(h0).div(eps))
									.add(T2.mul(h2.sub(h0).div(eps)))
									.mul(reliefAmp)
							)
						)
					);
				});
				// slope-based rock needs the bumped normal: from the height field's screen derivatives
				const rugged = mix(0.02, 0.5, smoothstep(0.55, 0.9, e2.add(rockMap.mul(0.25))));
				const dpdx = dFdx(pl);
				const dpdy = dFdy(pl);
				const hR = hM.mul(rugged);
				const r1 = cross(dpdy, nBF);
				const r2 = cross(nBF, dpdx);
				const det = dot(dpdx, r1);
				const gb = nBF.mul(abs(det)).sub(
					r1
						.mul(dFdx(hR))
						.add(r2.mul(dFdy(hR)))
						.mul(sign(det))
				);
				// Next to a pixel that took another branch (a silhouette), the screen derivatives are
				// undefined on Metal and may be NaN; fast math keeps the comparison from catching it.
				const gbv = vec3(gb).toVar();
				const gbOk = dot(gbv, gbv)
					.greaterThan(1e-24)
					.and(nan(gbv.x).or(nan(gbv.y)).or(nan(gbv.z)).not());
				const Nb = select(gbOk, normalize(gbv), nBF).toVar();
				Nb.assign(normalize(Nb.add(Nr.sub(nBF))));
				const slope = float(1.0).sub(dot(Nb, nBF));
				const tanS = length(gT);
				// distant slopes are drawn steeper than they are (shading only)
				const exag = smoothstep(SLOPE_EXAGGERATION_RANGE[0], SLOPE_EXAGGERATION_RANGE[1], footprint)
					.mul(SLOPE_EXAGGERATION)
					.add(1.0);
				Nb.assign(normalize(Nb.add(normalize(nBF.sub(gT.mul(exag))).sub(nBF))));

				const lush = clamp(colourNoise.mul(0.6).add(0.5), 0.0, 1.0);
				const grass = mix(
					vec3(0.052, 0.135, 0.028),
					vec3(0.095, 0.185, 0.042),
					smoothstep(0.2, 0.6, lush)
				).toVar();
				grass.assign(
					mix(
						grass,
						vec3(0.2, 0.19, 0.06),
						smoothstep(0.62, 0.95, lush).mul(smoothstep(0.4, 0.7, moist).oneMinus())
					)
				);
				const fadeMicro = smoothstep(0.35, 3.0, footprint).oneMinus();
				const fineTone = clamp(fine.add(0.5), 0.0, 1.0).mul(0.4).add(0.82);
				grass.mulAssign(mix(fineTone, 1.0, fadeMicro));
				const cn = clamp(colourNoise.add(0.5), 0.0, 1.0);
				const forest = vec3(0.03, 0.075, 0.026).mul(cn.mul(0.5).add(0.8));
				const wForest = smoothstep(0.55, 0.72, moist).mul(smoothstep(900.0, 1600.0, hT).oneMinus());
				const desert = mix(vec3(0.42, 0.29, 0.15), vec3(0.58, 0.43, 0.25), cn);
				const rockc = mix(
					vec3(0.17, 0.15, 0.135),
					vec3(0.34, 0.31, 0.27),
					clamp(colourNoise.mul(1.3).add(fine.mul(0.3)).add(0.5), 0.0, 1.0)
				);
				const snow = vec3(0.78, 0.8, 0.84);
				const sand = vec3(0.44, 0.38, 0.26).mul(clamp(fine.add(0.5), 0.0, 1.0).mul(0.16).add(0.92));
				const wDesert = smoothstep(0.26, 0.4, moist)
					.oneMinus()
					.mul(smoothstep(0.35, 0.5, temp));
				const alpine = mix(vec3(0.13, 0.15, 0.07), vec3(0.2, 0.19, 0.11), cn);
				const veg = mix(
					mix(mix(grass, forest, wForest), desert, wDesert),
					alpine,
					smoothstep(800.0, 1500.0, hT)
				);
				const wRock = max(
					max(
						smoothstep(HIGHLAND - 0.06, HIGHLAND + 0.05, e2),
						smoothstep(0.7, 0.9, rockMap.add(colourNoise.mul(0.3)))
					),
					max(
						max(smoothstep(0.06, 0.22, slope.mul(3.0)), smoothstep(0.28, 0.55, tanS)),
						smoothstep(1500.0, 2100.0, hT.add(colourNoise.mul(300.0)))
					)
				);
				const snowLine = colourNoise.mul(420.0).add(2800.0);
				const wSnow = max(
					max(smoothstep(0.12, 0.22, temp).oneMinus(), smoothstep(0.9, 0.97, e2)),
					smoothstep(snowLine.sub(150.0), snowLine.add(250.0), hT).mul(
						smoothstep(0.55, 0.95, tanS).oneMinus()
					)
				);
				const wBeach = smoothstep(SEA_LEVEL + BEACH_WIDTH * 0.5, SEA_LEVEL + BEACH_WIDTH * 1.6, e2)
					.oneMinus()
					.mul(wRock.oneMinus())
					.mul(smoothstep(300.0, 3000.0, footprint).oneMinus())
					.toVar();
				If(lakeIn.greaterThan(-60.0).and(lakeIn.lessThanEqual(0.0)), () => {
					wBeach.assign(
						max(
							wBeach,
							smoothstep(1.0, 22.0, lakeIn.negate())
								.oneMinus()
								.mul(wRock.oneMinus())
								.mul(smoothstep(300.0, 3000.0, footprint).oneMinus())
						)
					);
				});
				const land = mix(
					mix(mix(veg, rockc, wRock), sand, wBeach),
					snow,
					wSnow.mul(smoothstep(0.0, 1.0, float(1.0).sub(slope.mul(2.0))))
				).toVar();
				// wet sand along the shore
				land.mulAssign(
					float(1.0).sub(
						smoothstep(0.0, 3.0, sdM.add(swash).negate()).oneMinus().mul(0.35).mul(wRock.oneMinus())
					)
				);

				// rivers: thin level-set curves of a low-frequency field on lowland, antialiased by distance
				const riverMask = float(0.0).toVar();
				const riverFlow3 = vec3(0.0).toVar();
				If(
					landW
						.greaterThan(0.5)
						.and(siteDist.greaterThan(900.0))
						.and(footprint.lessThan(40.0))
						.and(e2.lessThan(0.68))
						.and(wDesert.lessThan(0.5)),
					() => {
						const rn = riverField(pl, nA).toVar();
						const rr = abs(rn.sub(0.5));
						const fw = max(finite(length(vec2(dFdx(rn), dFdy(rn))), 1.0), 1e-7);
						const dist = rr.div(fw).mul(footprint);
						const W = nA(pl, 1024, 44).mul(17.0).add(5.0);
						const vis = smoothstep(0.35, 1.2, W.div(footprint))
							.mul(smoothstep(0.55, 0.68, e2).oneMinus())
							.mul(smoothstep(60.0, 260.0, hT).oneMinus());
						riverMask.assign(
							smoothstep(W.sub(footprint), W.add(footprint), dist).oneMinus().mul(vis)
						);
						const bank = smoothstep(W, W.mul(2.2).add(footprint), dist).oneMinus().mul(vis);
						land.assign(mix(land, land.mul(vec3(0.55, 0.7, 0.5)), bank.mul(0.7)));
						If(riverMask.greaterThan(0.02), () => {
							// flow along the level set, signed toward lower ground (twin: flowVector in water-flow.ts)
							const T1b = normalize(
								cross(
									nBF,
									select(abs(nBF.y).greaterThan(0.99), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0))
								)
							);
							const T2b = cross(nBF, T1b);
							const gR = T1b.mul(riverField(pl.add(T1b.mul(14.0)), nA).sub(rn))
								.add(T2b.mul(riverField(pl.add(T2b.mul(14.0)), nA).sub(rn)))
								.div(14.0);
							const tang = cross(nBF, gR);
							const tl = length(tang);
							const lod2 = max(lod, 2.0);
							const tw2 = uMapTexel.div(uR.mul(2 * PI)).mul(exp2(lod2));
							const ex2 = mapAt(st.add(vec2(tw2, 0.0)), lod2).r.sub(
								mapAt(st.sub(vec2(tw2, 0.0)), lod2).r
							);
							const ey2 = mapAt(st.add(vec2(0.0, tw2.mul(2.0))), lod2).r.sub(
								mapAt(st.sub(vec2(0.0, tw2.mul(2.0))), lod2).r
							);
							const texel2 = uMapTexel.mul(exp2(lod2));
							const eastV = normalize(cross(vec3(0.0, 1.0, 0.0), nBF));
							const northV = cross(nBF, eastV);
							const gE = eastV
								.mul(ex2.div(texel2.mul(2.0).mul(max(cos(ll.x), 0.2))))
								.add(northV.mul(ey2.div(texel2.mul(2.0))));
							const downhill = dot(tang, gE).negate().div(max(tl, 1e-9));
							const el = length(gE);
							const along = downhill.div(
								sqrt(downhill.mul(downhill).add(el.mul(el).mul(0.1225)).add(1e-30))
							);
							riverFlow3.assign(tang.div(max(tl, 1e-9)).mul(along));
						});
					}
				);
				const lampE = vec3(0.0).toVar();

				// the launch site, painted flush on the ground
				If(dot(vS, vS).lessThan(uSiteRadius.mul(uSiteRadius)), () => {
					const q = vec2(dot(vS, uSiteEast), dot(vS, uSiteNorth).negate());
					If(uSiteLamps.greaterThan(0.001), () => {
						let e: N = vec3(0.0);
						for (const l of floodLightPositions()) {
							const dd = vec3(q.x, 0.0, q.y).sub(vec3(l.x, l.y, l.z));
							const d2 = dot(dd, dd);
							e = e.add(
								vec3(1.0, 0.82, 0.58).mul(
									dd.y
										.negate()
										.mul(FLOOD_LIGHT_INTENSITY)
										.div(d2.mul(sqrt(d2)))
								)
							);
						}
						lampE.assign(e.mul(uSiteLamps));
					});
					const site = sitePaving(q, land, max(footprint, 0.05));
					const dirtc = vec3(0.2, 0.15, 0.09)
						.mul(
							noiseF(vec3(q.mul(0.7), 9.0))
								.mul(0.5)
								.add(0.75)
						)
						.mul(
							noiseF(vec3(q.mul(3.1), 19.0))
								.mul(0.3)
								.add(0.85)
						);
					const lawn = smoothstep(60.0, 180.0, length(q)).oneMinus();
					const stripeFade = smoothstep(0.6, 5.0, footprint).oneMinus();
					const stripe = smoothstep(
						-0.25,
						0.25,
						T.sin(q.x.mul(0.52).add(T.sin(q.y.mul(0.02)).mul(0.8)))
					);
					land.assign(mix(land, land.mul(vec3(1.06, 1.12, 0.95)), lawn.mul(0.5)));
					land.mulAssign(lawn.mul(stripeFade).mul(0.11).mul(stripe.sub(0.5).mul(2.0)).add(1.0));
					land.assign(mix(land, dirtc, site.dirt));
					land.assign(mix(land, site.colour, site.pave));
					Nb.assign(normalize(mix(Nb, nBF, max(site.pave, site.dirt.mul(0.5)))));
					landW.assign(max(landW, site.pave));
				});

				const shallow = mix(vec3(0.03, 0.26, 0.24), vec3(0.02, 0.2, 0.2), depthNear);
				const water = mix(
					shallow,
					vec3(0.004, 0.035, 0.1),
					smoothstep(0.0, 0.7, max(depth, depthNear.mul(0.25)))
				).toVar();
				// lake water is greener and murkier than the sea and darkens toward the middle
				water.assign(
					mix(
						water,
						mix(vec3(0.045, 0.17, 0.15), vec3(0.012, 0.075, 0.085), smoothstep(0.0, 90.0, lakeIn)),
						lakeOnly
					)
				);
				// breaking foam along the shore, only where a pixel is smaller than the band
				const foamFade = smoothstep(4.0, 40.0, footprint).oneMinus();
				If(foamFade.greaterThan(0.01).and(landW.lessThan(0.999)), () => {
					const fn = nA(pl, 4, 71)
						.mul(0.6)
						.add(nA(pl, 1, 72).mul(0.4))
						.toVar();
					const band = smoothstep(1.0, 9.0, sdCoast.add(fn.sub(0.5).mul(10.0))).oneMinus();
					const lines = smoothstep(0.34, 0.6, fn);
					const surf = surfFoam(sdM.add(swash).add(fn.sub(0.5).mul(3.0)), uTime, shoreH);
					const foam = clamp(
						max(surf.mul(lines.mul(0.45).add(0.55)), band.mul(lines.mul(0.2).add(0.15))),
						0.0,
						1.0
					);
					water.assign(
						mix(
							water,
							vec3(0.8, 0.84, 0.86),
							foam.mul(foamFade).mul(step(0.0, sdM.add(1.0).add(swash)))
						)
					);
				});
				const gWave = vec3(0.0).toVar();
				If(landW.lessThan(0.999).and(footprint.lessThan(120.0)), () => {
					const wv = waveGradient(pl, nBF, footprint, {
						east: uSiteEast,
						north: uSiteNorth,
						time: uTime,
						anchors,
						noiseA: nA
					});
					const calm = lakeOnly.mul(-0.8).add(1.0); // a lake has no swell
					gWave.assign(wv.gradient.mul(calm));
					const crest = wv.crest.mul(calm);
					const capFade = smoothstep(6.0, 40.0, footprint).oneMinus();
					const cap = smoothstep(
						0.85,
						1.35,
						crest
							.div(2.4)
							.add(nA(pl, 1.5, 73).sub(0.5).mul(0.55))
							.add(length(gWave).mul(0.8))
					);
					water.assign(
						mix(
							water.mul(crest.mul(0.08).add(1.0)),
							vec3(0.8, 0.85, 0.87),
							cap.mul(capFade).mul(smoothstep(0.1, 0.5, depth.add(depthNear)))
						)
					);
				});
				const riverCol = mix(vec3(0.03, 0.07, 0.06), vec3(0.02, 0.1, 0.1), noiseF(pl.mul(0.1)));
				water.assign(mix(water, riverCol, riverMask));
				const lw = landW.mul(riverMask.oneMinus()).toVar();
				const col = mix(water, land, lw).toVar();
				const Nw = vec3(Nb).toVar();
				const wRip = float(0.5).toVar();
				If(lw.lessThan(1.0).and(footprint.lessThan(400.0)), () => {
					const f1 = clamp(float(8.0).div(footprint.mul(1.6)).sub(1.0), 0.0, 1.0);
					const f2 = clamp(float(2.0).div(footprint.mul(1.6)).sub(1.0), 0.0, 1.0);
					const f3 = clamp(float(0.5).div(footprint.mul(1.6)).sub(1.0), 0.0, 1.0);
					const w = float(0.0).toVar();
					If(
						riverMask.greaterThan(0.02).and(dot(riverFlow3, riverFlow3).greaterThan(0.0004)),
						() => {
							// two phases half a cycle apart, each invisible at its own reset (water-flow.ts)
							const pa = fract(uTime.div(FLOW_CYCLE));
							const pb = fract(uTime.div(FLOW_CYCLE).add(0.5));
							const sh = FLOW_SPEED * FLOW_CYCLE;
							w.assign(
								float(1.0)
									.sub(abs(float(1.0).sub(pa.mul(2.0))))
									.mul(rippleAt(pl.sub(riverFlow3.mul(pa.mul(sh))), f1, f2, f3, nA))
									.add(
										float(1.0)
											.sub(abs(float(1.0).sub(pb.mul(2.0))))
											.mul(rippleAt(pl.sub(riverFlow3.mul(pb.mul(sh))), f1, f2, f3, nA))
									)
							);
						}
					).Else(() => {
						w.assign(rippleAt(pl, f1, f2, f3, nA));
					});
					wRip.assign(w);
					const rw1 = cross(dpdy, nBF);
					const rw2 = cross(nBF, dpdx);
					const dw = dot(dpdx, rw1);
					const gw = nBF
						.mul(abs(dw))
						.sub(
							rw1
								.mul(dFdx(w))
								.add(rw2.mul(dFdy(w)))
								.mul(sign(dw))
								.mul(1.8)
						)
						.toVar();
					const gwOk = dot(gw, gw)
						.greaterThan(1e-24)
						.and(nan(gw.x).or(nan(gw.y)).or(nan(gw.z)).not());
					Nw.assign(select(gwOk, normalize(gw), nBF));
					Nw.assign(normalize(Nw.add(normalize(nBF.sub(gWave)).sub(nBF))));
				});
				// the ripples of a river pass over its dark surface (moving brightness along the flow)
				col.mulAssign(riverMask.mul(lw.oneMinus()).mul(1.6).mul(wRip.sub(0.4)).add(1.0));
				return {
					albedo: col,
					normal: normalize(mix(Nw, Nb, lw)),
					spec: landW.oneMinus().add(riverMask.mul(0.3)),
					lampE
				};
			};

			const stars = (rd: N): N => {
				let col: N = vec3(0.0);
				for (let layer = 0; layer < 3; layer++) {
					const scale = 55.0 * 2.1 ** layer;
					const p = rd.mul(scale);
					const cell = floor(p);
					const h = hash33i(ivec3(cell).add(ivec3(layer * 977)));
					const pos = cell.add(0.2).add(h.mul(0.6));
					const d = length(p.sub(pos));
					const rad = max(pixelAngle.mul(0.5 * scale), 0.02);
					const mag = pow(hash13i(ivec3(cell).add(ivec3(layer * 31 + 5))), 14.0);
					const w = smoothstep(rad, 0.0, d).mul(mag).mul(h.x.mul(3.5).add(0.5));
					const tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), h.y);
					col = col.add(tint.mul(w).mul(layer === 0 ? 6.0 : 3.0));
				}
				const gal = normalize(vec3(0.3, 0.8, 0.5));
				const gd = dot(rd, gal).div(0.16);
				const band = exp(gd.mul(gd).negate());
				const clumps = fbmF(rd.mul(5.0).add(11.0), 4);
				col = col.add(vec3(0.55, 0.6, 0.8).mul(band).mul(clumps.mul(clumps).mul(0.07).add(0.012)));
				return col.mul(uStarBright);
			};

			/** Height of the ray point at t above the sea sphere, without float32's 6 cm loss at 600 km. */
			const rayAltitude = (r0: N, d: N, t: N, p: N): N =>
				r0
					.sub(uR)
					.mul(uR.mul(2.0).add(r0.sub(uR)))
					.add(r0.mul(t).mul(d).mul(2.0))
					.add(t.mul(t))
					.div(length(p).add(uR));
			const clearance = (r0: N, d: N, t: N, ro: N, rd: N): N => {
				const p = ro.add(rd.mul(t));
				const hs = terrain!.heightAndSlope(p);
				return { c: rayAltitude(r0, d, t, p).sub(hs.x), slope: hs.y };
			};

			/**
			 * `marchTerrain`: sphere-traces the baked heights from the camera; hit and distance, and for a
			 * miss the closest clearance in pixel footprints (sMin, negative across a crest) and where (tMin).
			 */
			const marchTerrain = (ro: N, rd: N, r0: N, d: N, tLimit: N, tFrom: N) => {
				const hit = bool(false).toVar();
				const tOut = float(0.0).toVar();
				const sMin = float(1e9).toVar();
				const tMin = float(0.0).toVar();
				const shell = raySphere(r0, d, uR.add(TERRAIN_MAX_HEIGHT));
				const t = max(shell.x, 0.0).toVar();
				const tEnd = min(shell.y, tLimit);
				If(uSkipR.greaterThan(0.0), () => {
					t.assign(max(t, uSkipR.div(sqrt(max(float(1.0).sub(d.mul(d)), 0.0025)))));
				});
				t.assign(max(t, tFrom));
				If(shell.y.greaterThan(0.0).and(t.lessThan(tEnd)), () => {
					const tP = float(0.0).toVar();
					const cP = float(1e9).toVar();
					const cM = float(1e9).toVar();
					const tN = float(0.0).toVar();
					const cN = float(-1.0).toVar();
					const grabNext = bool(false).toVar();
					const tPrev = float(t).toVar();
					const cPrev = float(1.0).toVar();
					const cHit = float(-1.0).toVar();
					Loop({ start: 0, end: steps, type: 'int', name: 'mi' }, ({ mi }: { mi: N }) => {
						If(float(mi).greaterThanEqual(uMarchSteps), () => {
							Break();
						});
						const p = ro.add(rd.mul(t));
						const r = length(p);
						const hs = terrain!.heightAndSlope(p);
						const c = rayAltitude(r0, d, t, p).sub(hs.x);
						If(c.lessThan(0.0), () => {
							hit.assign(true);
							cHit.assign(c);
							Break();
						});
						// the closest sample and its neighbours, for the parabola after the loop
						const sc = c.div(max(t.mul(pixelAngle), 1e-6));
						If(grabNext, () => {
							tN.assign(t);
							cN.assign(c);
							grabNext.assign(false);
						});
						If(sc.lessThan(sMin), () => {
							sMin.assign(sc);
							tMin.assign(t);
							cM.assign(c);
							tP.assign(tPrev);
							cP.assign(cPrev);
							grabNext.assign(true);
						});
						const mu = dot(rd, p.div(r));
						const dt = max(
							max(
								t.mul(mix(STEP_MIN_FRACTION, STEP_FAR_FRACTION, smoothstep(50.0, 500.0, t))),
								t.mul(pixelAngle).mul(1.5)
							),
							STEP_MIN_METRES
						).toVar();
						// a safe step from the local slope: gentle ground allows longer steps
						const slope = clamp(
							hs.y.mul(2.0).add(TERRAIN_MARCH_SLOPE_MIN),
							TERRAIN_MARCH_SLOPE_MIN,
							TERRAIN_MAX_SLOPE
						);
						dt.assign(max(dt, c.mul(STEP_RELAX).div(slope.add(max(mu.negate(), 0.0)))));
						const tStart = float(t).toVar();
						tPrev.assign(t);
						cPrev.assign(c);
						If(c.lessThan(dt.mul(0.5)), () => {
							// the step is longer than the clearance is safe for: look inside it for a thin crest
							const stop = bool(false).toVar();
							for (let j = 1; j < 3; j++) {
								If(stop.or(hit).not(), () => {
									const ts = tStart.add(dt.mul(j / 3));
									If(ts.greaterThanEqual(tEnd), () => {
										stop.assign(true);
									}).Else(() => {
										const cs = clearance(r0, d, ts, ro, rd).c;
										If(cs.lessThan(0.0), () => {
											hit.assign(true);
											t.assign(ts);
											cHit.assign(cs);
										}).Else(() => {
											tPrev.assign(ts);
											cPrev.assign(cs);
										});
									});
								});
							}
							If(hit, () => {
								Break();
							});
						});
						t.assign(tStart.add(dt));
						If(t.greaterThanEqual(tEnd), () => {
							t.assign(tEnd);
							cHit.assign(clearance(r0, d, t, ro, rd).c);
							hit.assign(cHit.lessThan(0.0));
							Break();
						});
					});
					If(hit.not(), () => {
						// the closest approach lies between samples: read the clearance where a parabola through
						// the closest sample and its neighbours is lowest (below zero: a crest between samples)
						If(
							uSilhouetteAA
								.greaterThan(0.5)
								.and(sMin.lessThan(1.5))
								.and(cN.greaterThanEqual(0.0))
								.and(tN.greaterThan(tMin))
								.and(tMin.greaterThan(tP))
								.and(cM.lessThanEqual(cP))
								.and(cM.lessThanEqual(cN)),
							() => {
								const x1 = tP.sub(tMin);
								const x3 = tN.sub(tMin);
								const den = x1.mul(x3).mul(x1.sub(x3));
								If(abs(den).greaterThan(1e-6), () => {
									const pa = x3
										.mul(cP.sub(cM))
										.sub(x1.mul(cN.sub(cM)))
										.div(den);
									const pb = x1
										.mul(x1)
										.mul(cN.sub(cM))
										.sub(x3.mul(x3).mul(cP.sub(cM)))
										.div(den);
									If(pa.greaterThan(0.0), () => {
										const tv = tMin.add(clamp(pb.negate().div(pa.mul(2.0)), x1, x3));
										const sv = clearance(r0, d, tv, ro, rd).c.div(max(tv.mul(pixelAngle), 1e-6));
										If(sv.lessThan(sMin), () => {
											sMin.assign(sv);
											tMin.assign(tv);
										});
									});
								});
							}
						);
					}).Else(() => {
						// Illinois (regula falsi): five evaluations land within millimetres
						const lo = float(tPrev).toVar();
						const hi = float(t).toVar();
						const fLo = float(cPrev).toVar();
						const fHi = float(cHit).toVar();
						const side = float(0.0).toVar();
						for (let k = 0; k < 5; k++) {
							const midT = lo.add(hi.sub(lo).mul(fLo).div(fLo.sub(fHi)));
							const fm = clearance(r0, d, midT, ro, rd).c;
							If(fm.lessThan(0.0), () => {
								hi.assign(midT);
								fHi.assign(fm);
								If(side.lessThan(-0.5), () => {
									fLo.mulAssign(0.5);
								});
								side.assign(-1.0);
							}).Else(() => {
								lo.assign(midT);
								fLo.assign(fm);
								If(side.greaterThan(0.5), () => {
									fHi.mulAssign(0.5);
								});
								side.assign(1.0);
							});
						}
						tOut.assign(hi);
					});
				});
				return { hit, tOut, sMin, tMin };
			};
			const raySphere = (r0: N, mu: N, rs: N): N => {
				const b = r0.mul(mu);
				const disc = b.mul(b).sub(r0.sub(rs).mul(r0.add(rs)));
				const s = sqrt(max(disc, 0.0));
				return select(disc.lessThan(0.0), vec2(-1.0), vec2(b.negate().sub(s), b.negate().add(s)));
			};
			/** Fraction of the sun reaching a terrain point: a short march of the horizon toward the sun. */
			const terrainShadow = (pI: N, sunI: N): N => {
				let vis: N = float(1.0);
				let s = 90.0;
				for (let i = 0; i < shadowSteps; i++) {
					const q = pI.add(sunI.mul(s));
					const c = length(q).sub(uR).sub(terrain!.heightAndSlope(q).x);
					vis = min(vis, clamp(c.div(0.12 * s).add(0.05), 0.0, 1.0));
					s *= 2.2;
				}
				return vis;
			};

			const R0 = U.uR!.value as number;
			const atm = this.atm;
			const mieScat = atm.betaMie / 1.1;
			/**
			 * `shaftLoss` (plan 054, ADR 0070): a second march along the ray; a sample under the cumulus slab
			 * loses the share of its sun that the slab (and the terrain) blocks. Mie in-scatter removed,
			 * before the gain, over the whole path and in front of tcA and tcB.
			 */
			const shaftLoss = (ro: N, rd: N, t0: N, t1: N, l: N, jit: N, tcA: N, tcB: N) => {
				const all = vec3(0.0).toVar();
				const toA = vec3(0.0).toVar();
				const toB = vec3(0.0).toVar();
				const len = max(min(t1, t0.add(SHAFT.range)).sub(t0), 0.0).toVar();
				const g = atm.mieG;
				const mieK = float(mieScat).mul(
					float((1 - g * g) / (4 * PI)).div(pow(float(1 + g * g).sub(dot(rd, l).mul(2 * g)), 1.5))
				);
				const maskC = clamp(uCloudCover.mul(2.0), 0.0, 1.0);
				const midAlt = uCloudAlt.add(CLOUD_THICKNESS / 2);
				const od = vec3(0.0).toVar();
				Loop({ start: 0, end: cfg.shaftSteps, type: 'int', name: 'hi' }, ({ hi }: { hi: N }) => {
					const u = float(hi).add(jit).div(cfg.shaftSteps);
					const sDist = t0.add(len.mul(u).mul(u)).toVar();
					const ds = len.mul(2.0).mul(u).div(cfg.shaftSteps);
					const p = ro.add(rd.mul(sDist)).toVar();
					const rr = length(p).toVar();
					const hh = max(rr.sub(uR), 0.0).toVar();
					const dM = exp(hh.negate().div(atm.mieHeight)).mul(ds).toVar();
					const oz = max(
						select(
							hh.lessThan(25000.0),
							hh.sub(10000.0).div(15000.0),
							float(40000.0).sub(hh).div(15000.0)
						),
						0.0
					);
					od.addAssign(vec3(exp(hh.negate().div(atm.rayleighHeight)).mul(ds), dM, oz.mul(ds)));
					const np = p.div(rr);
					const sunMu = dot(np, l).toVar();
					If(sunMu.greaterThanEqual(SHAFT.minSunMu), () => {
						const occ = float(0.0).toVar();
						If(rr.lessThan(uCloudTop), () => {
							const tq = select(
								rr.lessThan(midAlt),
								max(raySphere(rr, sunMu, midAlt).y, 0.0),
								float(0.0)
							).toVar();
							const q = p.add(l.mul(tq));
							const rq = rotY(uBodyInv.mul(normalize(q)), uCloudAngle);
							const cov = (cloudMap ? cloudMap.at(rq).x : float(0.0)).mul(maskC);
							occ.assign(
								smoothstep(uCloudAlt, uCloudTop, rr)
									.oneMinus()
									.mul(1 - SHAFT.leak)
									.mul(float(1.0).sub(exp(cov.mul(-SHAFT.tau).div(max(sunMu, SHAFT.muMin)))))
									.mul(smoothstep(SHAFT.fadeFrom, SHAFT.fadeTo, tq).oneMinus())
							);
						});
						if (terrain && cfg.shaftTerrain > 0) {
							If(uTerrainOn.greaterThan(0.5), () => {
								const reach = min(
									float(SHAFT_TERRAIN.maxReach),
									float(SHAFT_TERRAIN.topHeight).sub(hh).div(max(sunMu, SHAFT_TERRAIN.minMu))
								).toVar();
								If(reach.greaterThan(0.0), () => {
									let vis: N = float(1.0);
									for (let k = 0; k < cfg.shaftTerrain; k++) {
										const fk = (k + 1) / cfg.shaftTerrain;
										const sq = reach.mul(fk * fk);
										const q = p.add(l.mul(sq));
										const c = length(q)
											.sub(uR)
											.sub(terrain.cubeHeight(uBodyInv.mul(normalize(q))));
										vis = min(
											vis,
											clamp(
												c.div(
													max(sunMu, SHAFT_TERRAIN.minPenumbraMu)
														.mul(SHAFT_TERRAIN.penumbra)
														.mul(sq)
												),
												0.0,
												1.0
											)
										);
									}
									occ.assign(float(1.0).sub(occ.oneMinus().mul(vis)));
								});
							});
						}
						If(occ.greaterThan(0.0), () => {
							const tCam = exp(
								vec3(...atm.betaRayleigh)
									.mul(od.x)
									.add(vec3(od.y.mul(atm.betaMie * 1.1)))
									.add(vec3(...atm.betaOzone).mul(od.z))
									.negate()
							);
							const loss = tCam.mul(sky.sunlight(p, l)).mul(mieK.mul(dM).mul(occ));
							all.addAssign(loss);
							If(sDist.lessThan(tcA), () => {
								toA.addAssign(loss);
							});
							If(sDist.lessThan(tcB), () => {
								toB.addAssign(loss);
							});
						});
					});
				});
				return { all, toA, toB };
			};

			const auroraProfile = (hgt: N): N => {
				let e: N = vec3(0.0);
				for (const lobe of AURORA.lobes) {
					const sg = select(hgt.lessThan(lobe.peak), float(lobe.below), float(lobe.above));
					const x = hgt.sub(lobe.peak).div(sg);
					const k = (lobe.share * 2) / (Math.sqrt(2 * Math.PI) * (lobe.below + lobe.above));
					e = e.add(vec3(...lobe.colour.map((c) => c * k)).mul(exp(x.mul(x).mul(-0.5))));
				}
				return e;
			};
			const rate = (turns: number): number => (2 * Math.PI * turns) / AURORA.period;
			const auroraFootprint = (colat: N, psi: N, t: N, filt: N): N => {
				const warp = sin(psi.mul(3.0).add(t.mul(rate(AURORA.turns.foldA))))
					.mul(AURORA.foldAmplitude[0])
					.add(
						sin(
							psi
								.mul(7.0)
								.sub(t.mul(rate(AURORA.turns.foldB)))
								.add(1.3)
						).mul(AURORA.foldAmplitude[1])
					)
					.add(
						sin(
							psi
								.mul(13.0)
								.add(t.mul(rate(AURORA.turns.foldC)))
								.add(2.1)
						).mul(AURORA.foldAmplitude[2])
					);
				const cw = colat.sub(warp);
				const k = cos(psi).mul(0.5).add(0.5);
				const width = mix(AURORA.widthDay, AURORA.widthNight, k);
				const wide = sqrt(width.mul(width).add(filt.mul(filt)));
				const x = cw.sub(mix(AURORA.colatDay, AURORA.colatNight, k)).div(wide);
				const band = exp(x.mul(x).negate()).mul(width).div(wide);
				const sf = filt.div(AURORA.streakFilter);
				const streak = float(0.35)
					.div(sf.mul(sf).add(1.0))
					.mul(
						sin(
							psi
								.mul(23.0)
								.sub(t.mul(rate(AURORA.turns.rays)))
								.add(cw.mul(4.0 / (Math.PI / 180)))
						)
					)
					.add(0.65);
				const gaps = smoothstep(
					-0.4,
					0.5,
					sin(psi.mul(2.0).add(0.7)).mul(sin(psi.mul(5.0).sub(t.mul(rate(2)))))
				)
					.mul(0.75)
					.add(0.25);
				return clamp(band.mul(streak).mul(gaps), 0.0, 1.0);
			};
			/** Aurora emission between the ray's stretches of the shell; `far` lies beyond splitDist. */
			const auroraMarch = (ro: N, rd: N, r0: N, d: N, hitG: N, splitDist: N, jit: N) => {
				const near = vec3(0.0).toVar();
				const far = vec3(0.0).toVar();
				const sT = raySphere(r0, d, uR.add(AURORA.shellTop)).toVar();
				const sB = raySphere(r0, d, uR.add(AURORA.shellBase)).toVar();
				const a0 = max(sT.x, 0.0).toVar();
				const a1 = float(sT.y).toVar();
				const b0 = float(0.0).toVar();
				const b1 = float(0.0).toVar();
				const skip = sT.y.lessThanEqual(0.0).toVar();
				If(sB.y.greaterThan(0.0), () => {
					If(sB.x.greaterThan(0.0), () => {
						// outside the hollow, the ray dips into it
						b0.assign(sB.y);
						b1.assign(a1);
						a1.assign(sB.x);
						If(hitG, () => {
							b1.assign(b0);
						});
					}).Else(() => {
						// inside the hollow
						If(hitG, () => {
							skip.assign(true);
						});
						a0.assign(max(a0, sB.y));
					});
				});
				const len1 = max(a1.sub(a0), 0.0).toVar();
				const total = len1.add(max(b1.sub(b0), 0.0)).toVar();
				If(skip.not().and(total.greaterThan(0.0)), () => {
					const ds = total.div(cfg.auroraSteps).toVar();
					const filt = ds.mul(AURORA.filterShare / (R0 + AURORA.lobes[0]!.peak));
					Loop({ start: 0, end: cfg.auroraSteps, type: 'int', name: 'ri' }, ({ ri }: { ri: N }) => {
						const s0 = float(ri).add(jit).mul(ds);
						const sDist = select(s0.lessThan(len1), a0.add(s0), b0.add(s0.sub(len1))).toVar();
						const p = ro.add(rd.mul(sDist));
						const r = length(p);
						const n = p.div(r);
						const night = smoothstep(AURORA.nightNone, AURORA.nightFull, dot(n, uSunDir)).toVar();
						If(night.greaterThan(0.0), () => {
							const nb = uBodyInv.mul(n);
							const ca = clamp(dot(nb, uAuroraAxis), -1.0, 1.0);
							const pp = nb.sub(uAuroraAxis.mul(ca));
							const psi = atan(dot(pp, uAuroraSide), dot(pp, uAuroraMid));
							const fpA = auroraFootprint(acos(ca), psi, uAuroraTime, filt);
							const e = auroraProfile(r.sub(uR)).mul(fpA.mul(night).mul(ds).mul(AURORA.gain));
							If(sDist.lessThan(splitDist), () => {
								near.addAssign(e);
							}).Else(() => {
								far.addAssign(e);
							});
						});
					});
				});
				return { near, far };
			};

			const ndc = varying(positionGeometry.xy);
			const marchTex = this.marchTarget.texture;
			const halfTex = this.halfTarget.texture;
			/** `isEdgePixel` (half-res.ts): the half texels around this pixel disagree in depth or, on the sky, in colour. */
			const halfEdge = (): N => {
				const pp = screenCoordinate.xy.div(this.uFullSize).mul(this.uHalfSize).sub(0.5);
				const base = floor(pp);
				const f = pp.sub(base);
				const hi = ivec2(this.uHalfSize).sub(1);
				const i0 = clamp(ivec2(base), ivec2(0), hi);
				const i1 = clamp(ivec2(base).add(1), ivec2(0), hi);
				const t0 = textureLoad(halfTex, i0).toVar();
				const t1 = textureLoad(halfTex, ivec2(i1.x, i0.y)).toVar();
				const t2 = textureLoad(halfTex, ivec2(i0.x, i1.y)).toVar();
				const t3 = textureLoad(halfTex, i1).toVar();
				const ref = select(
					f.y.greaterThanEqual(0.5),
					select(f.x.greaterThanEqual(0.5), t3.w, t2.w),
					select(f.x.greaterThanEqual(0.5), t1.w, t0.w)
				);
				const dd = abs(vec4(t0.w, t1.w, t2.w, t3.w).sub(ref)).mul(this.uOctaves);
				const depthEdge = max(max(dd.x, dd.y), max(dd.z, dd.w)).greaterThan(EDGE_DEPTH_OCTAVES);
				const sky = min(min(t0.w, t1.w), min(t2.w, t3.w)).greaterThanEqual(SKY_DEPTH);
				const chroma = (t: N): N => t.z.sub(t.x).div(max(t.z.add(t.x), 1e-6));
				const c = vec4(chroma(t0), chroma(t1), chroma(t2), chroma(t3));
				const spread = max(max(c.x, c.y), max(c.z, c.w)).sub(min(min(c.x, c.y), min(c.z, c.w)));
				return depthEdge.or(sky.and(spread.greaterThan(EDGE_CHROMA)));
			};
			if (mode === 'prepass') {
				/** `coneStart` (march.glsl.ts): a cone-widened march of a block's centre ray. */
				return Fn(() => {
					const out = float(MARCH_NO_HIT).toVar();
					if (!terrain) return vec4(out, 0.0, 0.0, 1.0);
					const pixel = floor(screenCoordinate.xy).add(0.5).mul(MARCH_BLOCK);
					const ndcP = vec2(
						pixel.x.div(this.uPreSize.x).mul(2.0).sub(1.0),
						float(1.0).sub(pixel.y.div(this.uPreSize.y).mul(2.0))
					);
					const vp = uInvProj.mul(vec4(ndcP, 0.0, 1.0));
					const rd = normalize(uCamRot.mul(normalize(vp.xyz.div(vp.w)))).toVar();
					const h = max(uAlt, 0.0).toVar();
					const r0 = uR.add(h).toVar();
					const ro = uCamUp.mul(r0).toVar();
					const d = dot(uCamUp, rd).toVar();
					const cr = cross(uCamUp, rd);
					const disc = uR
						.mul(uR)
						.sub(r0.mul(r0).mul(dot(cr, cr)))
						.toVar();
					const tLimit = select(
						disc.greaterThan(0.0).and(d.lessThan(0.0)),
						h.mul(uR.mul(2.0).add(h)).div(r0.mul(d.negate()).add(sqrt(max(disc, 0.0)))),
						float(1e9)
					).toVar();
					const widen = this.uConeAngle.mul(1.0 + TERRAIN_MAX_SLOPE);
					const shell = raySphere(r0, d, uR.add(TERRAIN_MAX_HEIGHT)).toVar();
					const t = max(shell.x, 0.0).toVar();
					const tEnd = min(shell.y, tLimit).toVar();
					If(uSkipR.greaterThan(0.0), () => {
						t.assign(max(t, uSkipR.div(sqrt(max(float(1.0).sub(d.mul(d)), 0.0025)))));
					});
					If(
						shell.y.greaterThan(0.0).and(t.lessThan(tEnd)).and(uTerrainOn.greaterThan(0.5)),
						() => {
							const tPrev = float(t).toVar();
							const done = bool(false).toVar();
							Loop({ start: 0, end: steps, type: 'int', name: 'pi' }, ({ pi }: { pi: N }) => {
								void pi;
								const p = ro.add(rd.mul(t));
								const r = length(p);
								const hs = terrain.heightAndSlope(p);
								const cone = rayAltitude(r0, d, t, p).sub(hs.x).sub(t.mul(widen)).toVar();
								If(cone.lessThan(0.0), () => {
									out.assign(tPrev);
									done.assign(true);
									Break();
								});
								const slope = clamp(
									hs.y.mul(2.0).add(TERRAIN_MARCH_SLOPE_MIN),
									TERRAIN_MARCH_SLOPE_MIN,
									TERRAIN_MAX_SLOPE
								);
								const mu = dot(rd, p.div(r));
								const dt = max(
									max(
										t.mul(mix(STEP_MIN_FRACTION, STEP_FAR_FRACTION, smoothstep(50.0, 500.0, t))),
										t.mul(pixelAngle).mul(1.5)
									),
									STEP_MIN_METRES
								).toVar();
								dt.assign(max(dt, cone.mul(STEP_RELAX).div(slope.add(max(mu.negate(), 0.0)))));
								If(cone.lessThan(dt.mul(0.5)), () => {
									// a step long against the clearance: look inside it for a thin crest in the cone
									for (let j = 1; j < 3; j++) {
										If(done.not(), () => {
											const ts = t.add(dt.mul(j / 3));
											If(ts.lessThan(tEnd), () => {
												If(clearance(r0, d, ts, ro, rd).c.sub(ts.mul(widen)).lessThan(0.0), () => {
													out.assign(t);
													done.assign(true);
												});
											});
										});
									}
									If(done, () => {
										Break();
									});
								});
								tPrev.assign(t);
								t.addAssign(dt);
								If(t.greaterThanEqual(tEnd), () => {
									t.assign(tEnd);
									If(clearance(r0, d, t, ro, rd).c.sub(t.mul(widen)).lessThan(0.0), () => {
										out.assign(tPrev);
									});
									done.assign(true);
									Break();
								});
							});
							If(done.not(), () => {
								out.assign(tPrev);
							});
						}
					);
					return vec4(out, 0.0, 0.0, 1.0);
				})();
			}
			const main = Fn(() => {
				if (mode === 'edge')
					If(halfEdge().not(), () => {
						Discard();
					});
				// Every value the branches below share is a variable declared here: TSL declares a shared
				// expression where it is first used, so one first used inside a branch (the terrain's air
				// march) is unset in the other (the sky) and the sky read the table with no camera.
				const vp = uInvProj.mul(vec4(ndc, 0.0, 1.0));
				const rd = normalize(uCamRot.mul(normalize(vp.xyz.div(vp.w)))).toVar();
				const fwd = uCamRot.mul(vec3(0.0, 0.0, -1.0)).toVar();
				const R = uR;
				const h = max(uAlt, 0.0).toVar();
				const r0 = R.add(h).toVar();
				const ro = uCamUp.mul(r0).toVar();
				const d = dot(uCamUp, rd).toVar();
				const cr = cross(uCamUp, rd);
				const s2 = dot(cr, cr);
				const disc = R.mul(R).sub(r0.mul(r0).mul(s2)).toVar();
				const hitP = disc.greaterThan(0.0).and(d.lessThan(0.0)).toVar();
				const tHit = h
					.mul(R.mul(2.0).add(h))
					.div(r0.mul(d.negate()).add(sqrt(max(disc, 0.0))))
					.toVar();
				// terrain: the first hit of the baked heights before the sea-level sphere (ADR 0036)
				const hitT = bool(false).toVar();
				const tT = float(0.0).toVar();
				if (terrain) {
					// the march prepass already crossed the empty air of this pixel's block
					const tFrom = select(
						this.uMarchOn.greaterThan(0.5),
						textureLoad(
							marchTex,
							ivec2(screenCoordinate.xy.mul(mode === 'edge' ? this.uMarchScale : float(1.0))).div(
								MARCH_BLOCK
							)
						).x,
						float(0.0)
					).toVar();
					If(uTerrainOn.greaterThan(0.5).and(tFrom.lessThan(MARCH_NO_HIT * 0.5)), () => {
						const m = marchTerrain(ro, rd, r0, d, select(hitP, tHit, float(1e9)), tFrom);
						hitT.assign(m.hit);
						tT.assign(m.tOut);
						// a crest stepped over between two samples: the ground is there, not the sea behind it
						If(m.hit.not().and(m.sMin.lessThan(0.0)).and(uSilhouetteAA.greaterThan(0.5)), () => {
							hitT.assign(true);
							tT.assign(m.tMin);
						});
					});
				}
				const hitG = hitP.or(hitT).toVar();
				const tG = select(hitT, tT, tHit).toVar();
				const base = vec3(0.0).toVar();
				const depthZ = float(-1.0).toVar();
				If(hitG, () => {
					// variables, not expressions: the branches below share them (see the top of main)
					const rdBF = uBodyInv.mul(rd).toVar();
					const pl = uCamLocal.add(rdBF.mul(tG)).toVar();
					const posRel = ro.add(rd.mul(tG)).toVar();
					const nI = normalize(posRel).toVar();
					const nBF = uBodyInv.mul(nI).toVar();
					const hT = float(0.0).toVar();
					const gT = vec3(0.0).toVar();
					const nGeoI = vec3(nI).toVar();
					if (terrain) {
						If(hitT, () => {
							const ter = terrain.terrainAt(posRel);
							hT.assign(ter.x);
							gT.assign(ter.yzw);
							// body-fixed back to inertial: the transpose of uBodyInv
							nGeoI.assign(normalize(nI.sub(transpose(uBodyInv).mul(gT))));
						});
					}
					const cosv = max(abs(dot(nGeoI, rd)), 0.03);
					const footprint = max(tG.mul(pixelAngle).div(cosv), 0.002).toVar();
					const sf = surfaceAt(nBF, pl, footprint, rdBF.mul(tG), hT, gT);
					// a grazing ray sees the rim of a slope edge-on: lean the normal back to level ground
					const graze = select(
						hitT.and(uSilhouetteAA.greaterThan(0.5)),
						smoothstep(0.03, 0.2, abs(dot(nGeoI, rd))).oneMinus(),
						float(0.0)
					);
					// the normal is built from screen derivatives, which are undefined next to a pixel that
					// took another branch (a silhouette): a NaN there falls back to the geometric normal
					const nv = mix(sf.normal, nBF, graze).toVar();
					const normal = select(
						nan(nv.x).or(nan(nv.y)).or(nan(nv.z)).or(dot(nv, nv).lessThan(1e-12)),
						nBF,
						normalize(nv)
					).toVar();
					const Lb = uSunBF;
					const ndl = max(dot(normal, Lb), 0.0);
					const geo = dot(nBF, Lb);
					const sunT = sky.sunlight(posRel, uSunDir);
					const sh = float(shadowFactor(uCamPos.add(rd.mul(tG)))).toVar();
					if (terrain && shadowSteps > 0) {
						// the shadow march cannot resolve ridges once a pixel is hundreds of metres wide
						If(hitT.and(geo.greaterThan(-0.05)).and(footprint.lessThan(160.0)), () => {
							const vis = terrainShadow(posRel.add(nGeoI.mul(2.0)), uSunDir);
							sh.mulAssign(mix(mix(vis, 1.0, smoothstep(40.0, 160.0, footprint)), 1.0, graze));
						});
					}
					const k = max(0.0, smoothstep(-0.2, 0.4, geo).add(0.02)).div(
						max(smoothstep(-0.2, 0.4, uAmbientRefMu).add(0.02), 0.02)
					);
					// a slope sees less of the sky than level ground
					const skyVis = dot(normal, nBF).mul(0.5).add(0.5);
					const amb = uAmbient
						.mul(k)
						.mul(skyVis)
						.add(vec3(...NIGHT_AMBIENT).mul(PI));
					if (cfg.cloudShadowMap && cloudMap) {
						// one fetch of the baked density instead of the noise (plan 056): the sun ray through the slab
						If(geo.greaterThan(0.04), () => {
							const scl = raySphere(R, geo, uCloudAlt).y;
							const q = nBF.mul(R).add(Lb.mul(scl));
							sh.mulAssign(
								float(1.0).sub(cloudMap.at(rotY(normalize(q), uCloudAngle)).y.mul(0.45))
							);
						});
					}
					const lit = sf.albedo
						.div(PI)
						.mul(uSunIrr.mul(sunT).mul(ndl).mul(sh).add(amb).add(sf.lampE))
						.toVar();
					If(sf.spec.greaterThan(0.0), () => {
						const V = rdBF.negate();
						const Hh = normalize(Lb.add(V));
						const nh = max(dot(normal, Hh), 0.0);
						const fres = pow(float(1.0).sub(max(dot(normal, V), 0.0)), 5.0)
							.mul(0.98)
							.add(0.02);
						const glint = pow(nh, 900.0)
							.mul(900.0 / (8.0 * PI))
							.mul(ndl)
							.mul(sh);
						const refl = uSkyColour.mul(fres).mul(1.2);
						lit.assign(
							mix(lit, refl, fres.mul(0.9)).add(
								uSunIrr.mul(sunT).mul(glint).mul(fres).mul(0.5).mul(sf.spec)
							)
						);
					});
					base.assign(lit);
					depthZ.assign(tG.mul(dot(rd, fwd)));
				}).Else(() => {
					If(uStarBright.greaterThan(0.002), () => {
						base.assign(stars(rd));
					});
					const ang = select(dot(rd, uSunDir).greaterThan(0.0), length(cross(rd, uSunDir)), 2.0);
					const disc2 = smoothstep(
						SUN_ANGULAR_RADIUS * 0.8,
						SUN_ANGULAR_RADIUS * 1.08,
						ang
					).oneMinus();
					const x = clamp(ang.div(SUN_ANGULAR_RADIUS), 0.0, 1.0);
					const limb = float(1.0).sub(
						sqrt(float(1.0).sub(x.mul(x)))
							.oneMinus()
							.mul(0.55)
					);
					base.addAssign(vec3(1.0, 0.96, 0.9).mul(SUN_DISC_RADIANCE).mul(disc2).mul(limb));
				});
				// --- the air, the clouds, the shafts and the aurora in front of base ----------------------
				const jitter = fract(
					fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189)
				).toVar();
				const atmS = raySphere(r0, d, uR.add(uAtmH)).toVar();
				const t0 = max(atmS.x, 0.0).toVar();
				const t1 = select(hitG, min(atmS.y, tG), atmS.y).toVar();
				const inAtm = atmS.y.greaterThan(0.0).and(t1.greaterThan(t0)).toVar();
				const auroraNear = vec3(0.0).toVar();
				if (cfg.auroraSteps > 0) {
					If(uAurora.greaterThan(0.001), () => {
						const ar = auroraMarch(
							ro,
							rd,
							r0,
							d,
							hitG,
							select(inAtm, t0, float(1e30)),
							fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453))
						);
						base.addAssign(ar.far.mul(uAurora));
						auroraNear.assign(ar.near.mul(uAurora));
					});
				}
				// cloud layers (ADR 0037): 1 = cumulus, 2 = cirrus; a layer the ray misses or finds clear stays at 1e30
				const tcA = float(1e30).toVar();
				const tcB = float(1e30).toVar();
				const hitA = bool(false).toVar();
				const alphaA = float(0.0).toVar();
				const lightA = vec3(0.0).toVar();
				const cloudTA = float(1e30).toVar();
				const csT = raySphere(r0, d, uCloudTop).toVar();
				const csA = raySphere(r0, d, uCloudAlt).toVar();
				If(inAtm.and(csT.y.greaterThan(0.0)), () => {
					// the stretch of the ray inside the slab (twin: slabInterval in cloud-volume.ts)
					const a0 = max(csT.x, 0.0).toVar();
					const a1 = float(csT.y).toVar();
					If(csA.y.greaterThan(0.0), () => {
						If(r0.lessThanEqual(uCloudAlt), () => {
							a0.assign(max(csA.y, 0.0));
						})
							.ElseIf(csA.x.greaterThan(a0), () => {
								a1.assign(min(a1, csA.x));
							})
							.Else(() => {
								a0.assign(max(a0, csA.y));
							});
					});
					If(hitG, () => {
						a1.assign(min(a1, tG));
					});
					If(a1.greaterThan(a0), () => {
						const len = a1.sub(a0).toVar();
						const marchLen = min(len, CLOUD_MAX_PATH).toVar();
						const dt = marchLen.div(cfg.cloudSteps).toVar();
						const tm = a0.add(marchLen.mul(0.5)).toVar();
						const nm = normalize(ro.add(rd.mul(tm))).toVar();
						const fp = tm
							.mul(pixelAngle)
							.div(max(abs(dot(nm, rd)), 0.05))
							.toVar();
						const coverD = cloudDensityQ(
							rotY(uBodyInv.mul(nm), uCloudAngle).mul(R0 / 16000),
							false,
							fp,
							cfg.cloudOctaves,
							uCloudCover
						);
						const cover = smoothstep(0.08, 0.55, coverD).toVar();
						const mask = clamp(uCloudCover.mul(2.0), 0.0, 1.0)
							.mul(smoothstep(45000.0, 120000.0, tm).oneMinus())
							.toVar();
						If(cover.mul(mask).greaterThanEqual(0.004), () => {
							const cj = fract(jitter.add(0.381966)).mul(0.5).add(0.25);
							const cosS = dot(rd, uSunDir).toVar();
							const sunTc = sky
								.sunlight(nm.mul(uCloudAlt.add(0.5 * CLOUD_THICKNESS)), uSunDir)
								.toVar();
							const trans = float(1.0).toVar();
							const acc = vec3(0.0).toVar();
							const densSum = float(0.0).toVar();
							Loop(
								{ start: 0, end: cfg.cloudSteps, type: 'int', name: 'ci' },
								({ ci }: { ci: N }) => {
									const t = a0.add(float(ci).add(cj).mul(dt));
									const pp = ro.add(rd.mul(t)).toVar();
									const rr = length(pp);
									const np = pp.div(rr).toVar();
									const hh = clamp(rr.sub(uCloudAlt).div(CLOUD_THICKNESS), 0.0, 1.0).toVar();
									const eP = cloudErosion(
										uBodyInv.mul(np),
										fp,
										cfg.cloudDetail,
										uCloudAngle,
										R0
									).toVar();
									const dn = cloudSlabDensity(cover, hh, eP).toVar();
									densSum.addAssign(dn);
									If(dn.greaterThan(0.002), () => {
										const tauL = cloudSunDepth(hh, cover, dot(np, uSunDir)).toVar();
										const ps = pp.add(uSunDir.mul(450.0));
										const rs = length(ps);
										const hs = clamp(rs.sub(uCloudAlt).div(CLOUD_THICKNESS), 0.0, 1.0);
										tauL.addAssign(
											cloudSlabDensity(
												cover,
												hs,
												cloudErosion(uBodyInv.mul(ps.div(rs)), fp, 1, uCloudAngle, R0)
											).mul(CLOUD_SIGMA * 450)
										);
										const stepTau = dn.mul(CLOUD_SIGMA).mul(dt);
										const direct = uSunIrr
											.mul(sunTc)
											.mul(
												cloudScatterGain(tauL, cosS)
													.mul(cloudPowder(stepTau, cosS))
													.add(cloudFill(tauL, hh))
											);
										const ambC = uAmbient.mul(hh.mul(0.55).add(0.65));
										const Ls = vec3(0.93 / PI)
											.mul(direct.add(ambC))
											.mul(cloudBillowShade(eP))
											.add(vec3(...NIGHT_AMBIENT).mul(0.6));
										const stepA = float(1.0).sub(exp(stepTau.negate()));
										acc.addAssign(Ls.mul(trans).mul(stepA));
										trans.mulAssign(stepA.oneMinus());
									});
								}
							);
							const opacity = float(1.0).sub(trans).toVar();
							If(len.greaterThan(marchLen), () => {
								// the rest of a grazing path: the average density, lit like what was marched
								const eTau = densSum
									.div(cfg.cloudSteps)
									.mul(CLOUD_SIGMA)
									.mul(min(len.sub(marchLen), CLOUD_EXTRA_PATH));
								const Lm = acc.div(max(opacity, 1e-3));
								acc.addAssign(Lm.mul(trans).mul(float(1.0).sub(exp(eTau.negate()))));
								trans.mulAssign(exp(eTau.negate()));
								opacity.assign(float(1.0).sub(trans));
							});
							alphaA.assign(opacity.mul(mask));
							const lm = acc.div(max(opacity, 1e-4));
							lightA.assign(lm.div(lm.div(CLOUD_RADIANCE_KNEE).add(1.0)));
							cloudTA.assign(tm);
							hitA.assign(alphaA.greaterThanEqual(0.002));
							alphaA.assign(select(hitA, alphaA, float(0.0)));
						});
					});
				});
				const csB = raySphere(r0, d, uCirrusAlt).toVar();
				const cloudTB = select(r0.lessThan(uCirrusAlt), csB.y, csB.x).toVar();
				const hitB = inAtm
					.and(csB.y.greaterThan(0.0))
					.and(cloudTB.greaterThan(0.0))
					.and(hitG.not().or(cloudTB.lessThan(tG)))
					.toVar();
				const alphaB = float(0.0).toVar();
				If(hitB, () => {
					alphaB.assign(
						cirrusDensity(uBodyInv.mul(normalize(ro.add(rd.mul(cloudTB)))), uCloudAngle, R0)
					);
					If(alphaB.lessThan(0.003), () => {
						hitB.assign(false);
						alphaB.assign(0.0);
					});
				});
				// nearest layer first: slot 1 snapshot at tcA, slot 2 at tcB
				const aFirst = hitB
					.not()
					.or(hitA.and(cloudTA.lessThanEqual(cloudTB)))
					.toVar();
				If(hitA.and(hitB), () => {
					tcA.assign(select(aFirst, cloudTA, cloudTB));
					tcB.assign(select(aFirst, cloudTB, cloudTA));
				})
					.ElseIf(hitA, () => {
						tcA.assign(cloudTA);
					})
					.ElseIf(hitB, () => {
						tcA.assign(cloudTB);
					});

				// the in-scatter and transmittance in front of base (and up to each cloud layer)
				const ins = vec3(0.0).toVar();
				const tr = vec3(1.0).toVar();
				const insA = vec3(0.0).toVar();
				const trA = vec3(1.0).toVar();
				const insB = vec3(0.0).toVar();
				const trB = vec3(1.0).toVar();
				If(inAtm, () => {
					// terrain reads through a thinner veil than the model gives (terrainVeil in atmosphere-model.ts)
					const veil = select(
						hitT,
						mix(
							float(TERRAIN_VEIL.near),
							1.0,
							smoothstep(TERRAIN_VEIL.fadeFrom, TERRAIN_VEIL.fadeTo, tG)
						),
						float(1.0)
					)
						.mul(SKY_GAIN)
						.toVar();
					If(hitA.or(hitB), () => {
						// clouds: one march of the air with the state at each layer, as the GLSL's marchAtmosphere
						const sc = sky.march(
							ro,
							rd,
							t0,
							t1,
							tcA,
							tcB,
							cfg.viewSamples,
							select(h.lessThan(uAtmH), float(2.0), float(1.0)),
							jitter
						);
						ins.assign(sc.inscatter.mul(veil));
						tr.assign(sc.transmittance);
						insA.assign(sc.insA.mul(veil));
						trA.assign(sc.transA);
						insB.assign(sc.insB.mul(veil));
						trB.assign(sc.transB);
					})
						.ElseIf(hitT, () => {
							const seg = sky.segment(ro, rd, t0, tG, 12);
							ins.assign(seg.inscatter.mul(veil));
							tr.assign(seg.transmittance);
						})
						.Else(() => {
							ins.assign(sky.inscatter(ro, rd).mul(SKY_GAIN));
							tr.assign(sky.viewTransmittance(ro, rd, hitP, tHit));
						});
					if (cfg.shaftSteps > 0) {
						If(
							uShaft
								.greaterThan(0.01)
								.and(
									uCloudCover.greaterThan(0.02).or(cfg.shaftTerrain > 0 ? bool(true) : bool(false))
								)
								.and(dot(rd, uSunDir).greaterThan(SHAFT.minCosToSun)),
							() => {
								const sl = shaftLoss(
									ro,
									rd,
									t0,
									t1,
									uSunDir,
									fract(jitter.add(0.618034)),
									tcA,
									tcB
								);
								const k = uShaft.mul(uSunIrr).mul(SHAFT.gain * SKY_GAIN);
								// segment by segment (the composite subtracts neighbours), never more than maxShare of one
								const dA = min(sl.toA.mul(k), insA.mul(SHAFT.maxShare));
								const dB = min(
									max(sl.toB.sub(sl.toA), 0.0).mul(k),
									insB.sub(insA).mul(SHAFT.maxShare)
								);
								const dC = min(
									max(sl.all.sub(sl.toB), 0.0).mul(k),
									ins.sub(insB).mul(SHAFT.maxShare)
								);
								If(hitA.or(hitB), () => {
									insA.subAssign(dA);
									insB.subAssign(dA.add(dB));
								});
								ins.subAssign(
									select(
										hitA.or(hitB),
										dA.add(dB).add(dC),
										min(sl.all.mul(k), ins.mul(SHAFT.maxShare))
									)
								);
							}
						);
					}
				});
				const colour = base.mul(tr).add(ins).toVar();
				If(inAtm.and(hitA.or(hitB)), () => {
					const lightB = vec3(0.0).toVar();
					If(hitB, () => {
						const dirI = normalize(ro.add(rd.mul(cloudTB)));
						const muc = dot(dirI, uSunDir);
						const sunTc = sky.sunlight(dirI.mul(uCirrusAlt), uSunDir);
						const hg = hgPhase(dot(rd, uSunDir), 0.65).mul(4 * PI);
						const phase = clamp(hg, 0.0, 4.0).mul(0.3).add(0.7);
						lightB.assign(
							vec3(0.97 / PI)
								.mul(
									uSunIrr.mul(sunTc).mul(max(muc, 0.0)).mul(phase).mul(1.35).add(uAmbient.mul(0.7))
								)
								.add(vec3(...NIGHT_AMBIENT).mul(0.5))
						);
					});
					// slot order: (1) the nearer layer, (2) the farther one
					const l1 = vec3(lightA).toVar();
					const l2 = vec3(lightB).toVar();
					const a1 = float(alphaA).toVar();
					const a2 = float(alphaB).toVar();
					If(hitA.and(hitB), () => {
						If(aFirst.not(), () => {
							l1.assign(lightB);
							l2.assign(lightA);
							a1.assign(alphaB);
							a2.assign(alphaA);
						});
					})
						.ElseIf(hitB, () => {
							l1.assign(lightB);
							a1.assign(alphaB);
							l2.assign(vec3(0.0));
							a2.assign(0.0);
						})
						.Else(() => {
							l2.assign(vec3(0.0));
							a2.assign(0.0);
						});
					colour.assign(
						insA.add(trA.mul(l1).mul(a1)).add(
							a1.oneMinus().mul(
								max(insB.sub(insA), 0.0)
									.add(trB.mul(l2).mul(a2))
									.add(a2.oneMinus().mul(max(ins.sub(insB), 0.0).add(tr.mul(base))))
							)
						)
					);
				});
				colour.addAssign(auroraNear);
				// one NaN would smear through the bloom over the whole frame
				const bad = nan(colour.x).or(nan(colour.y)).or(nan(colour.z));
				colour.assign(select(bad, vec3(0.0), min(colour, vec3(200.0))));
				return vec4(colour, depthZ);
			});
			return main();
		};
		const logDepth = (viewZ: N): N =>
			select(
				viewZ.greaterThan(0.0),
				viewZToLogarithmicDepth(viewZ.negate(), this.uNear, this.uFar),
				float(1.0)
			);
		const quad = vec4(positionGeometry.xy, 0.0, 1.0);
		// the full pass, and the edge pass of the half rung: colour and the depth meshes sort against
		for (const [material, mode] of [
			[this.material, 'full'],
			[this.edgeMaterial, 'edge']
		] as const) {
			const result = graph(mode);
			material.vertexNode = quad;
			material.colorNode = vec4(result.xyz, 1.0);
			material.depthNode = logDepth(result.w);
			material.needsUpdate = true;
		}
		// the half-size pass: radiance, and the depth in alpha for the upsample (raw, not tone-mapped)
		const half = graph('half');
		this.halfMaterial.vertexNode = quad;
		this.halfMaterial.fragmentNode = vec4(half.xyz, logDepth(half.w));
		this.halfMaterial.needsUpdate = true;
		this.preMaterial.vertexNode = quad;
		this.preMaterial.fragmentNode = graph('prepass');
		this.preMaterial.needsUpdate = true;
		// the depth-aware upsample (upsampleWeights in half-res.ts)
		const halfTex = this.halfTarget.texture;
		const up = Fn(() => {
			const pp = screenCoordinate.xy.div(this.uFullSize).mul(this.uHalfSize).sub(0.5);
			const base = floor(pp);
			const f = pp.sub(base).toVar();
			const hi = ivec2(this.uHalfSize).sub(1);
			const i0 = clamp(ivec2(base), ivec2(0), hi);
			const i1 = clamp(ivec2(base).add(1), ivec2(0), hi);
			const t0 = textureLoad(halfTex, i0).toVar();
			const t1 = textureLoad(halfTex, ivec2(i1.x, i0.y)).toVar();
			const t2 = textureLoad(halfTex, ivec2(i0.x, i1.y)).toVar();
			const t3 = textureLoad(halfTex, i1).toVar();
			const b = vec4(
				f.x.oneMinus().mul(f.y.oneMinus()),
				f.x.mul(f.y.oneMinus()),
				f.x.oneMinus().mul(f.y),
				f.x.mul(f.y)
			);
			const ref = select(
				f.y.greaterThanEqual(0.5),
				select(f.x.greaterThanEqual(0.5), t3.w, t2.w),
				select(f.x.greaterThanEqual(0.5), t1.w, t0.w)
			);
			const dd = vec4(t0.w, t1.w, t2.w, t3.w)
				.sub(ref)
				.mul(this.uOctaves)
				.div(UPSAMPLE_TOLERANCE_OCTAVES);
			const w = b.mul(exp(dd.mul(dd).negate())).toVar();
			w.divAssign(w.x.add(w.y).add(w.z).add(w.w));
			const colour = t0.xyz.mul(w.x).add(t1.xyz.mul(w.y)).add(t2.xyz.mul(w.z)).add(t3.xyz.mul(w.w));
			return vec4(colour, dot(vec4(t0.w, t1.w, t2.w, t3.w), w));
		})();
		this.upMaterial.vertexNode = quad;
		this.upMaterial.colorNode = vec4(up.xyz, 1.0);
		this.upMaterial.depthNode = up.w;
		this.upMaterial.needsUpdate = true;
	}
}
