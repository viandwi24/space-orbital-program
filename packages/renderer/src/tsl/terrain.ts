/**
 * The terrain in TSL (plan 261 Phase 2, slice 2b): the height function of `@orbital/core`
 * `terrain.ts` (the twin of `terrainHeightGLSL`), its bakes and the samplers the march reads.
 *
 * - **The far field** is one 2D atlas of the six cube faces, each with a one-texel gutter baked
 *   from directions just past its edge, so hardware filtering never mixes two faces. It holds what
 *   the WebGL cube map holds: `(hi, lo, g1, g2)` in half floats, the height split so it stays
 *   exact to 8 mm, and the tangent gradient in the basis of the texel's direction.
 * - **The camera-centred patches** (ADR 0044) are 32-bit `(h, g1, g2)` targets over the frames that
 *   `PlanetPass.update` plans; read filtered where the GPU filters 32-bit floats, else by hand.
 *
 * The samplers are inlined (no \`setLayout\`): in three r186 a uniform read only inside a laid-out
 * function is named apart from the material's uniform block, and the shader does not compile.
 *
 * The gradient is the forward difference of three heights (the bake's `fd` mode of plan 068): the
 * analytic one (ADR 0116) comes with the compute bakes of Phase 3.
 */
import {
	FloatType,
	HalfFloatType,
	LinearFilter,
	NearestFilter,
	RenderTarget,
	Vector3,
	Vector4,
	type DataTexture
} from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import {
	LAKE_SHAPE as LAKE,
	MAP_WARP as W_,
	MAX_TERRAIN_ZONES,
	OCTAVE_ROTATION,
	TERRAIN_SHAPE as S
} from '@orbital/core';
import type { PlanetPass } from '../planet.ts';
import { PATCH_BLEND, patchTexel, type PatchFrame } from '../terrain-patch.ts';
import { hash13i, noiseT, octaveRotate, warpedLatLon } from './noise.ts';
import { atlasBakeDirection, atlasCoord } from './cube-atlas.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	If,
	abs,
	asin,
	atan,
	cos,
	sin,
	ivec3,
	acos,
	clamp,
	cross,
	dot,
	float,
	floor,
	fract,
	int,
	ivec2,
	length,
	max,
	min,
	mix,
	normalize,
	select,
	smoothstep,
	sqrt,
	texture,
	textureLoad,
	uniform,
	uniformArray,
	uv,
	vec2,
	vec3,
	vec4
} = T;

const PI = Math.PI;

/** `terrainTangent1`: the first tangent axis of a unit body-fixed direction. */
export const tangent1 = (n: N): N =>
	normalize(cross(n, select(abs(n.y).greaterThan(0.99), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0))));

export interface TerrainSampler {
	/** The far field's height (m) at a unit body-fixed direction (the light shafts' terrain test). */
	cubeHeight(nB: N): N;
	/** Height (x, m) and gradient magnitude (y) at a planet-centred inertial position. */
	heightAndSlope(pI: N): N;
	/** Height (x, m) and body-fixed tangent gradient (yzw) at a planet-centred inertial position. */
	terrainAt(pI: N): N;
	/** The cube alone at a unit body-fixed direction: height (x, m) and tangent gradient (yzw) (plan 364's bake). */
	cubeAt(nB: N): N;
}

export class TerrainTSL {
	private atlas: RenderTarget | null = null;
	private atlasSize = 0;
	private readonly patchTargets: Record<'fine' | 'mid', RenderTarget | null> = {
		fine: null,
		mid: null
	};
	private patchSize = 0;
	private builtMap: DataTexture | null = null;
	private cubePass: { m: MeshBasicNodeMaterial; q: QuadMesh } | null = null;
	private patchPass: { m: MeshBasicNodeMaterial; q: QuadMesh } | null = null;
	/**
	 * The bake passes by atlas, patch and map size and gradient: a preset change brings new targets and
	 * a new map, and the passes for sizes seen before are not compiled again (plan 261).
	 */
	private readonly passes = new Map<
		string,
		{
			cube: { m: MeshBasicNodeMaterial; q: QuadMesh };
			patch: { m: MeshBasicNodeMaterial; q: QuadMesh } | null;
		}
	>();
	/**
	 * What the planet pass's shader reads, as nodes whose texture is swapped when the targets or the
	 * map are replaced, and the sizes as uniforms: one compiled planet shader serves every preset.
	 */
	private readonly blankHalf = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
	/**
	 * One placeholder per patch (plan 370): three merges uniforms of the same texture, so with one for
	 * both a shader built before the first bake had one binding for the two patches, and its source
	 * differed from a load where the bake came first.
	 */
	private readonly blankFloats = [0, 1].map(
		() =>
			new RenderTarget(1, 1, {
				type: FloatType,
				minFilter: NearestFilter,
				magFilter: NearestFilter,
				depthBuffer: false
			})
	);
	private readonly atlasNode: N = texture(this.blankHalf.texture);
	private readonly patchNodes: Record<'fine' | 'mid', N> = {
		fine: texture(this.blankFloats[0]!.texture),
		mid: texture(this.blankFloats[1]!.texture)
	};
	private mapNode: N = null;
	private readonly uAtlasSize = uniform(1);
	private readonly uPatchSize = uniform(1);
	private readonly uZones = uniformArray(
		Array.from({ length: MAX_TERRAIN_ZONES }, () => new Vector4()),
		'vec4'
	);
	private readonly uZoneBlend = uniformArray(new Array<number>(MAX_TERRAIN_ZONES).fill(0), 'float');
	private readonly uZoneCount = uniform(0, 'int');
	private readonly uShift = uniform(0, 'int');
	private readonly uTexel = uniform(0.001);
	private readonly uPatchC = uniform(new Vector3(1, 0, 0));
	private readonly uPatchE = uniform(new Vector3(0, 0, 1));
	private readonly uPatchF = uniform(new Vector3(0, 1, 0));
	private readonly uHalfTan = uniform(0.01);
	/** Bumped when a target or the map is replaced: the planet pass rebuilds its shader. */
	version = 0;
	/** The bake's gradient: analytic (ADR 0116) or plan 068's forward differences (debug). */
	private gradient: 'analytic' | 'fd' = 'analytic';
	/** Bake everything every frame (plan 068's bake-cost measurement). */
	private rebakeAll = false;

