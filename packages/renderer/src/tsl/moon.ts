/**
 * The moon pass in TSL (plan 261 Phase 4): the twin of `moon.ts` and `shaders/moon.glsl.ts` for the
 * WebGPU renderer. `MoonPass` keeps deciding what to bake and where the patches sit; this class
 * runs the bakes (the cube as a six-face atlas, `cube-atlas.ts`; the two patches as 32-bit targets)
 * and builds the node materials swapped in for the moon's Lambert layers: the whole-body globe, the
 * two patches and the instanced stones, with the regolith or the hills' colours, the grain bump, the
 * terrain shadow march on the sun's light, and a body with air's sea and aerial perspective. A sky
 * shell twin (`skyShellTwin`) draws that body's sky.
 *
 * Every uniform is read from the GLSL layer's own uniform objects (`userData.moon.uniforms`) once a
 * frame, so the pass's code is unchanged and both renderers read one state.
 */
import {
	BEACH_WIDTH,
	CRATERS_SEED_SALT,
	HIGHLAND,
	LAKE_SHAPE as LAKE,
	MOON_SHAPE as S,
	SEA_LEVEL,
	STONES
} from '@orbital/core';
import {
	AdditiveBlending,
	BackSide,
	Color,
	FloatType,
	HalfFloatType,
	LinearFilter,
	NearestFilter,
	RenderTarget,
	Vector3,
	type DirectionalLight,
	type HemisphereLight,
	type Material,
	type ShaderMaterial,
	type Uniform
} from 'three';
import * as TSL from 'three/tsl';
import {
	MeshBasicNodeMaterial,
	MeshLambertNodeMaterial,
	PhongLightingModel,
	QuadMesh,
	type WebGPURenderer
} from 'three/webgpu';
import type { MoonMaterialInfo, MoonPass, PatchKind } from '../moon.ts';
import { MOON_PATCHES } from '../moon-model.ts';
import { MOON_AIR_SAMPLES } from '../moon-air.ts';
import { HILLS_SHADOW_MARCH, SHADOW_MARCH, type ShadowMarch } from '../terrain-shadow.ts';
import { makeAir } from './air.ts';
import { atlasBakeDirection, atlasCoord, atlasSize } from './cube-atlas.ts';
import { hash13i, noiseF, noiseT, warpedLatLon } from './noise.ts';
import { heightAtFn } from './terrain.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Break,
	Discard,
	asin,
	atan,
	Fn,
	If,
	Loop,
	abs,
	acos,
	clamp,
	cos,
	cross,
	dFdx,
	dFdy,
	distance,
	dot,
	exp,
	float,
	floatBitsToUint,
	floor,
	fract,
	fwidth,
	int,
	ivec2,
	ivec3,
	length,
	log2,
	max,
	min,
	mix,
	normalGeometry,
	normalize,
	output,
	positionGeometry,
	positionView,
	pow,
	reflect,
	screenCoordinate,
	select,
	sign,
	sin,
	smoothstep,
	sqrt,
	step,
	texture,
	textureLoad,
	transformNormalToView,
	uint,
	uniform,
	uv,
	varying,
	vec2,
	vec3,
	vec4,
	attribute
} = T;

const PI = Math.PI;
/** A stone's shadow ray starts this far above the ground under it, m (as `moon.ts`). */
const STONES_LIFT = 0.3;
/** Uniforms of the GLSL layers that are ints there. */
const INT_UNIFORMS = new Set(['uShadowSteps', 'uStoneSalt']);

/** x is NaN or infinite, by its bits (Metal's fast maths folds x != x away). */
const nan = (x: N): N => floatBitsToUint(x).bitAnd(uint(0x7f800000)).equal(uint(0x7f800000));

/** TSL uniforms that follow the GLSL layers' uniform objects (one node per object, copied by `sync`). */
class Links {
	private readonly nodes = new Map<Uniform<unknown>, N>();
	private readonly syncs: (() => void)[] = [];

	of(record: Record<string, Uniform<unknown>>, name: string): N {
		const src = record[name];
		if (!src) throw new Error(`moon twin: no uniform ${name}`);
		const known = this.nodes.get(src);
		if (known) return known;
		const v = src.value as { clone?: () => unknown; copy?: (o: unknown) => void } | number;
		let node: N;
		if (typeof v === 'number') {
			node = uniform(v, INT_UNIFORMS.has(name) ? 'int' : 'float');
			this.syncs.push(() => (node.value = src.value));
		} else if (v && typeof v.clone === 'function') {
			node = uniform(v.clone());
			this.syncs.push(() => node.value.copy(src.value));
		} else throw new Error(`moon twin: uniform ${name} is not a number or a vector`);
		this.nodes.set(src, node);
		return node;
	}

	sync(): void {
		for (const s of this.syncs) s();
	}
}

/** `MeshLambertNodeMaterial` whose directional lights are multiplied by the terrain's sun visibility (ADR 0068). */
class MoonLighting extends PhongLightingModel {
	constructor(private readonly visibility: N) {
		super(false);
	}

	override direct(...args: Parameters<PhongLightingModel['direct']>): void {
		const [input, builder] = args;
		const light = (input as { lightNode?: { light?: { isDirectionalLight?: boolean } } }).lightNode
			?.light;
		const lit = light?.isDirectionalLight
			? { ...input, lightColor: (input.lightColor as N).mul(this.visibility) }
			: input;
		super.direct(lit, builder);
	}
}

class MoonMaterial extends MeshLambertNodeMaterial {
	/** The sun's visibility over the terrain, or null for none (the globe, a hills body's stones). */
	sunVisibility: N = null;

