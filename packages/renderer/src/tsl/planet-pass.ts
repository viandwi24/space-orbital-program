/**
 * The planet pass in TSL for the WebGPU renderer (plan 261 Phase 2, slice 2a; ADR 0242).
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
	Mesh,
	Vector3,
	type DataTexture,
	type IUniform,
	type PerspectiveCamera
} from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import {
	BEACH_WIDTH,
	HIGHLAND,
	SEA_LEVEL,
	TERRAIN_MAX_HEIGHT,
	TERRAIN_MAX_SLOPE
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
	private builtMap: DataTexture | null = null;
	private builtTerrain = -1;
	/** The sun's shadow map the shader samples (three's, once it exists), or null before. */
	private builtShadow: unknown = null;
	private needsBuild = true;
	private baked = false;
	private terrain: TerrainTSL | null = null;
	private readonly up = new Vector3();
	private readonly sun = new Vector3();

	constructor(
		private readonly planet: PlanetPass,
		atm: Atmosphere,
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
	}

	/** The preset's ground octaves and terrain steps; the shader is rebuilt when they change. */
	setSettings(settings: PresetSettings): void {
		const s = this.settings;
		this.needsBuild ||=
			settings.groundOctaves !== s.groundOctaves ||
			settings.terrainSteps !== s.terrainSteps ||
			settings.terrainShadowSteps !== s.terrainShadowSteps;
		this.settings = settings;
	}

	/**
	 * Bakes what the terrain needs, copies this frame's uniforms from the WebGL pass, follows its
	 * visibility and rebuilds the sky view for the camera. Call after the scene model's
	 * `prepareFrame`, before drawing.
	 */
	update(renderer: WebGPURenderer, camera: PerspectiveCamera, heightPx: number): void {
		const u = this.planet.material.uniforms;
		this.mesh.visible = this.planet.mesh.visible;
		if (!this.mesh.visible) return;
		const R = u.uR!.value as number;
		this.terrain ??= new TerrainTSL(this.planet, R, float32Filterable(renderer));
		this.terrain.bake(renderer);
		if (
			this.needsBuild ||
			u.uMap!.value !== this.builtMap ||
			this.shadowMap() !== this.builtShadow ||
			this.terrain.version !== this.builtTerrain
		)
			this.build();
		for (const s of this.syncs) s();
		this.pixelAngle.value =
			(2 * Math.tan(((camera.fov * Math.PI) / 180) * 0.5)) / Math.max(heightPx, 1);
		if (!this.baked) {
			this.sky.bake(renderer);
			this.baked = true;
		}
		this.up.copy(u.uCamUp!.value as Vector3);
		this.sun.copy(u.uSunDir!.value as Vector3);
		this.sky.update(renderer, R + Math.max(u.uAlt!.value as number, 0), this.up, this.sun);
	}

	dispose(): void {
		this.material.dispose();
		this.sky.dispose();
		this.terrain?.dispose();
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
		const map = this.builtMap;
		const pixelAngle = this.pixelAngle;
		const sky = this.sky;
		const octaves = this.settings.groundOctaves;
		const steps = Math.max(1, this.settings.terrainSteps);
		const shadowSteps = this.settings.terrainShadowSteps;
		const uAtmH = this.link('uAtmH');
		const uTerrainOn = this.link('uTerrainOn');
		const uSkipR = this.link('uSkipR');
		const uMarchSteps = this.link('uMarchSteps');
		const uSilhouetteAA = this.link('uSilhouetteAA');
		const shadowTex = this.builtShadow;
		const uShadowOn = this.link('uShadowOn');
		const uShadowMatrix = this.link('uShadowMatrix');
		const uShadowBias = this.link('uShadowBias');
		const uShadowTexel = this.link('uShadowTexel');
		const uCamPos = this.link('uCamPos');
		/**
		 * \`shadowFactor\`: the vessel's and the site's shadow on the ground from the sun's shadow map,
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
					.mul(float(1.0).sub(smoothstep(0.0, px.add(0.06), min(gg.x, gg.y)).oneMinus().mul(0.22)));
				colour.assign(mix(colour, c2, m));
				pave.assign(max(pave, m));
				dirt.assign(max(dirt, smoothstep(0.0, 4.0, sd).oneMinus().mul(m.oneMinus()).mul(0.7)));
			}
			return { colour, pave, dirt };
		};

		/**
		 * Hill relief for shading only (the GLSL's \`macroRelief\`): metres from the octaves at or above
		 * lamMin; the two largest only on mountains (\`mount\` > 0.05).
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
		 * surfaceAt: albedo, normal (body-fixed) and how much is water (the GLSL's \`spec\`), at height hT
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
			const depth = clamp(float(SEA_LEVEL).sub(e2).div(0.18), 0.0, 1.0);
			const depthNear = clamp(sdCoast.div(60.0), 0.0, 1.0);
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
					cross(nBF, select(abs(nBF.y).greaterThan(0.99), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0)))
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
				.mul(smoothstep(300.0, 3000.0, footprint).oneMinus());
			const land = mix(
				mix(mix(veg, rockc, wRock), sand, wBeach),
				snow,
				wSnow.mul(smoothstep(0.0, 1.0, float(1.0).sub(slope.mul(2.0))))
			).toVar();
			// wet sand along the shore
			land.mulAssign(
				float(1.0).sub(
					smoothstep(0.0, 3.0, sdCoast.negate()).oneMinus().mul(0.35).mul(wRock.oneMinus())
				)
			);

			// the launch site, painted flush on the ground
			If(dot(vS, vS).lessThan(uSiteRadius.mul(uSiteRadius)), () => {
				const q = vec2(dot(vS, uSiteEast), dot(vS, uSiteNorth).negate());
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
			);
			return {
				albedo: mix(water, land, landW),
				normal: normalize(mix(nBF, Nb, landW)),
				spec: landW.oneMinus()
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
		 * \`marchTerrain\`: sphere-traces the baked heights from the camera; hit and distance, and for a
		 * miss the closest clearance in pixel footprints (sMin, negative across a crest) and where (tMin).
		 */
		const marchTerrain = (ro: N, rd: N, r0: N, d: N, tLimit: N) => {
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

		const ndc = varying(positionGeometry.xy);
		const main = Fn(() => {
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
				If(uTerrainOn.greaterThan(0.5), () => {
					const m = marchTerrain(ro, rd, r0, d, select(hitP, tHit, float(1e9)));
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
				const lit = sf.albedo.div(PI).mul(uSunIrr.mul(sunT).mul(ndl).mul(sh).add(amb)).toVar();
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
			// the air in front: the sky view for rays to the sea sphere or out of the air; terrain
			// stands in front of where those rays end, so its air is marched (thinner near the camera,
			// as \`terrainVeil\` in atmosphere-model.ts)
			const colour = vec3(0.0).toVar();
			If(hitT, () => {
				const at = raySphere(r0, d, uR.add(uAtmH));
				const seg = sky.segment(ro, rd, max(at.x, 0.0), tG, 12);
				const veil = mix(
					float(TERRAIN_VEIL.near),
					1.0,
					smoothstep(TERRAIN_VEIL.fadeFrom, TERRAIN_VEIL.fadeTo, tG)
				);
				colour.assign(base.mul(seg.transmittance).add(seg.inscatter.mul(veil).mul(SKY_GAIN)));
			}).Else(() => {
				colour.assign(
					base
						.mul(sky.viewTransmittance(ro, rd, hitP, tHit))
						.add(sky.inscatter(ro, rd).mul(SKY_GAIN))
				);
			});
			// one NaN would smear through the bloom over the whole frame
			const bad = nan(colour.x).or(nan(colour.y)).or(nan(colour.z));
			colour.assign(select(bad, vec3(0.0), min(colour, vec3(200.0))));
			return vec4(colour, depthZ);
		});
		const result = main();
		this.material.vertexNode = vec4(positionGeometry.xy, 0.0, 1.0);
		this.material.colorNode = vec4(result.xyz, 1.0);
		this.material.depthNode = select(
			result.w.greaterThan(0.0),
			viewZToLogarithmicDepth(result.w.negate(), cameraNear, cameraFar),
			float(1.0)
		);
		this.material.needsUpdate = true;
	}
}