	/** Plan 068's measurement on WebGPU: rebake every frame, and the gradient to bake with. */
	debugBakeMode(rebake: boolean, gradient: 'analytic' | 'fd' | 'none'): void {
		this.rebakeAll = rebake;
		const g = gradient === 'fd' ? 'fd' : 'analytic';
		if (g !== this.gradient) {
			this.gradient = g;
			this.atlasSize = -1; // rebuild the passes, bake again
		}
	}

	constructor(
		private readonly planet: PlanetPass,
		private readonly radius: number,
		/** 32-bit float textures can be filtered by the GPU (WebGPU's `float32-filterable`). */
		private readonly floatLinear: boolean
	) {}

	/** Runs the bakes `PlanetPass.terrainJobs` asks for. Call once a frame before drawing. */
	bake(renderer: WebGPURenderer): void {
		const jobs = this.planet.terrainJobs();
		const z = jobs.zones;
		for (let i = 0; i < MAX_TERRAIN_ZONES; i++) {
			(this.uZones.array[i] as Vector4).copy(z.uZones.value[i]!);
			this.uZoneBlend.array[i] = z.uZoneBlend.value[i]!;
		}
		this.uZoneCount.value = z.uZoneCount.value;
		this.uShift.value = z.uTerrainShift.value;
		const resized =
			jobs.cubeSize !== this.atlasSize ||
			jobs.patchSize !== this.patchSize ||
			jobs.map !== this.builtMap;
		if (resized) this.rebuild(jobs.cubeSize, jobs.patchSize, jobs.map);
		if (jobs.cubeSize <= 0) return;
		const prev = renderer.getRenderTarget();
		if (jobs.cube || resized || this.rebakeAll) {
			this.uTexel.value = (1.2 * PI) / 2 / jobs.cubeSize;
			renderer.setRenderTarget(this.atlas);
			this.cubePass!.q.render(renderer);
			this.planet.markCubeBaked();
		}
		for (const { slot, frame } of jobs.patches) this.bakePatch(renderer, slot, frame);
		renderer.setRenderTarget(prev);
	}

	private bakePatch(renderer: WebGPURenderer, slot: 'fine' | 'mid', frame: PatchFrame): void {
		const target = this.patchTargets[slot];
		if (!target || !this.patchPass) return;
		this.uPatchC.value.set(frame.centre.x, frame.centre.y, frame.centre.z);
		this.uPatchE.value.set(frame.east.x, frame.east.y, frame.east.z);
		this.uPatchF.value.set(frame.north.x, frame.north.y, frame.north.z);
		this.uHalfTan.value = frame.halfTan;
		this.uTexel.value = patchTexel(frame, this.patchSize);
		renderer.setRenderTarget(target);
		this.patchPass.q.render(renderer);
		this.planet.markPatchBaked(slot, frame);
	}