	override setupLightingModel(): PhongLightingModel {
		return this.sunVisibility
			? new MoonLighting(this.sunVisibility)
			: new PhongLightingModel(false);
	}
}

/** The bump of a small height h (m) on the view-space normal n (the GLSL's `dFdx` bump), n where undefined. */
const bump = (h: N, n: N): N => {
	const dH = vec2(dFdx(h), dFdy(h));
	const sx = dFdx(positionView);
	const sy = dFdy(positionView);
	const r1 = cross(sy, n);
	const r2 = cross(n, sx);
	const det = dot(sx, r1);
	const grad = sign(det).mul(r1.mul(dH.x).add(r2.mul(dH.y)));
	const b = normalize(n.mul(abs(det)).sub(grad));
	return select(nan(b.x).or(nan(b.y)).or(nan(b.z)), n, b);
};

export class MoonTSL {
	private readonly links = new Links();
	private readonly cubeSize: number;
	private readonly atlas: RenderTarget;
	private atlasOn = false;
	private readonly patches: Record<PatchKind, RenderTarget>;
	private readonly cubePass: { m: MeshBasicNodeMaterial; q: QuadMesh };
	private readonly patchPass: { m: MeshBasicNodeMaterial; q: QuadMesh };
	private readonly uPatchC = uniform(new Vector3(1, 0, 0));
	private readonly uPatchE = uniform(new Vector3(0, 1, 0));
	private readonly uPatchF = uniform(new Vector3(0, 0, 1));
	private readonly uHalfTan = uniform(0.01);
	/** The scene's sky and sun light (the sea reflects one and glints with the other). */
	private readonly uSkyLight = uniform(new Color());
	private readonly uSunLight = uniform(new Color());
	private readonly twins = new Map<string, { material: Material; sync(): void }>();
	private readonly height: (n: N) => N;
	private readonly hills: boolean;
	private readonly R: number;
	/** The colour map nodes of the layers (plan 381): their texture follows `pass.look` each frame. */
	private readonly lookNodes: N[] = [];

	constructor(
		readonly pass: MoonPass,
		private readonly lights: { sun: DirectionalLight; hemisphere: HemisphereLight }
	) {
		this.hills = pass.kind === 'hills';
		this.R = pass.radius;
		this.cubeSize = pass.bakeJobs().cubeSize;
		this.height = this.hills ? this.hillsHeight() : this.cratersHeight();
		// the atlas is allocated when the cube is first baked and freed when a hills body releases it
		this.atlas = new RenderTarget(1, 1, {
			type: HalfFloatType,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			depthBuffer: false,
			generateMipmaps: false
		});
		const patch = (kind: PatchKind): RenderTarget =>
			new RenderTarget(MOON_PATCHES[kind].texels, MOON_PATCHES[kind].texels, {
				type: FloatType,
				minFilter: NearestFilter,
				magFilter: NearestFilter,
				depthBuffer: false,
				generateMipmaps: false
			});
		this.patches = { mid: patch('mid'), fine: patch('fine') };
		const pass_ = (name: string, frag: N) => {
			const m = new MeshBasicNodeMaterial();
			m.name = name;
			m.fragmentNode = frag;
			m.depthTest = false;
			m.depthWrite = false;
			return { m, q: new QuadMesh(m) };
		};
		const size = this.cubeSize;
		this.cubePass = pass_(
			'moon-cube-bake',
			Fn(() => {
				// (hi, lo): hi a multiple of 16 m, so half floats keep centimetres
				const h = this.height(normalize(atlasBakeDirection(size))).toVar();
				const hi = floor(h.div(16.0)).mul(16.0);
				return vec4(hi, h.sub(hi), 0.0, 0.0);
			})()
		);
		this.patchPass = pass_(
			'moon-patch-bake',
			Fn(() => {
				const st = uv().mul(2.0).sub(1.0);
				const n = normalize(
					this.uPatchC.add(this.uPatchE.mul(st.x).add(this.uPatchF.mul(st.y)).mul(this.uHalfTan))
				);
				return vec4(this.height(n), 0.0, 0.0, 0.0);
			})()
		);
	}

	/** Once a frame: the uniforms, and the bakes `MoonPass.update` asked for. */
	update(renderer: WebGPURenderer): void {
		this.links.sync();
		const look = this.pass.look;
		for (const n of this.lookNodes) if (n.value !== look) n.value = look;
		const sun = this.lights.sun;
		this.uSunLight.value.copy(sun.color).multiplyScalar(sun.intensity);
		const sky = this.lights.hemisphere;
		this.uSkyLight.value.copy(sky.color).multiplyScalar(sky.intensity);
		const jobs = this.pass.bakeJobs();
		if (!jobs.cube && jobs.patches.length === 0) {
			// a hills body far away released its cube (ADR 0090): free the atlas too
			if (this.atlasOn && !this.pass.cubeOn) {
				this.atlas.setSize(1, 1);
				this.atlasOn = false;
			}
			return;
		}
		const prev = renderer.getRenderTarget();
		if (jobs.cube) {
			const { width, height } = atlasSize(this.cubeSize);
			this.atlas.setSize(width, height);
			this.atlasOn = true;
			renderer.setRenderTarget(this.atlas);
			this.cubePass.q.render(renderer);
			this.pass.markCubeBaked();
		}
		for (const { kind, frame } of jobs.patches) {
			this.uPatchC.value.set(frame.centre.x, frame.centre.y, frame.centre.z);
			this.uPatchE.value.set(frame.east.x, frame.east.y, frame.east.z);
			this.uPatchF.value.set(frame.north.x, frame.north.y, frame.north.z);
			this.uHalfTan.value = frame.halfTan;
			renderer.setRenderTarget(this.patches[kind]);
			this.patchPass.q.render(renderer);
			this.pass.markPatchBaked(kind, frame);
		}
		renderer.setRenderTarget(prev);
	}

