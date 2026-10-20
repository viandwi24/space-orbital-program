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
import { LAKE_SHAPE as LAKE, MAX_TERRAIN_ZONES, TERRAIN_SHAPE as S } from '@orbital/core';
import type { PlanetPass } from '../planet.ts';
import { PATCH_BLEND, patchTexel, type PatchFrame } from '../terrain-patch.ts';
import { noiseT, octaveRotate, warpedLatLon } from './noise.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	If,
	abs,
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
	/** Height (x, m) and gradient magnitude (y) at a planet-centred inertial position. */
	heightAndSlope(pI: N): N;
	/** Height (x, m) and body-fixed tangent gradient (yzw) at a planet-centred inertial position. */
	terrainAt(pI: N): N;
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
		if (jobs.cube || resized) {
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
		this.cubePass?.m.dispose();
		this.patchPass?.m.dispose();
		this.atlas = null;
		this.patchTargets.fine = this.patchTargets.mid = null;
		this.cubePass = this.patchPass = null;
		this.atlasSize = cubeSize;
		this.patchSize = patchSize;
		this.builtMap = map;
		this.version++;
		if (cubeSize <= 0) return;
		const tile = cubeSize + 2;
		this.atlas = new RenderTarget(6 * tile, tile, {
			type: HalfFloatType,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			depthBuffer: false,
			generateMipmaps: false
		});
		const pass = (frag: N) => {
			const m = new MeshBasicNodeMaterial();
			// raw output: a colour node would have its alpha replaced by the opacity (g2 lost)
			m.fragmentNode = frag;
			m.depthTest = false;
			m.depthWrite = false;
			return { m, q: new QuadMesh(m) };
		};
		const height = this.heightFn(map);
		const texel = (n: N, d: N): N => {
			const t1 = tangent1(n);
			const t2 = cross(n, t1);
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
				const px = uv().x.mul(6 * tile);
				const face = floor(px.div(tile));
				const st = vec2(px.sub(face.mul(tile)), uv().y.mul(tile))
					.sub(1.0)
					.div(cubeSize)
					.mul(2.0)
					.sub(1.0);
				// OpenGL's cube convention, as the WebGL bake: +X, -X, +Y, -Y, +Z, -Z
				const dir = select(
					face.lessThan(0.5),
					vec3(1.0, st.y.negate(), st.x.negate()),
					select(
						face.lessThan(1.5),
						vec3(-1.0, st.y.negate(), st.x),
						select(
							face.lessThan(2.5),
							vec3(st.x, 1.0, st.y),
							select(
								face.lessThan(3.5),
								vec3(st.x, -1.0, st.y.negate()),
								select(
									face.lessThan(4.5),
									vec3(st.x, st.y.negate(), 1.0),
									vec3(st.x.negate(), st.y.negate(), -1.0)
								)
							)
						)
					)
				);
				const { h0, g } = texel(normalize(dir), this.uTexel);
				const hi = floor(h0.div(16.0)).mul(16.0);
				return vec4(hi, h0.sub(hi), g);
			})()
		);
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
	}

	/** `heightAt(n)`: the terrain height (m) at a unit body-fixed direction, as a shader function. */
	private heightFn(map: DataTexture): (n: N) => N {
		const R = this.radius;
		const shift = this.uShift;
		const fbmT = (
			q0: N,
			wavelengthKm: number,
			octaves: number,
			salt: number,
			ridged: boolean
		): N => {
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
		const zones = (n: N): N => {
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
		};
		const fn = Fn(([n]: N[]) => {
			const h = float(0.0).toVar();
			const ll = warpedLatLon(n, float(R), shift);
			const e = texture(map, vec2(ll.y.div(2 * PI).add(0.5), ll.x.div(PI).add(0.5))).level(0).r;
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

	/**
	 * The samplers over the current targets for the planet pass; `link` gives the TSL uniforms that
	 * follow the planet pass's own (the patch frames, written by `markPatchBaked`).
	 */
	sampler(link: (name: string) => N, bodyInv: N): TerrainSampler | null {
		const atlas = this.atlas;
		if (!atlas) return null;
		const size = this.atlasSize;
		const tile = size + 2;
		const cube = (n: N): N => {
			const a = abs(n);
			const isX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
			const isY = isX.not().and(a.y.greaterThanEqual(a.z));
			const sx = select(
				isX,
				select(n.x.greaterThan(0.0), n.z.negate(), n.z).div(a.x),
				select(isY, n.x.div(a.y), select(n.z.greaterThan(0.0), n.x, n.x.negate()).div(a.z))
			);
			const sy = select(
				isX,
				n.y.negate().div(a.x),
				select(isY, select(n.y.greaterThan(0.0), n.z, n.z.negate()).div(a.y), n.y.negate().div(a.z))
			);
			const face = select(
				isX,
				select(n.x.greaterThan(0.0), float(0.0), float(1.0)),
				select(
					isY,
					select(n.y.greaterThan(0.0), float(2.0), float(3.0)),
					select(n.z.greaterThan(0.0), float(4.0), float(5.0))
				)
			);
			const st = vec2(
				face
					.mul(tile)
					.add(1.0)
					.add(sx.add(1.0).mul(0.5 * size))
					.div(6 * tile),
				sy
					.add(1.0)
					.mul(0.5 * size)
					.add(1.0)
					.div(tile)
			);
			return texture(atlas.texture, st).level(0);
		};
		const patchSize = this.patchSize;
		const patchFetch = (target: RenderTarget, st: N): N => {
			const at = st.mul(0.5).add(0.5);
			if (this.floatLinear) return texture(target.texture, at).level(0).xyz;
			// four texels by hand where 32-bit floats cannot be filtered
			const p = at.mul(patchSize).sub(0.5);
			const f = fract(p);
			const i0 = ivec2(floor(p));
			const hi = ivec2(patchSize - 1);
			const fetch = (dx: number, dy: number): N =>
				textureLoad(target.texture, clamp(i0.add(ivec2(dx, dy)), ivec2(0), hi)).xyz;
			return mix(mix(fetch(0, 0), fetch(1, 0), f.x), mix(fetch(0, 1), fetch(1, 1), f.x), f.y);
		};
		const slots = (['fine', 'mid'] as const).map((which) => {
			const pre = which === 'fine' ? 'uFine' : 'uMid';
			return {
				target: this.patchTargets[which],
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

		return { heightAndSlope: (p: N) => heightAndSlope(p), terrainAt: (p: N) => terrainAt(p) };
	}

	dispose(): void {
		this.atlas?.dispose();
		this.patchTargets.fine?.dispose();
		this.patchTargets.mid?.dispose();
		this.cubePass?.m.dispose();
		this.patchPass?.m.dispose();
	}
}