	private rebuild(cubeSize: number, patchSize: number, map: DataTexture): void {
		this.atlas?.dispose();
		this.patchTargets.fine?.dispose();
		this.patchTargets.mid?.dispose();
		this.atlas = null;
		this.patchTargets.fine = this.patchTargets.mid = null;
		this.cubePass = this.patchPass = null;
		this.atlasSize = cubeSize;
		this.patchSize = patchSize;
		this.builtMap = map;
		if (this.mapNode) this.mapNode.value = map;
		else this.mapNode = texture(map);
		this.uAtlasSize.value = Math.max(cubeSize, 1);
		this.uPatchSize.value = Math.max(patchSize, 1);
		this.atlasNode.value = this.blankHalf.texture;
		this.patchNodes.fine.value = this.blankFloats[0]!.texture;
		this.patchNodes.mid.value = this.blankFloats[1]!.texture;
		if (cubeSize <= 0) return;
		const tile = cubeSize + 2;
		this.atlas = new RenderTarget(6 * tile, tile, {
			type: HalfFloatType,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			depthBuffer: false,
			generateMipmaps: false
		});
		this.atlasNode.value = this.atlas.texture;
		const passKey = `${cubeSize}:${patchSize}:${map.image.width}x${map.image.height}:${this.gradient}`;
		const cached = this.passes.get(passKey);
		if (patchSize > 0) {
			const make = (): RenderTarget =>
				new RenderTarget(patchSize, patchSize, {
					type: FloatType,
					minFilter: this.floatLinear ? LinearFilter : NearestFilter,
					magFilter: this.floatLinear ? LinearFilter : NearestFilter,
					depthBuffer: false,
					generateMipmaps: false
				});
			this.patchTargets.fine = make();
			this.patchTargets.mid = make();
			this.patchNodes.fine.value = this.patchTargets.fine.texture;
			this.patchNodes.mid.value = this.patchTargets.mid.texture;
		}
		if (cached) {
			this.cubePass = cached.cube;
			this.patchPass = cached.patch;
			return;
		}
		const pass = (frag: N) => {
			const m = new MeshBasicNodeMaterial();
			// raw output: a colour node would have its alpha replaced by the opacity (g2 lost)
			m.fragmentNode = frag;
			m.depthTest = false;
			m.depthWrite = false;
			return { m, q: new QuadMesh(m) };
		};
		const height = this.heightFn(this.mapNode);
		const heightGrad = this.heightGradFn(this.mapNode, map.image.width, map.image.height);
		const analytic = this.gradient === 'analytic';
		const texel = (n: N, d: N): N => {
			const t1 = tangent1(n);
			const t2 = cross(n, t1);
			if (analytic) {
				// the analytic gradient (ADR 0116): one pass, rise over run along t1 and t2
				const hg = heightGrad(n).toVar();
				return { h0: hg.x, g: vec2(dot(hg.yzw, t1), dot(hg.yzw, t2)).div(this.radius) };
			}
			// plan 068's forward differences: two more heights (the debug comparison)
			const h0 = height(n);
			const g = vec2(
				height(normalize(n.add(t1.mul(d)))).sub(h0),
				height(normalize(n.add(t2.mul(d)))).sub(h0)
			).div(d.mul(this.radius));
			return { h0, g };
		};
		// the atlas: face f's tile is columns [f (N + 2), (f + 1)(N + 2)), its texel i at st = 2 (i - 0.5) / N - 1
		this.cubePass = pass(
			Fn(() => {
				const dir = atlasBakeDirection(cubeSize);
				const { h0, g } = texel(normalize(dir), this.uTexel);
				const hi = floor(h0.div(16.0)).mul(16.0);
				return vec4(hi, h0.sub(hi), g);
			})()
		);
		if (patchSize > 0) {
			this.patchPass = pass(
				Fn(() => {
					const st = uv().mul(2.0).sub(1.0);
					const n = normalize(
						this.uPatchC.add(this.uPatchE.mul(st.x).add(this.uPatchF.mul(st.y)).mul(this.uHalfTan))
					);
					const { h0, g } = texel(n, this.uTexel);
					return vec4(h0, g, 0.0);
				})()
			);
		}
		this.passes.set(passKey, { cube: this.cubePass, patch: this.patchPass });
	}

	/**
	 * `terrainZones`: (site weight, arc to the first zone in m, lake gate) at a unit body-fixed
	 * direction, from the world's zones (the lakes read the gate too).
	 */
	zones(n: N): N {
		const R = this.radius;
		const arcTo = (i: number): N =>
			acos(clamp(dot(n, this.uZones.element(i).xyz), -1.0, 1.0)).mul(R);
		const arc0 = arcTo(0);
		const site = float(1.0).toVar();
		const gate = float(1.0).toVar();
		for (let i = 0; i < MAX_TERRAIN_ZONES; i++) {
			If(int(i).lessThan(this.uZoneCount), () => {
				const a = i === 0 ? arc0 : arcTo(i);
				const z = this.uZones.element(i);
				site.mulAssign(smoothstep(z.w, z.w.add(this.uZoneBlend.element(i)), a));
				gate.assign(min(gate, smoothstep(LAKE.siteFrom, LAKE.siteTo, a)));
			});
		}
		return vec3(site, arc0, gate);
	}