	/** The twin of a moon layer's material (`userData.moon`), built once per layer. */
	twin(info: MoonMaterialInfo): { material: Material; sync(): void } {
		const key = `${info.kind}:${info.patch ?? ''}`;
		let t = this.twins.get(key);
		if (!t) {
			t = { material: this.layer(info), sync: () => {} };
			this.twins.set(key, t);
		}
		return t;
	}

	dispose(): void {
		this.atlas.dispose();
		this.patches.mid.dispose();
		this.patches.fine.dispose();
		this.cubePass.m.dispose();
		this.patchPass.m.dispose();
		for (const t of this.twins.values()) t.material.dispose();
		this.twins.clear();
	}

	/** The body's colour map at a unit body-fixed direction (the GLSL's `moonLook`). */
	private lookAt(n: N): N {
		const st = vec2(
			atan(n.z.negate(), n.x).mul(1 / (2 * PI)).add(0.5),
			asin(clamp(n.y, -1.0, 1.0)).mul(1 / PI).add(0.5)
		);
		const node = texture(this.pass.look, st);
		this.lookNodes.push(node);
		return node.rgb;
	}

	// --- heights --------------------------------------------------------------------------------

	/** `moonHeight` (the twin of `moonHeightGLSL`, core's `moonHeight`) with the site zones. */
	private cratersHeight(): (n: N) => N {
		const R = this.R;
		const seedShift = Math.imul(this.pass.seed, CRATERS_SEED_SALT);
		const cellHash = (c: N, salt: number, k: number): N =>
			hash13i(
				c.add(
					ivec3(
						(Math.imul(salt, 131) + k * 7919) | 0,
						(Math.imul(salt, 71) + k * 104729) | 0,
						(Math.imul(salt, 17) + k * 1299709) | 0
					)
				)
			);
		const craterProfile = (x: N, r: N): N => {
			const bowl = float(1.0).sub(x.mul(x));
			const pit = select(x.lessThan(1.0), r.mul(bowl.mul(bowl)).mul(-S.depth), float(0.0));
			const u = x.sub(1.0).div(S.rimWidth);
			return pit.add(r.mul(S.rim).mul(exp(u.mul(u).negate())));
		};
		const craterLayer = (q: N, cellKm: number, rMin: number, rSpan: number, salt: number): N => {
			const c0 = ivec3(floor(q.div(cellKm))).toVar();
			const h = float(0.0).toVar();
			Loop({ start: -1, end: 2, type: 'int', name: 'cx' }, ({ cx }: { cx: N }) => {
				Loop({ start: -1, end: 2, type: 'int', name: 'cy' }, ({ cy }: { cy: N }) => {
					Loop({ start: -1, end: 2, type: 'int', name: 'cz' }, ({ cz }: { cz: N }) => {
						const c = c0.add(ivec3(cx, cy, cz)).toVar();
						const centre = vec3(c)
							.add(vec3(cellHash(c, salt, 1), cellHash(c, salt, 2), cellHash(c, salt, 3)))
							.mul(cellKm);
						const r = cellHash(c, salt, 4)
							.mul(rSpan)
							.add(rMin)
							.mul(cellKm * 1000)
							.toVar();
						const x = length(q.sub(centre)).mul(1000.0).div(r).toVar();
						If(x.lessThan(S.reach), () => {
							h.addAssign(craterProfile(x, r));
						});
					});
				});
			});
			return h;
		};
		const zones = this.pass.craterZoneList;
		const fn = Fn(([n]: N[]) => {
			const relief = smoothstep(S.plainFrom, S.plainTo, acos(clamp(n.x, -1.0, 1.0)).mul(R)).toVar();
			const h = float(S.base).toVar();
			If(relief.greaterThan(0.0), () => {
				const q = n.mul(R / 1000).toVar();
				const sum = float(0.0).toVar();
				for (const s of S.scales)
					sum.addAssign(craterLayer(q, s.cellKm, s.radius[0], s.radius[1], s.salt + seedShift));
				const hills = noiseT(q, 1 / S.hillWavelengthKm, S.hillSalt + seedShift, int(0))
					.sub(0.5)
					.mul(2 * S.hillAmplitude);
				h.assign(relief.mul(sum.add(hills)).add(S.base));
			});
			for (const z of zones) {
				const a = acos(
					clamp(dot(n, vec3(z.direction.x, z.direction.y, z.direction.z)), -1.0, 1.0)
				).mul(R);
				const t = smoothstep(z.flatRadius, z.flatRadius + z.blendWidth, a);
				h.assign(h.sub(z.height).mul(t).add(z.height));
			}
			return h;
		});
		return (n: N): N => fn(n);
	}

	/** A hills body's height: the planet's `heightAt` on the body's biome map and zones (ADR 0090). */
	private hillsHeight(): (n: N) => N {
		const R = this.R;
		const shared = this.pass.sharedUniforms as Record<string, Uniform<any>>;
		const count = shared.uZoneCount!.value as number;
		const zs = (shared.uZones!.value as { x: number; y: number; z: number; w: number }[]).slice(
			0,
			count
		);
		const blend = (shared.uZoneBlend!.value as number[]).slice(0, count);
		const zones = (n: N): N => {
			const arcTo = (i: number): N => {
				const z = zs[i]!;
				return acos(clamp(dot(n, vec3(z.x, z.y, z.z)), -1.0, 1.0)).mul(R);
			};
			const arc0 = arcTo(0);
			let site: N = float(1.0);
			let gate: N = float(1.0);
			zs.forEach((z, i) => {
				const a = i === 0 ? arc0 : arcTo(i);
				site = site.mul(smoothstep(z.w, z.w + blend[i]!, a));
				gate = min(gate, smoothstep(LAKE.siteFrom, LAKE.siteTo, a));
			});
			return vec3(site, arc0, gate);
		};
		return heightAtFn({
			map: this.pass.biomeMap!,
			radius: R,
			shift: int(shared.uTerrainShift!.value as number),
			zones,
			bilinear: true
		});
	}

