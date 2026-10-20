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
 * Not yet (slices 2b, 2c): the terrain heights and their march, relief normals, lakes, rivers,
 * shore and sea waves, clouds, light shafts, aurora, the vessel's and the clouds' shadows.
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
import { BEACH_WIDTH, HIGHLAND, SEA_LEVEL } from '@orbital/core';
import { TERRAIN_VEIL, type Atmosphere } from '../atmosphere-model.ts';
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
	abs,
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
const SKY_GAIN = 1.6;

export class PlanetPassTSL {
	readonly mesh: Mesh;
	private readonly sky: LutSky;
	private readonly material = new MeshBasicNodeMaterial();
	private readonly syncs: (() => void)[] = [];
	private readonly pixelAngle = uniform(0.001);
	private builtMap: DataTexture | null = null;
	private baked = false;
	private readonly up = new Vector3();
	private readonly sun = new Vector3();

	constructor(
		private readonly planet: PlanetPass,
		atm: Atmosphere,
		private octaves: number
	) {
		this.sky = createLutSky(atm);
		this.material.name = 'planet-pass-tsl';
		this.material.depthFunc = AlwaysDepth;
		this.material.depthWrite = true;
		this.mesh = new Mesh(planet.mesh.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = planet.mesh.renderOrder;
		this.mesh.name = 'planet-pass-tsl';
		this.build();
	}

	/** Ground octaves of the preset (the GLSL's `GROUND_OCTAVES`); rebuilds the shader when they change. */
	setOctaves(octaves: number): void {
		if (octaves === this.octaves) return;
		this.octaves = octaves;
		this.build();
	}

	/**
	 * Copies this frame's uniforms from the WebGL pass, follows its visibility, and rebuilds the sky
	 * view for the camera. Call after the scene model's `prepareFrame`, before drawing.
	 */
	update(renderer: WebGPURenderer, camera: PerspectiveCamera, heightPx: number): void {
		const u = this.planet.material.uniforms;
		if (u.uMap!.value !== this.builtMap) this.build();
		for (const s of this.syncs) s();
		this.pixelAngle.value =
			(2 * Math.tan(((camera.fov * Math.PI) / 180) * 0.5)) / Math.max(heightPx, 1);
		this.mesh.visible = this.planet.mesh.visible;
		if (!this.mesh.visible) return;
		if (!this.baked) {
			this.sky.bake(renderer);
			this.baked = true;
		}
		const r = (u.uR!.value as number) + Math.max(u.uAlt!.value as number, 0);
		this.up.copy(u.uCamUp!.value as Vector3);
		this.sun.copy(u.uSunDir!.value as Vector3);
		this.sky.update(renderer, r, this.up, this.sun);
	}

	dispose(): void {
		this.material.dispose();
		this.sky.dispose();
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
		const octaves = this.octaves;
		const nA = (pl: N, lam: number, salt: number): N => noiseA(pl, lam, salt, uAnchorCell);
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

		/** surfaceAt on the sphere: albedo and how much of it is water (the GLSL's `spec`). */
		const surfaceAt = (nBF: N, pl: N, footprint: N, viewBF: N) => {
			const ll = warpedLatLon(nBF, uR, uTerrainShift);
			const st = vec2(ll.y.div(2 * PI).add(0.5), ll.x.div(PI).add(0.5));
			const lod = max(log2(footprint.div(uMapTexel)), 0.0);
			const m = mapAt(st, lod);
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
			const gPerM = max(length(vec2(ex, ey)).mul(0.5).div(texelM), float(0.006).div(uMapTexel));

			// fractal detail: coast displacement, colour noise and fine tone, the octaves a pixel resolves
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
					if (lam < 64) fine.addAssign(n.mul(fade).mul(lam < 8 ? 1.0 : 0.6));
					if (lam > 6 && lam < 200) colourNoise.addAssign(n.mul(fade).mul(0.7));
				});
			}
			const e2 = e.add(eDetail);
			const aa = max(footprint.mul(gPerM), 0.0004);
			const landW = smoothstep(float(SEA_LEVEL).sub(aa), float(SEA_LEVEL).add(aa), e2).toVar();
			const sdCoast = float(SEA_LEVEL).sub(e2).div(gPerM);
			const depth = clamp(float(SEA_LEVEL).sub(e2).div(0.18), 0.0, 1.0);
			const depthNear = clamp(sdCoast.div(60.0), 0.0, 1.0);

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
			const wForest = smoothstep(0.55, 0.72, moist);
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
			const veg = mix(mix(grass, forest, wForest), desert, wDesert);
			const wRock = max(
				smoothstep(HIGHLAND - 0.06, HIGHLAND + 0.05, e2),
				smoothstep(0.7, 0.9, rockMap.add(colourNoise.mul(0.3)))
			);
			const wSnow = max(smoothstep(0.12, 0.22, temp).oneMinus(), smoothstep(0.9, 0.97, e2));
			const wBeach = smoothstep(SEA_LEVEL + BEACH_WIDTH * 0.5, SEA_LEVEL + BEACH_WIDTH * 1.6, e2)
				.oneMinus()
				.mul(wRock.oneMinus())
				.mul(smoothstep(300.0, 3000.0, footprint).oneMinus());
			const land = mix(mix(mix(veg, rockc, wRock), sand, wBeach), snow, wSnow).toVar();
			// wet sand along the shore
			land.mulAssign(
				float(1.0).sub(
					smoothstep(0.0, 3.0, sdCoast.negate()).oneMinus().mul(0.35).mul(wRock.oneMinus())
				)
			);