	/**
	 * `heightGrad(n)` (ADR 0116): the height and its gradient with respect to n in one pass, the
	 * twin of core's `terrainHeightAndGradient` and of `terrainHeightGradGLSL`; forward mode on
	 * vec4(value, gradient). The map's value is the filtered fetch `heightAt` uses, its derivative
	 * comes from its four texels.
	 */
	private heightGradFn(map: N, W: number, Hm: number): (n: N) => N {
		const R = this.radius;
		const kq = R / 1000;
		const shift = this.uShift;
		const cD = (v: N | number): N => vec4(v, 0.0, 0.0, 0.0);
		const mulD = (a: N, b: N): N => vec4(a.x.mul(b.x), a.yzw.mul(b.x).add(b.yzw.mul(a.x)));
		const chainD = (v: N, dv: N, a: N): N => vec4(v, a.yzw.mul(dv));
		const smoothstepD = (e0: number | N, e1: number | N, x: N): N => {
			const span = float(e1).sub(e0);
			const r = x.x.sub(e0).div(span).toVar();
			return select(
				r.lessThanEqual(0.0),
				cD(0.0),
				select(
					r.greaterThanEqual(1.0),
					cD(1.0),
					chainD(
						r.mul(r).mul(float(3.0).sub(r.mul(2.0))),
						r.mul(6.0).mul(r.oneMinus()).div(span),
						x
					)
				)
			);
		};
		const minD = (a: N, b: N): N => select(b.x.lessThan(a.x), b, a);
		const valueNoiseCellD = (c: N, r: N): N => {
			const f = r
				.mul(r)
				.mul(r)
				.mul(r.mul(r.mul(6.0).sub(15.0)).add(10.0));
			const df = r
				.mul(r)
				.mul(r.mul(r.sub(2.0)).add(1.0))
				.mul(30.0);
			const H = (x: number, y: number, z: number): N => hash13i(c.add(ivec3(x, y, z))).toVar();
			const h000 = H(0, 0, 0);
			const h100 = H(1, 0, 0);
			const h010 = H(0, 1, 0);
			const h110 = H(1, 1, 0);
			const h001 = H(0, 0, 1);
			const h101 = H(1, 0, 1);
			const h011 = H(0, 1, 1);
			const h111 = H(1, 1, 1);
			const a = mix(h000, h100, f.x);
			const b = mix(h010, h110, f.x);
			const cc = mix(h001, h101, f.x);
			const d = mix(h011, h111, f.x);
			const ab = mix(a, b, f.y);
			const cd = mix(cc, d, f.y);
			const dx = mix(
				mix(h100.sub(h000), h110.sub(h010), f.y),
				mix(h101.sub(h001), h111.sub(h011), f.y),
				f.z
			);
			return vec4(mix(ab, cd, f.z), vec3(dx, mix(b.sub(a), d.sub(cc), f.z), cd.sub(ab)).mul(df));
		};
		const noiseTD = (q: N, freq: number, salt: number): N => {
			const p = q.mul(freq);
			const fl = floor(p);
			const c = ivec3(fl)
				.add(ivec3(salt * 131, salt * 71, salt * 17))
				.add(ivec3(shift));
			const r = valueNoiseCellD(c, p.sub(fl)).toVar();
			return vec4(r.x, r.yzw.mul(freq));
		};
		// the octave rotation's transpose, accumulated per octave on the CPU (rows)
		const rot = OCTAVE_ROTATION;
		const rotT = [0, 1, 2].map((r) => [0, 1, 2].map((c) => rot[c]![r]!));
		const mul3 = (a: number[][], b: number[][]): number[][] =>
			[0, 1, 2].map((r) =>
				[0, 1, 2].map((c) => a[r]![0]! * b[0]![c]! + a[r]![1]! * b[1]![c]! + a[r]![2]! * b[2]![c]!)
			);
		const apply = (m: number[][], v: N): N =>
			vec3(dot(vec3(...m[0]!), v), dot(vec3(...m[1]!), v), dot(vec3(...m[2]!), v));
		const octavesD = (
			q0: N,
			wavelengthKm: number,
			octaves: number,
			salt: number,
			ridge: boolean
		): N => {
			let sum: N = cD(0.0);
			let amp = 1;
			let norm = 0;
			let freq = 1 / wavelengthKm;
			let q = q0;
			let back = [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1]
			];
			for (let i = 0; i < octaves; i++) {
				const r = noiseTD(q, freq, salt + i).toVar();
				let term: N = vec4(r.x, apply(back, r.yzw).mul(kq));
				if (ridge) {
					const t = term.toVar();
					const x = t.x.mul(2.0).sub(1.0);
					const sq = sqrt(x.mul(x).add(S.ridgeSoftness ** 2));
					term = chainD(float(1.0).sub(sq.sub(S.ridgeSoftness)), x.mul(-2.0).div(sq), t);
				}
				sum = sum.add(term.mul(amp));
				norm += amp;
				amp *= 0.5;
				freq *= 2;
				q = octaveRotate(q);
				back = mul3(back, rotT);
			}
			return sum.div(norm);
		};
		const arcD = (n: N, dir: N): N => {
			const c = clamp(dot(n, dir), -1.0, 1.0);
			const sn = sqrt(float(1.0).sub(c.mul(c)));
			return vec4(
				acos(c).mul(R),
				select(sn.greaterThan(0.0), dir.mul(float(-R).div(max(sn, 1e-12))), vec3(0.0))
			);
		};
		const fn = Fn(([n]: N[]) => {
			const out = cD(0.0).toVar();
			const q = n.mul(kq).toVar();
			const y = clamp(n.y, -1.0, 1.0);
			const lat = vec4(
				asin(y),
				0.0,
				select(
					abs(n.y).lessThan(1.0),
					float(1.0).div(sqrt(max(float(1.0).sub(y.mul(y)), 1e-12))),
					float(0.0)
				),
				0.0
			).toVar();
			const r2 = n.x.mul(n.x).add(n.z.mul(n.z));
			const lon = vec4(
				atan(n.z.negate(), n.x),
				select(r2.greaterThan(0.0), vec3(n.z, 0.0, n.x.negate()).div(max(r2, 1e-12)), vec3(0.0))
			).toVar();
			const warp = (salts: readonly [number, number]): N => {
				const a = noiseTD(q, 1 / W_.wavelengthsKm[0], salts[0])
					.mul(2.0)
					.sub(cD(1.0))
					.mul(W_.weights[0]);
				const b = noiseTD(q, 1 / W_.wavelengthsKm[1], salts[1])
					.mul(2.0)
					.sub(cD(1.0))
					.mul(W_.weights[1]);
				const s2 = a.add(b);
				return vec4(s2.x, s2.yzw.mul(kq));
			};
			const dLat = warp(W_.saltsLat).toVar();
			const dLon = warp(W_.saltsLon).toVar();
			const k = W_.amplitude / (W_.weights[0] + W_.weights[1]);
			const cosLat = cos(lat.x);
			const inv = select(
				cosLat.greaterThan(0.2),
				chainD(float(1.0).div(cosLat), sin(lat.x).div(cosLat.mul(cosLat)), lat),
				cD(1.0 / 0.2)
			);
			const wLat = lat.add(dLat.mul(k)).toVar();
			const wLon = lon.add(mulD(dLon.mul(k), inv)).toVar();
			// the map: the value from the filtered fetch heightAt uses, the derivative from its four texels
			const st = vec2(wLon.x.div(2 * PI).add(0.5), wLat.x.div(PI).add(0.5)).toVar();
			const e = texture(map, st).level(0).r;
			const fx = st.x.mul(W).sub(0.5);
			const rawY = st.y.mul(Hm).sub(0.5);
			const fy = clamp(rawY, 0.0, Hm - 1);
			const x0 = floor(fx);
			const y0 = floor(fy);
			const tx = fx.sub(x0);
			const ty = fy.sub(y0);
			const ix0 = int(T.mod(x0, W));
			const ix1 = int(T.mod(x0.add(1.0), W));
			const iy0 = int(clamp(y0, 0.0, Hm - 1));
			const iy1 = int(clamp(y0.add(1.0), 0.0, Hm - 1));
			const a = textureLoad(map, ivec2(ix0, iy0)).r;
			const b = textureLoad(map, ivec2(ix1, iy0)).r;
			const cc = textureLoad(map, ivec2(ix0, iy1)).r;
			const d = textureLoad(map, ivec2(ix1, iy1)).r;
			const dTx = b.sub(a).mul(ty.oneMinus()).add(d.sub(cc).mul(ty));
			const dTy = select(
				fy.notEqual(rawY),
				float(0.0),
				cc.add(d.sub(cc).mul(tx)).sub(a.add(b.sub(a).mul(tx)))
			);
			const eD = vec4(
				e,
				wLat.yzw.mul(dTy.mul(Hm / PI)).add(wLon.yzw.mul(dTx.mul(W / (2 * PI))))
			).toVar();
			const land = smoothstepD(S.landStart, S.landFull, eD).toVar();
			If(land.x.greaterThan(0.0), () => {
				const arc = arcD(n, this.uZones.element(0).xyz).toVar();
				const site = cD(1.0).toVar();
				const gate = cD(1.0).toVar();
				for (let i = 0; i < MAX_TERRAIN_ZONES; i++) {
					If(int(i).lessThan(this.uZoneCount), () => {
						const z = this.uZones.element(i);
						const az = i === 0 ? arc : arcD(n, z.xyz);
						site.assign(mulD(site, smoothstepD(z.w, z.w.add(this.uZoneBlend.element(i)), az)));
						gate.assign(minD(gate, smoothstepD(LAKE.siteFrom, LAKE.siteTo, az)));
					});
				}
				If(site.x.greaterThan(0.0), () => {
					const hills = smoothstepD(
						S.hillLow,
						S.hillHigh,
						octavesD(q, S.hillWavelengthKm, S.hillOctaves, 11, false)
					).mul(S.hillAmplitude);
					const n0 = noiseTD(q, 1 / S.rangeWavelengthsKm[0], S.rangeSalts[0]).toVar();
					const n1 = noiseTD(q, 1 / S.rangeWavelengthsKm[1], S.rangeSalts[1]).toVar();
					const rangeN = vec4(
						n0.x.mul(0.65).add(n1.x.mul(0.35)),
						n0.yzw.mul(0.65).add(n1.yzw.mul(0.35)).mul(kq)
					);
					const bn0 = noiseTD(q, 1 / S.backdropWavelengthKm, S.backdropSalt).toVar();
					const bn = vec4(bn0.x, bn0.yzw.mul(kq));
					const backdrop = mulD(
						mulD(
							smoothstepD(S.backdropRiseMetres[0], S.backdropRiseMetres[1], arc),
							cD(1.0).sub(smoothstepD(S.backdropFallMetres[0], S.backdropFallMetres[1], arc))
						),
						smoothstepD(S.backdropLow, S.backdropHigh, bn)
					).toVar();
					const rangeA = smoothstepD(S.rangeLow, S.rangeHigh, rangeN).toVar();
					const diff = rangeA.sub(backdrop).toVar();
					const rangeH = max(float(S.rangeBlend).sub(abs(diff.x)), 0.0).toVar();
					const range = select(rangeA.x.greaterThanEqual(backdrop.x), rangeA, backdrop).toVar();
					If(rangeH.greaterThan(0.0), () => {
						const dh = diff.yzw.mul(select(diff.x.greaterThanEqual(0.0), float(-1.0), float(1.0)));
						range.addAssign(
							vec4(rangeH.mul(rangeH).div(4 * S.rangeBlend), dh.mul(rangeH).div(2 * S.rangeBlend))
						);
					});
					const ridgeV = octavesD(q, S.ridgeWavelengthKm, S.ridgeOctaves, 31, true);
					const upland = smoothstepD(S.uplandLow, S.uplandHigh, eD);
					const mountains = mulD(
						mulD(range, smoothstepD(0.25, 0.8, ridgeV)),
						cD(0.7).add(upland.mul(0.3))
					).mul(S.mountainAmplitude);
					const relief = mulD(mulD(land, site), hills.add(mountains));
					const ln0 = noiseTD(q, 1 / LAKE.wavelengthKm, LAKE.salt).toVar();
					const level = mulD(vec4(ln0.x, ln0.yzw.mul(kq)), gate);
					const capRaw = cD(LAKE.to)
						.sub(level)
						.mul(LAKE.slope / LAKE.gradientBound)
						.toVar();
					const cap = select(capRaw.x.greaterThan(0.0), capRaw, cD(0.0));
					out.assign(minD(relief, cap));
				});
			});
			return out;
		});
		return (n: N): N => fn(n);
	}

	/** `heightAt(n)`: the terrain height (m) at a unit body-fixed direction, as a shader function. */
	private heightFn(map: N): (n: N) => N {
		return heightAtFn({
			map,
			radius: this.radius,
			shift: this.uShift,
			zones: (n: N) => this.zones(n),
			bilinear: false
		});
	}

	/**
	 * The samplers over the current targets for the planet pass; `link` gives the TSL uniforms that
	 * follow the planet pass's own (the patch frames, written by `markPatchBaked`).
	 */
	sampler(link: (name: string) => N, bodyInv: N, patches: boolean): TerrainSampler | null {
		const cube = (n: N): N => texture(this.atlasNode, atlasCoord(n, this.uAtlasSize)).level(0);
		const patchSize = this.uPatchSize;
		const patchFetch = (target: N, st: N): N => {
			const at = st.mul(0.5).add(0.5);
			if (this.floatLinear) return texture(target, at).level(0).xyz;
			// four texels by hand where 32-bit floats cannot be filtered
			const p = at.mul(patchSize).sub(0.5);
			const f = fract(p);
			const i0 = ivec2(floor(p));
			const hi = ivec2(int(patchSize).sub(1));
			const fetch = (dx: number, dy: number): N =>
				textureLoad(target, clamp(i0.add(ivec2(dx, dy)), ivec2(0), hi)).xyz;
			return mix(mix(fetch(0, 0), fetch(1, 0), f.x), mix(fetch(0, 1), fetch(1, 1), f.x), f.y);
		};
		const slots = (['fine', 'mid'] as const).map((which) => {
			const pre = which === 'fine' ? 'uFine' : 'uMid';
			return {
				target: patches ? this.patchNodes[which] : null,
				c: link(`${pre}C`),
				e: link(`${pre}E`),
				f: link(`${pre}F`),
				k: link(`${pre}K`)
			};
		});
		/** Where a direction falls in a patch: (u, v, weight of the patch, inside), weight 0 outside. */
		const window = (nB: N, s: (typeof slots)[number]): { st: N; w: N } => {
			const d = dot(nB, s.c);
			const st = vec2(dot(nB, s.e), dot(nB, s.f)).mul(s.k.x.div(max(d, 1e-3)));
			const m = max(abs(st.x), abs(st.y));
			const inside = s.k.y.greaterThan(0.5).and(d.greaterThan(0.5)).and(m.lessThan(1.0));
			const w = select(
				inside,
				smoothstep(PATCH_BLEND.start, PATCH_BLEND.end, m).oneMinus(),
				float(0.0)
			);
			return { st: clamp(st, -1.0, 1.0), w };
		};
		const [fine, mid] = slots as [(typeof slots)[0], (typeof slots)[0]];

		const heightAndSlope = Fn(([pI]: N[]) => {
			const nB = bodyInv.mul(normalize(pI));
			const out = vec2(0.0).toVar();
			const wf = fine.target ? window(nB, fine) : { st: vec2(0.0), w: float(0.0) };
			const qFine = vec3(0.0).toVar();
			If(wf.w.greaterThan(0.0), () => {
				qFine.assign(patchFetch(fine.target!, wf.st));
			});
			If(wf.w.greaterThanEqual(1.0), () => {
				out.assign(vec2(qFine.x, length(qFine.yz)));
			}).Else(() => {
				const wm = mid.target ? window(nB, mid) : { st: vec2(0.0), w: float(0.0) };
				const h = float(0.0).toVar();
				const g = float(0.0).toVar();
				If(wm.w.greaterThanEqual(1.0), () => {
					const q = patchFetch(mid.target!, wm.st);
					h.assign(q.x);
					g.assign(length(q.yz));
				}).Else(() => {
					const t = cube(nB);
					h.assign(t.r.add(t.g));
					g.assign(length(t.ba));
					If(wm.w.greaterThan(0.0), () => {
						const q = patchFetch(mid.target!, wm.st);
						h.assign(mix(h, q.x, wm.w));
						g.assign(mix(g, length(q.yz), wm.w));
					});
				});
				out.assign(vec2(mix(h, qFine.x, wf.w), mix(g, length(qFine.yz), wf.w)));
			});
			return out;
		});

		const terrainAt = Fn(([pI]: N[]) => {
			const nB = bodyInv.mul(normalize(pI));
			const t1 = tangent1(nB);
			const c = cube(nB);
			const t = vec4(c.r.add(c.g), t1.mul(c.b).add(cross(nB, t1).mul(c.a))).toVar();
			for (const s of [mid, fine]) {
				if (!s.target) continue;
				const win = window(nB, s);
				If(win.w.greaterThan(0.0), () => {
					const q = patchFetch(s.target!, win.st);
					t.assign(mix(t, vec4(q.x, t1.mul(q.y).add(cross(nB, t1).mul(q.z))), win.w));
				});
			}
			return t;
		});

		return {
			heightAndSlope: (p: N) => heightAndSlope(p),
			terrainAt: (p: N) => terrainAt(p),
			cubeAt: (nB: N) => {
				const t1 = tangent1(nB);
				const c = cube(nB);
				return vec4(c.r.add(c.g), t1.mul(c.b).add(cross(nB, t1).mul(c.a)));
			},
			cubeHeight: (nB: N) => {
				const c = cube(nB);
				return c.r.add(c.g);
			}
		};
	}

	dispose(): void {
		this.atlas?.dispose();
		this.patchTargets.fine?.dispose();
		this.patchTargets.mid?.dispose();
		for (const p of this.passes.values()) {
			p.cube.m.dispose();
			p.patch?.m.dispose();
		}
		this.passes.clear();
		this.blankHalf.dispose();
		for (const b of this.blankFloats) b.dispose();
	}
}