	// --- the layers ------------------------------------------------------------------------------

	private layer(info: MoonMaterialInfo): Material {
		const u = (name: string): N => this.links.of(info.uniforms, name);
		const R = this.R;
		const hills = this.hills;
		const kind = info.kind;
		const globe = kind === 'globe';
		const stone = kind === 'stone';
		const m = new MoonMaterial();
		m.color = new Color(0xffffff);
		const uRadius = u('uRadius');

		// the patch this layer reads (a stone stands on the fine one)
		const slot = (prefix: '' | 'Sec', target: RenderTarget, texels: number) => {
			const tex = target.texture;
			const C = u(`u${prefix}C`);
			const E = u(`u${prefix}E`);
			const F = u(`u${prefix}F`);
			const K = u(`u${prefix}K`);
			const fetch = (i: N): N => textureLoad(tex, clamp(i, ivec2(0), ivec2(texels - 1))).x;
			const sample = (st: N): N => {
				const t = st.mul(0.5).add(0.5).mul(texels).sub(0.5);
				const fl = floor(t);
				const fr = t.sub(fl);
				const i = ivec2(fl);
				return mix(
					mix(fetch(i), fetch(i.add(ivec2(1, 0))), fr.x),
					mix(fetch(i.add(ivec2(0, 1))), fetch(i.add(ivec2(1, 1))), fr.x),
					fr.y
				);
			};
			return { C, E, F, K, sample, texels };
		};
		const patchKind: PatchKind = info.patch ?? 'fine';
		const P = globe ? null : slot('', this.patches[patchKind], MOON_PATCHES[patchKind].texels);

		// --- vertex: the displaced position, the body-fixed direction, the height, the object normal
		let position: N;
		let objectNormal: N;
		let moonN: N;
		let patchSt: N = vec2(0.0);
		let patchH: N;
		let slope: N = float(0.0);
		let stoneShade: N = float(0.0);
		if (globe) {
			const size = this.cubeSize;
			const uCubeOn = u('uCubeOn');
			const cube = (n: N): N => {
				const t = texture(this.atlas.texture, atlasCoord(n, size)).level(0);
				return t.x.add(t.y).mul(uCubeOn);
			};
			const gN = normalize(positionGeometry).toVar();
			const gH = cube(gN).toVar();
			const t1 = normalize(
				cross(gN, select(abs(gN.y).greaterThan(0.99), vec3(1, 0, 0), vec3(0, 1, 0)))
			);
			const t2 = cross(gN, t1);
			const d = 0.004;
			const mm = uRadius.mul(d);
			const h1 = cube(normalize(gN.add(t1.mul(d))));
			const h2 = cube(normalize(gN.add(t2.mul(d))));
			objectNormal = normalize(
				gN.sub(t1.mul(h1.sub(gH).div(mm))).sub(t2.mul(h2.sub(gH).div(mm)))
			).toVar();
			position = gN.mul(uRadius.add(gH));
			moonN = gN;
			patchH = gH;
			if (hills) slope = float(1.0).sub(clamp(dot(objectNormal, gN), 0.0, 1.0));
		} else {
			const p = P!;
			const uHc = u('uHc');
			const patchPoint = (st: N, h: N): N => {
				const w = p.E.mul(st.x).add(p.F.mul(st.y));
				const kk = p.K.mul(p.K).mul(dot(w, w));
				const L = sqrt(kk.add(1.0));
				const s = kk.div(L.add(1.0));
				return w
					.mul(p.K)
					.sub(p.C.mul(s))
					.mul(uRadius.add(h).div(L))
					.add(p.C.mul(h.sub(uHc)));
			};
			const patchDir = (st: N): N => normalize(p.C.add(p.E.mul(st.x).add(p.F.mul(st.y)).mul(p.K)));
			const patchNormal = (st: N): N => {
				const ds = 2.0 / p.texels;
				const mm = p.K.mul(uRadius).mul(ds);
				const hu = p.sample(st.add(vec2(ds, 0.0))).sub(p.sample(st.sub(vec2(ds, 0.0))));
				const hv = p.sample(st.add(vec2(0.0, ds))).sub(p.sample(st.sub(vec2(0.0, ds))));
				return normalize(
					patchDir(st)
						.sub(p.E.mul(hu.div(mm.mul(2.0))))
						.sub(p.F.mul(hv.div(mm.mul(2.0))))
				);
			};
			if (stone) {
				const aStone = attribute('aStone', 'vec4');
				const sSt = aStone.xy;
				const sH = p.sample(sSt).toVar();
				const sUp = patchDir(sSt).toVar();
				const sT1 = normalize(
					cross(sUp, select(abs(sUp.y).greaterThan(0.99), vec3(1, 0, 0), vec3(0, 1, 0)))
				);
				const sT2 = cross(sUp, sT1);
				const sC = cos(aStone.w);
				const sS = sin(aStone.w);
				const sAx = sT1.mul(sC).add(sT2.mul(sS)).toVar();
				const sAz = sT2.mul(sC).sub(sT1.mul(sS)).toVar();
				const nG = normalGeometry;
				objectNormal = normalize(
					sAx
						.mul(nG.x)
						.add(sAz.mul(nG.z))
						.add(sUp.mul(nG.y.div(STONES.flatten)))
				);
				const sBase = patchPoint(sSt, sH).toVar();
				const sDist = distance(sBase, u('uStoneCam'));
				const sScale = aStone.z.mul(
					smoothstep(STONES.instanceRadius * 0.6, STONES.instanceRadius * 0.84, sDist).oneMinus()
				);
				const g = positionGeometry;
				position = sBase
					.add(sAx.mul(g.x).add(sAz.mul(g.z)).mul(sScale))
					.add(sUp.mul(g.y.sub(STONES.sink).mul(STONES.flatten).mul(sScale)));
				moonN = sUp;
				patchSt = sSt;
				patchH = sH;
				stoneShade = attribute('aStoneShade', 'float');
			} else {
				const pSt = positionGeometry.xy;
				const pH = p.sample(pSt).toVar();
				position = patchPoint(pSt, pH.sub(positionGeometry.z.mul(u('uDrop'))));
				moonN = patchDir(pSt);
				patchSt = pSt;
				patchH = pH;
				objectNormal = patchNormal(pSt).toVar();
				if (hills) slope = float(1.0).sub(clamp(dot(objectNormal, moonN), 0.0, 1.0));
			}
		}
		m.positionNode = position;
		const vMoonN = varying(moonN, 'vMoonN');
		const vPatchSt = varying(patchSt, 'vPatchSt');
		const vPatchH = varying(patchH, 'vPatchH');
		const vObjectNormal = varying(objectNormal, 'vObjectNormal');
		const vSlope = hills ? varying(slope, 'vSlope') : float(0.0);
		const vStoneShade = stone ? varying(stoneShade, 'vStoneShade') : float(0.0);

		// --- fragment: the footprint of the finer layer, the colour, the bump
		const covered = (n: N): N => {
			const d = dot(n, u('uCoverC'));
			const st = vec2(dot(n, u('uCoverE')), dot(n, u('uCoverF'))).div(d.mul(u('uCoverK')));
			return u('uCoverOn')
				.greaterThan(0.5)
				.and(d.greaterThan(0.0))
				.and(max(abs(st.x), abs(st.y)).lessThan(0.97));
		};
		const nM = normalize(vMoonN);
		const viewDist = length(positionView);
		let colour: N;
		let water: N = float(0.0);
		let bumpH: N = null;
		if (hills) {
			const hc = this.hillsColour(vMoonN, vPatchH, vSlope).toVar();
			colour = hc.xyz;
			water = hc.w;
			const bp = vMoonN.mul(R);
			const nearW = smoothstep(30.0, 220.0, viewDist).oneMinus();
			const farW = smoothstep(120.0, 900.0, viewDist).oneMinus();
			bumpH = nearW
				.mul(0.06)
				.mul(noiseF(bp.div(2.5)))
				.add(farW.mul(0.3).mul(noiseF(bp.div(7.0))))
				.mul(water.oneMinus());
		} else if (stone) {
			colour = u('uTint').mul(this.lookAt(nM)).mul(vStoneShade.mul(0.9).add(0.45));
		} else {
			const mp = vMoonN.mul(R);
			const huge = noiseF(mp.div(60000.0));
			const broad = noiseF(mp.div(9000.0));
			const mid = noiseF(mp.div(140.0));
			const fine = noiseF(mp.div(3.0));
			const grit = noiseF(mp.mul(1.7));
			const arc = acos(clamp(vMoonN.x, -1.0, 1.0)).mul(R);
			const basin = smoothstep(S.plainFrom * 1.6, S.plainTo * 2.4, arc).oneMinus();
			const shade = huge
				.sub(0.5)
				.mul(0.5)
				.add(0.7)
				.add(broad.mul(0.34))
				.add(mid.sub(0.5).mul(0.2))
				.add(fine.sub(0.5).mul(0.16))
				.add(grit.sub(0.5).mul(0.1));
			colour = u('uTint').mul(this.lookAt(nM)).mul(shade).mul(basin.mul(0.38).oneMinus());
			const bp = mp;
			const density = smoothstep(0.35, 0.7, noiseF(bp.div(24.0)));
			const small = smoothstep(0.6, 1.0, noiseF(bp.div(0.7).add(17.0)));
			const domeWeight = smoothstep(
				STONES.instanceRadius * 0.6,
				STONES.instanceRadius * 0.84,
				viewDist
			);
			const domeFar = smoothstep(STONES.farFade[0], STONES.farFade[1], viewDist).oneMinus();
			const stones = domeWeight
				.mul(domeFar)
				.mul(this.stoneDomes(nM, u('uStoneSalt'), uRadius))
				.add(density.mul(0.12).mul(small).mul(small));
			bumpH = noiseF(bp.mul(2.3))
				.mul(0.03)
				.add(noiseF(bp.mul(9.0)).mul(0.012))
				.add(stones)
				.add(noiseF(bp.div(6.0)).mul(0.2));
		}
		m.colorNode = Fn(() => {
			if (!stone) If(covered(nM), () => Discard());
			return vec4(colour, 1.0);
		})();
		const baseNormal = normalize(transformNormalToView(normalize(vObjectNormal)));
		m.normalNode = bumpH ? bump(bumpH, baseNormal) : baseNormal;

		// --- the terrain shadow on the sun's light: the patches and the stones (not a hills body's stones: none)
		if (!globe) {
			const march = hills ? HILLS_SHADOW_MARCH : SHADOW_MARCH;
			const sec =
				patchKind === 'fine' ? slot('Sec', this.patches.mid, MOON_PATCHES.mid.texels) : null;
			const vis = this.sunVisibility(
				march,
				P!,
				sec,
				sec ? u('uSecOn') : float(0.0),
				vPatchSt,
				vPatchH,
				stone ? STONES_LIFT : 0,
				u
			);
			m.sunVisibility = vis.div(u('uSunScale'));
		}

		// --- the sea and the air, over the lit colour
		const air =
			this.pass.atmosphere && !stone
				? makeAir(this.pass.sharedUniforms as Record<string, Uniform<unknown>>, (name) =>
						this.links.of(this.pass.sharedUniforms as Record<string, Uniform<unknown>>, name)
					)
				: null;
		const sea = hills && !stone;
		if (sea || air) {
			const camBody = u('uCamBody');
			const airSun = u('uAirSun');
			m.outputNode = Fn(() => {
				const c = output.rgb.toVar();
				const p = vMoonN.mul(uRadius.add(vPatchH)).toVar();
				if (sea) {
					let n: N = nM;
					if (!globe) {
						const metres = vPatchSt.mul(P!.K).mul(uRadius);
						const t = u('uSeaTime');
						const wave = (a: number, k: [number, number], speed: number): N =>
							vec2(k[0], k[1])
								.mul(a)
								.mul(cos(dot(metres, vec2(k[0], k[1])).mul(6.2832).add(t.mul(speed))));
						const g = wave(0.045, [0.031, 0.017], 1.3)
							.add(wave(0.035, [-0.023, 0.041], 1.7))
							.add(wave(0.02, [0.091, -0.067], 2.9));
						n = normalize(nM.sub(P!.E.mul(g.x).add(P!.F.mul(g.y)).mul(6.2832)));
					}
					const v = normalize(camBody.sub(p));
					const nv = max(dot(n, v), 0.0);
					const fres = pow(nv.oneMinus(), 5.0).mul(0.98).add(0.02);
					const r = reflect(airSun.negate(), n);
					const glint = pow(max(dot(r, v), 0.0), 700.0).mul(step(0.0, dot(n, airSun)));
					If(water.greaterThan(0.0), () => {
						c.addAssign(
							fres.mul(this.uSkyLight).mul(0.35).add(glint.mul(this.uSunLight).mul(3.0)).mul(water)
						);
					});
				}
				if (air) {
					const ro = camBody;
					const seg = p.sub(ro);
					const tg = max(length(seg), 1e-3).toVar();
					const rd = seg.div(tg).toVar();
					const r0 = length(ro).toVar();
					const at = air.raySphere(r0, dot(ro, rd).div(r0), air.top).toVar();
					const t0 = max(at.x, 0.0).toVar();
					const t1 = min(at.y, tg).toVar();
					If(at.y.greaterThan(0.0).and(t1.greaterThan(t0)), () => {
						const sc = air.march(
							ro,
							rd,
							t0,
							t1,
							airSun,
							float(0.5),
							select(r0.lessThan(air.top), float(2.0), float(1.0)),
							MOON_AIR_SAMPLES
						);
						c.assign(c.mul(sc.transmittance).add(sc.inscatter));
					});
				}
				return vec4(c, output.a);
			})();
		}
		return m;
	}