			// the launch site, painted flush on the ground
			const vS = uCamToSite.add(viewBF);
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
				landW.assign(max(landW, site.pave));
			});

			const shallow = mix(vec3(0.03, 0.26, 0.24), vec3(0.02, 0.2, 0.2), depthNear);
			const water = mix(
				shallow,
				vec3(0.004, 0.035, 0.1),
				smoothstep(0.0, 0.7, max(depth, depthNear.mul(0.25)))
			);
			return { albedo: mix(water, land, landW), spec: landW.oneMinus() };
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

		const ndc = varying(positionGeometry.xy);
		const main = Fn(() => {
			const vp = uInvProj.mul(vec4(ndc, 0.0, 1.0));
			const rd = normalize(uCamRot.mul(normalize(vp.xyz.div(vp.w))));
			const fwd = uCamRot.mul(vec3(0.0, 0.0, -1.0));
			const R = uR;
			const h = max(uAlt, 0.0);
			const r0 = R.add(h);
			const ro = uCamUp.mul(r0);
			const d = dot(uCamUp, rd);
			const cr = cross(uCamUp, rd);
			const s2 = dot(cr, cr);
			const disc = R.mul(R).sub(r0.mul(r0).mul(s2));
			const hitG = disc.greaterThan(0.0).and(d.lessThan(0.0));
			const tG = h
				.mul(R.mul(2.0).add(h))
				.div(r0.mul(d.negate()).add(sqrt(max(disc, 0.0))))
				.toVar();
			const base = vec3(0.0).toVar();
			// the veil's factor on this ray's in-scatter (1 over sea and sky)
			const veil = float(1.0).toVar();
			const depthZ = float(-1.0).toVar();
			If(hitG, () => {
				const rdBF = uBodyInv.mul(rd);
				const pl = uCamLocal.add(rdBF.mul(tG));
				const posRel = ro.add(rd.mul(tG));
				const nI = normalize(posRel);
				const nBF = uBodyInv.mul(nI);
				const cosv = max(abs(dot(nI, rd)), 0.03);
				const footprint = max(tG.mul(pixelAngle).div(cosv), 0.002);
				const sf = surfaceAt(nBF, pl, footprint, rdBF.mul(tG));
				const Lb = uSunBF;
				const ndl = max(dot(nBF, Lb), 0.0);
				const sunT = sky.sunlight(posRel, uSunDir);
				const geo = dot(nBF, Lb);
				const k = max(0.0, smoothstep(-0.2, 0.4, geo).add(0.02)).div(
					max(smoothstep(-0.2, 0.4, uAmbientRefMu).add(0.02), 0.02)
				);
				const amb = uAmbient.mul(k).add(vec3(...NIGHT_AMBIENT).mul(PI));
				const lit = sf.albedo.div(PI).mul(uSunIrr.mul(sunT).mul(ndl).add(amb)).toVar();
				If(sf.spec.greaterThan(0.0), () => {
					const V = rdBF.negate();
					const Hh = normalize(Lb.add(V));
					const nh = max(dot(nBF, Hh), 0.0);
					const fres = pow(float(1.0).sub(max(dot(nBF, V), 0.0)), 5.0)
						.mul(0.98)
						.add(0.02);
					const glint = pow(nh, 900.0)
						.mul(900.0 / (8.0 * PI))
						.mul(ndl);
					const refl = uSkyColour.mul(fres).mul(1.2);
					lit.assign(
						mix(lit, refl, fres.mul(0.9)).add(
							uSunIrr.mul(sunT).mul(glint).mul(fres).mul(0.5).mul(sf.spec)
						)
					);
				});
				base.assign(lit);
				// land stands in for the terrain the GLSL marches: it reads through a thinner veil near
				// the camera, as `terrainVeil` in atmosphere-model.ts
				const near = mix(
					float(TERRAIN_VEIL.near),
					1.0,
					smoothstep(TERRAIN_VEIL.fadeFrom, TERRAIN_VEIL.fadeTo, tG)
				);
				veil.assign(mix(1.0, near, sf.spec.oneMinus()));
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
			const colour = base
				.mul(sky.viewTransmittance(ro, rd, hitG, tG))
				.add(sky.inscatter(ro, rd).mul(veil).mul(SKY_GAIN))
				.toVar();
			// one NaN would smear through the bloom over the whole frame
			const bad = colour.x
				.equal(colour.x)
				.not()
				.or(colour.y.equal(colour.y).not())
				.or(colour.z.equal(colour.z).not());
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