/** The map's elevation, bilinear by hand in 32-bit floats (\`biomeElevation\` of \`moon.glsl.ts\`). */
function biomeElevation(map: DataTexture, st: N): N {
	const W = map.image.width as number;
	const H = map.image.height as number;
	const p = vec2(st.x.mul(W).sub(0.5), clamp(st.y.mul(H).sub(0.5), 0.0, H - 1));
	const fl = floor(p);
	const t = p.sub(fl);
	const x0 = int(T.mod(fl.x, W));
	const x1 = int(T.mod(fl.x.add(1.0), W));
	const y0 = int(clamp(fl.y, 0.0, H - 1));
	const y1 = int(clamp(fl.y.add(1.0), 0.0, H - 1));
	const at = (x: N, y: N): N => textureLoad(map, ivec2(x, y)).r;
	return mix(mix(at(x0, y0), at(x1, y0), t.x), mix(at(x0, y1), at(x1, y1), t.x), t.y);
}

/**
 * \`heightAt(n)\` (the twin of \`terrainHeightGLSL\`, core's \`terrainHeight\`): the terrain height (m) at a
 * unit body-fixed direction, as a shader function. \`zones(n)\` gives (site weight, arc to the first
 * zone, lake gate); \`bilinear\` reads the map's elevation by hand in 32-bit floats (a hills moon's
 * bake, \`hillsHeightGLSL\`: the hardware filter's 8-bit weights shift a ridge on a small body).
 */