	/** The hills' ground colour (xyz) and its water (w) at a body-fixed direction (`hillsFragmentColor`). */
	private hillsColour(vMoonN: N, h: N, vSlope: N): N {
		const R = this.R;
		const shared = this.pass.sharedUniforms as Record<string, Uniform<any>>;
		const shift = int(shared.uTerrainShift!.value as number);
		const map = this.pass.biomeMap!;
		const mp = vMoonN.mul(R);
		const ll = warpedLatLon(vMoonN, float(R), shift);
		// the map at the mip its texel footprint asks for (the longitude's derivative jumps at the seam)
		const fw = fwidth(mp);
		const lod = max(log2(length(fw).div(3700.0)), 0.0);
		const lodSafe = select(nan(lod), float(0.0), lod);
		const bm = texture(map, vec2(ll.y.div(2 * PI).add(0.5), ll.x.div(PI).add(0.5)))
			.level(lodSafe)
			.toVar();
		const e = bm.r;
		const moist = bm.g;
		const temp = bm.b;
		const cn = noiseF(mp.div(4000.0)).sub(0.5).toVar();
		const mid = noiseF(mp.div(90.0)).sub(0.5);
		const fine = noiseF(mp.div(5.0)).sub(0.5).toVar();
		const tone = clamp(fine.add(0.5), 0.0, 1.0).mul(0.4).add(0.82);
		const lush = clamp(cn.mul(0.9).add(mid.mul(0.4)).add(0.5), 0.0, 1.0);
		const grass = mix(
			vec3(0.052, 0.135, 0.028),
			vec3(0.095, 0.185, 0.042),
			smoothstep(0.2, 0.6, lush)
		).mul(tone);
		const wForest = smoothstep(0.55, 0.72, moist).mul(smoothstep(900.0, 1600.0, h).oneMinus());
		const forest = vec3(0.03, 0.075, 0.026).mul(
			clamp(cn.add(mid.mul(0.6)).add(0.5), 0.0, 1.0)
				.mul(0.5)
				.add(0.8)
		);
		const wDesert = smoothstep(0.26, 0.4, moist)
			.oneMinus()
			.mul(smoothstep(0.35, 0.5, temp));
		const desert = mix(
			vec3(0.42, 0.29, 0.15),
			vec3(0.58, 0.43, 0.25),
			clamp(cn.mul(1.2).add(0.5), 0.0, 1.0)
		);
		const veg0 = mix(mix(grass, forest, wForest), desert, wDesert);
		const alpine = mix(vec3(0.13, 0.15, 0.07), vec3(0.2, 0.19, 0.11), clamp(cn.add(0.5), 0.0, 1.0));
		const veg = mix(veg0, alpine, smoothstep(800.0, 1500.0, h));
		const rockc = mix(
			vec3(0.17, 0.15, 0.135),
			vec3(0.34, 0.31, 0.27),
			clamp(cn.mul(1.3).add(mid.mul(0.5)).add(fine.mul(0.3)).add(0.5), 0.0, 1.0)
		);
		const wRock = max(
			max(
				max(
					smoothstep(HIGHLAND - 0.06, HIGHLAND + 0.05, e),
					smoothstep(0.7, 0.9, bm.a.add(cn.mul(0.3)))
				),
				smoothstep(0.06, 0.22, vSlope.mul(3.0))
			),
			smoothstep(1500.0, 2100.0, h.add(cn.mul(300.0)))
		).toVar();
		const snowLine = cn.mul(420.0).add(2800.0);
		const wSnow = max(
			max(smoothstep(0.22, 0.12, temp), smoothstep(0.9, 0.97, e)),
			smoothstep(snowLine.sub(150.0), snowLine.add(250.0), h)
		);
		const sand = vec3(0.44, 0.38, 0.26).mul(clamp(fine.add(0.5), 0.0, 1.0).mul(0.16).add(0.92));
		const wBeach = smoothstep(SEA_LEVEL + BEACH_WIDTH * 0.5, SEA_LEVEL + BEACH_WIDTH * 1.6, e)
			.oneMinus()
			.mul(wRock.oneMinus());
		const land = mix(
			mix(mix(veg, rockc, wRock), sand, wBeach),
			vec3(0.78, 0.8, 0.84),
			wSnow.mul(smoothstep(0.0, 1.0, vSlope.mul(2.0).oneMinus()))
		);
		// water: the open sea under sea level, and a lake where the height function's lake level reaches its floor
		const arc = acos(clamp(vMoonN.x, -1.0, 1.0)).mul(R);
		const lakeLevel = noiseT(vMoonN.mul(R / 1000), 1 / LAKE.wavelengthKm, LAKE.salt, shift)
			.mul(smoothstep(LAKE.siteFrom, LAKE.siteTo, arc))
			.toVar();
		const lw = lakeLevel
			.sub(LAKE.to)
			.div(max(fwidth(lakeLevel), 1e-7))
			.add(0.5);
		const lakeW = select(
			nan(lw),
			select(lakeLevel.greaterThan(LAKE.to), float(1.0), float(0.0)),
			clamp(lw, 0.0, 1.0)
		);
		const seaW = smoothstep(SEA_LEVEL - 0.004, SEA_LEVEL, e).oneMinus();
		const water = max(seaW, lakeW).toVar();
		const deep = mix(
			vec3(0.011, 0.034, 0.062),
			vec3(0.02, 0.07, 0.085),
			smoothstep(SEA_LEVEL - 0.14, SEA_LEVEL, e)
		);
		return vec4(mix(land, deep, water), water);
	}