export function heightAtFn(o: {
	/** The biome map, or a node over it (one whose texture is swapped; not with `bilinear`). */
	map: DataTexture | N;
	radius: number;
	shift: N;
	zones: (n: N) => N;
	bilinear: boolean;
}): (n: N) => N {
	const map = o.map;
	const R = o.radius;
	const shift = o.shift;
	const fbmT = (q0: N, wavelengthKm: number, octaves: number, salt: number, ridged: boolean): N => {
		let sum: N = float(0.0);
		let q = q0;
		let amp = 1;
		let norm = 0;
		let freq = 1 / wavelengthKm;
		for (let i = 0; i < octaves; i++) {
			const v = noiseT(q, freq, salt + i, shift);
			// x * x, not pow(x, 2): pow of a negative base is NaN in WGSL
			const rx = v.mul(2.0).sub(1.0);
			const term = ridged
				? float(1.0).sub(sqrt(rx.mul(rx).add(S.ridgeSoftness ** 2)).sub(S.ridgeSoftness))
				: v;
			sum = sum.add(term.mul(amp));
			norm += amp;
			amp *= 0.5;
			freq *= 2;
			q = octaveRotate(q);
		}
		return sum.div(norm);
	};
	const zones = o.zones;
	const fn = Fn(([n]: N[]) => {
		const h = float(0.0).toVar();
		const ll = warpedLatLon(n, float(R), shift);
		const st = vec2(ll.y.div(2 * PI).add(0.5), ll.x.div(PI).add(0.5)).toVar();
		const e = (
			o.bilinear ? biomeElevation(map as DataTexture, st) : texture(map, st).level(0).r
		).toVar();
		const land = smoothstep(S.landStart, S.landFull, e);
		If(land.greaterThan(0.0), () => {
			const z = zones(n);
			If(z.x.greaterThan(0.0), () => {
				const q = n.mul(R / 1000);
				const hills = smoothstep(
					S.hillLow,
					S.hillHigh,
					fbmT(q, S.hillWavelengthKm, S.hillOctaves, 11, false)
				).mul(S.hillAmplitude);
				const rangeN = noiseT(q, 1 / S.rangeWavelengthsKm[0], S.rangeSalts[0], shift)
					.mul(0.65)
					.add(noiseT(q, 1 / S.rangeWavelengthsKm[1], S.rangeSalts[1], shift).mul(0.35));
				const arc = z.y;
				const backdrop = smoothstep(S.backdropRiseMetres[0], S.backdropRiseMetres[1], arc)
					.mul(smoothstep(S.backdropFallMetres[0], S.backdropFallMetres[1], arc).oneMinus())
					.mul(
						smoothstep(
							S.backdropLow,
							S.backdropHigh,
							noiseT(q, 1 / S.backdropWavelengthKm, S.backdropSalt, shift)
						)
					);
				const rangeA = smoothstep(S.rangeLow, S.rangeHigh, rangeN);
				const rangeH = max(float(S.rangeBlend).sub(abs(rangeA.sub(backdrop))), 0.0);
				const range = max(rangeA, backdrop).add(rangeH.mul(rangeH).div(4 * S.rangeBlend));
				const ridge = fbmT(q, S.ridgeWavelengthKm, S.ridgeOctaves, 31, true);
				const upland = smoothstep(S.uplandLow, S.uplandHigh, e);
				const mountains = range
					.mul(smoothstep(0.25, 0.8, ridge))
					.mul(upland.mul(0.3).add(0.7))
					.mul(S.mountainAmplitude);
				const lakeLevel = noiseT(q, 1 / LAKE.wavelengthKm, LAKE.salt, shift).mul(z.z);
				const lakeCap = max(
					float(LAKE.to)
						.sub(lakeLevel)
						.mul(LAKE.slope / LAKE.gradientBound),
					0.0
				);
				h.assign(min(land.mul(z.x).mul(hills.add(mountains)), lakeCap));
			});
		});
		return h;
	});
	return (n: N): N => fn(n);
}