	/** The lattice stones as domes (`stoneDomes`, core's `stones.ts`): the bump's height of a stone, m. */
	private stoneDomes(n: N, salt: N, R: N): N {
		return Fn(() => {
			const an = abs(n);
			const isX = an.x.greaterThanEqual(an.y).and(an.x.greaterThanEqual(an.z));
			const isY = isX.not().and(an.y.greaterThanEqual(an.z));
			const face = select(
				isX,
				select(n.x.greaterThan(0.0), int(0), int(1)),
				select(
					isY,
					select(n.y.greaterThan(0.0), int(2), int(3)),
					select(n.z.greaterThan(0.0), int(4), int(5))
				)
			).toVar();
			const ab = select(
				isX,
				vec2(n.y, n.z).div(an.x),
				select(isY, vec2(n.z, n.x).div(an.y), vec2(n.x, n.y).div(an.z))
			);
			const p = ab.mul(R).toVar();
			const c0 = ivec2(floor(p.div(STONES.cell))).toVar();
			const best = float(0.0).toVar();
			const salted = face.mul(131).add(salt).toVar();
			const stoneHash = (ci: N, cj: N, k: number): N =>
				hash13i(ivec3(ci.add(k * 7919), cj.add(k * 104729), salted));
			for (let dj = -1; dj <= 1; dj++) {
				for (let di = -1; di <= 1; di++) {
					const ci = c0.x.add(di).toVar();
					const cj = c0.y.add(dj).toVar();
					const r3 = hash13i(
						ivec3(
							int(floor(float(ci).div(STONES.regionCells))),
							int(floor(float(cj).div(STONES.regionCells))),
							salted.add(1)
						)
					);
					const chance = r3.mul(r3).mul(r3).mul(STONES.busy).add(STONES.quiet);
					const centre = vec2(float(ci), float(cj))
						.add(0.2)
						.add(vec2(stoneHash(ci, cj, 1), stoneHash(ci, cj, 2)).mul(0.6))
						.mul(STONES.cell);
					const hr = stoneHash(ci, cj, 3);
					const radius = hr
						.mul(hr)
						.mul(STONES.radiusSpan)
						.add(STONES.radiusMin)
						.mul(
							select(
								stoneHash(ci, cj, 4).greaterThan(1 - STONES.boulderChance),
								float(STONES.boulderScale),
								float(1.0)
							)
						)
						.toVar();
					const x = length(p.sub(centre)).div(radius);
					const w = float(1.0).sub(x.mul(x));
					const dome = select(
						stoneHash(ci, cj, 0).lessThan(chance).and(x.lessThan(1.0)),
						radius.mul(w.mul(w)).mul(STONES.flatten * (1 - STONES.sink)),
						float(0.0)
					);
					best.assign(max(best, dome));
				}
			}
			return best;
		})();
	}

	/** The sun's visibility at a patch point (`moonSunVisibility`, `terrainSunVisibility`'s twin, ADR 0068). */
	private sunVisibility(
		M: ShadowMarch,
		P: { C: N; E: N; F: N; K: N; sample(st: N): N },
		sec: { C: N; E: N; F: N; K: N; sample(st: N): N } | null,
		secOn: N,
		st: N,
		h0: N,
		lift: number,
		u: (name: string) => N
	): N {
		const R = u('uRadius');
		const sunB = u('uSunBody');
		const steps = u('uShadowSteps');
		return Fn(() => {
			const n0 = normalize(P.C.add(P.E.mul(st.x).add(P.F.mul(st.y)).mul(P.K))).toVar();
			const mu = dot(n0, sunB).toVar();
			const vis = float(1.0).toVar();
			If(u('uShadowOn').lessThan(0.5), () => {
				vis.assign(1.0);
			})
				.ElseIf(mu.lessThan(M.nightSine), () => {
					vis.assign(0.0);
				})
				.ElseIf(mu.lessThan(M.freeSine), () => {
					const hh = h0.add(lift).toVar();
					const r0 = R.add(hh).toVar();
					const len = clamp(
						float(M.relief).div(max(mu, M.minSine)),
						M.minLength,
						M.maxDistance
					).toVar();
					const phase = fract(
						fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189)
					).toVar();
					const fsteps = float(steps).toVar();
					Loop(
						{ start: 1, end: M.steps, type: 'int', condition: '<=', name: 'si' },
						({ si }: { si: N }) => {
							If(si.greaterThan(steps), () => {
								Break();
							});
							const fi = float(si).sub(phase).div(fsteps);
							const t = fi.mul(fi).mul(len.sub(M.minDistance)).add(M.minDistance).toVar();
							const d = hh.mul(R.mul(2.0).add(hh)).add(t.mul(r0).mul(mu).mul(2.0)).add(t.mul(t));
							const q = n0.mul(r0).add(sunB.mul(t)).toVar();
							const hq = d.div(length(q).add(R));
							const g = float(0.0).toVar();
							const inside = float(0.0).toVar();
							const dp = dot(q, P.C);
							const s = vec2(dot(q, P.E), dot(q, P.F)).div(dp.mul(P.K));
							If(dp.greaterThan(0.0).and(max(abs(s.x), abs(s.y)).lessThan(0.98)), () => {
								g.assign(P.sample(s));
								inside.assign(1.0);
							}).Else(() => {
								if (sec) {
									const dq = dot(q, sec.C);
									const s2 = vec2(dot(q, sec.E), dot(q, sec.F)).div(dq.mul(sec.K));
									If(
										secOn
											.greaterThan(0.5)
											.and(dq.greaterThan(0.0))
											.and(max(abs(s2.x), abs(s2.y)).lessThan(0.98)),
										() => {
											g.assign(sec.sample(s2));
											inside.assign(1.0);
										}
									);
								}
							});
							If(inside.lessThan(0.5), () => {
								Break();
							});
							const a = hq.sub(g).add(M.biasAbsolute).add(t.mul(M.biasPerMetre)).div(t);
							vis.assign(min(vis, clamp(a.div(M.sunRadius).mul(0.5).add(0.5), 0.0, 1.0)));
							If(vis.lessThan(0.002), () => {
								vis.assign(0.0);
								Break();
							});
						}
					);
				});
			return vis;
		})();
	}
}

/** The sky shell of a body with air (`skyShellMaterial`, ADR 0121 point 2): in-scatter along each view ray, added. */
export function skyShellTwin(sm: ShaderMaterial): { material: Material; sync(): void } {
	const syncs: (() => void)[] = [];
	const link = (name: string): N => {
		const src = sm.uniforms[name]!;
		const v = src.value as { clone?: () => unknown } | number;
		const node = typeof v === 'number' ? uniform(v) : uniform((v as { clone(): unknown }).clone());
		syncs.push(() => {
			if (typeof node.value === 'number') node.value = sm.uniforms[name]!.value;
			else node.value.copy(sm.uniforms[name]!.value);
		});
		return node;
	};
	const air = makeAir(sm.uniforms as Record<string, Uniform<unknown>>, link);
	const cam = link('uCamBody');
	const sun = link('uSunBody');
	const radius = link('uRadius');
	const m = new MeshBasicNodeMaterial();
	m.name = 'moon-sky-shell';
	const vBody = varying(positionGeometry, 'vBody');
	m.colorNode = Fn(() => {
		const ro = cam;
		const rd = normalize(vBody.sub(ro)).toVar();
		const r0 = length(ro).toVar();
		const mu = dot(ro, rd).div(r0).toVar();
		const at = air.raySphere(r0, mu, air.top).toVar();
		// the ground's own aerial perspective covers the rays that reach it
		const ground = air.raySphere(r0, mu, radius).toVar();
		const t0 = max(at.x, 0.0).toVar();
		const t1 = select(
			ground.y.greaterThan(0.0).and(ground.x.greaterThan(0.0)),
			min(at.y, ground.x),
			at.y
		).toVar();
		If(at.y.lessThanEqual(0.0).or(t1.lessThanEqual(t0)), () => Discard());
		const sc = air.march(
			ro,
			rd,
			t0,
			t1,
			sun,
			float(0.5),
			select(r0.lessThan(air.top), float(2.0), float(1.0)),
			MOON_AIR_SAMPLES
		);
		return vec4(sc.inscatter, 1.0);
	})();
	m.side = BackSide;
	m.blending = AdditiveBlending;
	m.transparent = true;
	m.depthWrite = false;
	m.fog = false;
	return { material: m, sync: () => syncs.forEach((s) => s()) };
}
