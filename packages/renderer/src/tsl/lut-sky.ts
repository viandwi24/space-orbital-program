/**
 * Hillaire's sky (EGSR 2020) in TSL on our air (plan 261 Phases 2 and 6; the spike measured it in
 * `webgpu-spike/`): Rayleigh, the march's Mie split (scatters βM / 1.1, extinguishes 1.1 βM) and
 * ozone, with every order of scattering instead of the march's `skyBoost`.
 *
 * - **Transmittance** 256 × 64 (Bruneton's mapping), baked once per atmosphere.
 * - **Multiple scattering** 32 × 32 (height × sun), baked once: 64 directions, 20 steps, ground bounce.
 * - **Sky view** 192 × 108 (view angle × azimuth from the sun, finest at the horizon), rebuilt
 *   per frame for the camera's height and sun, 32 samples a texel. Its rays stop at the sea-level
 *   sphere, so it is also the air in front of ground drawn on that sphere.
 *
 * Positions are planet-centred, metres. Radiance comes out times the sun's irradiance.
 */
import { HalfFloatType, LinearFilter, RenderTarget, Vector3 } from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import { OZONE, type Atmosphere } from '../atmosphere-model.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	If,
	Loop,
	acos,
	clamp,
	cos,
	dot,
	exp,
	float,
	length,
	max,
	min,
	mix,
	normalize,
	pow,
	select,
	sin,
	smoothstep,
	sqrt,
	texture,
	uniform,
	uv,
	vec2,
	vec3,
	vec4,
	cross
} = T;

const PI = Math.PI;
const TRANS = { w: 256, h: 64 };
const MS = { w: 32, h: 32 };
const VIEW = { w: 192, h: 108 };
const TRANS_STEPS = 40;
const MS_DIRS = 8;
const MS_STEPS = 20;
const VIEW_STEPS = 32;
/** The sun's angular radius, rad: the terminator fades over the disc instead of cutting. */
const SUN_RADIUS = 0.00467;

const target = (size: { w: number; h: number }): RenderTarget =>
	new RenderTarget(size.w, size.h, {
		type: HalfFloatType,
		magFilter: LinearFilter,
		minFilter: LinearFilter,
		depthBuffer: false,
		generateMipmaps: false
	});
/** A table's texel centre for a value in [0, 1], and back (Bruneton's half-texel remap). */
const toTexel = (x: N, size: number): N => x.mul(1 - 1 / size).add(0.5 / size);
const fromTexel = (u: N, size: number): N => u.sub(0.5 / size).div(1 - 1 / size);

export interface LutSky {
	/**
	 * In-scattered radiance along the camera's ray `rd` from `ro` (the camera the sky view was last
	 * built for) to the sea-level sphere or out of the air; zero for a ray that misses the air.
	 */
	inscatter(ro: N, rd: N): N;
	/** Transmittance of that ray: to the ground at `tG` where it hits it, else out of the air. */
	viewTransmittance(ro: N, rd: N, hitGround: N, tG: N): N;
	/**
	 * The air between `ro + rd tA` and `ro + rd tB` marched in `steps` steps with the tables (for a
	 * ray that ends on terrain, which the sky view's sea-level rays do not reach): in-scatter and
	 * transmittance, as shader variables.
	 */
	segment(ro: N, rd: N, tA: N, tB: N, steps: number): { inscatter: N; transmittance: N };
	/**
	 * The twin of the GLSL's \`marchAtmosphere\` on the tables: t0..t1 in \`steps\` samples spaced by
	 * \`power\` (2 inside the air: denser near the camera), jittered; with the state at tcA and tcB
	 * (the cloud layers; past t1 they are the whole path).
	 */
	march(
		ro: N,
		rd: N,
		t0: N,
		t1: N,
		tcA: N,
		tcB: N,
		steps: number,
		power: N,
		jitter: N
	): { inscatter: N; transmittance: N; insA: N; transA: N; insB: N; transB: N };
	/** Sunlight reaching planet-centred point `p` (a fraction per channel), faded across the sun's disc. */
	sunlight(p: N, l: N): N;
	/** Bakes the transmittance and multiple-scattering tables (once per atmosphere). */
	bake(renderer: WebGPURenderer): void;
	/** Rebuilds the sky view for a camera at radius `r` with the sun `sun` (unit) and up `up` (unit). */
	update(renderer: WebGPURenderer, r: number, up: Vector3, sun: Vector3): void;
	dispose(): void;
}

export function createLutSky(atm: Atmosphere): LutSky {
	const Rg = atm.radius;
	const Rt = atm.radius + atm.height;
	const H = Math.sqrt(Rt * Rt - Rg * Rg);
	const betaR = vec3(...atm.betaRayleigh);
	const betaO = vec3(...atm.betaOzone);
	const betaMs = float(atm.betaMie / 1.1);
	const betaMe = float(atm.betaMie * 1.1);
	const uViewR = uniform(Rg + 1);
	const uSunMu = uniform(0);

	const raySphere = (r0: N, mu: N, rs: number | N): N => {
		const b = r0.mul(mu);
		const disc = b.mul(b).sub(r0.sub(rs).mul(r0.add(rs)));
		const s = sqrt(max(disc, 0.0));
		return select(disc.lessThan(0.0), vec2(-1.0), vec2(b.negate().sub(s), b.negate().add(s)));
	};
	const ozone = (h: N): N => {
		const rise = h.sub(OZONE.base).div(OZONE.peak - OZONE.base);
		const fall = float(OZONE.top)
			.sub(h)
			.div(OZONE.top - OZONE.peak);
		return max(select(h.lessThan(OZONE.peak), rise, fall), 0.0);
	};
	const density = (h: N): N =>
		vec3(exp(h.negate().div(atm.rayleighHeight)), exp(h.negate().div(atm.mieHeight)), ozone(h));
	const extinctionOf = (d: N): N =>
		betaR
			.mul(d.x)
			.add(vec3(betaMe.mul(d.y)))
			.add(betaO.mul(d.z));
	const rayleighPhase = (c: N): N => float(3.0 / (16.0 * PI)).mul(c.mul(c).add(1.0));
	const miePhase = (c: N): N => {
		const g = atm.mieG;
		return float((1 - g * g) / (4 * PI)).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));
	};

	// --- transmittance ----------------------------------------------------------------------------
	const transRT = target(TRANS);
	const transFrag = Fn(() => {
		const xmu = fromTexel(uv().x, TRANS.w);
		const xr = fromTexel(uv().y, TRANS.h);
		const rho = xr.mul(H);
		const r = sqrt(rho.mul(rho).add(Rg * Rg));
		const dMin = float(Rt).sub(r);
		const dMax = rho.add(H);
		const d = dMin.add(xmu.mul(dMax.sub(dMin)));
		const mu = clamp(
			select(
				d.lessThan(1.0),
				float(1.0),
				float(H * H)
					.sub(rho.mul(rho))
					.sub(d.mul(d))
					.div(r.mul(d).mul(2.0))
			),
			-1.0,
			1.0
		);
		const od = vec3(0.0).toVar();
		const ds = d.div(TRANS_STEPS);
		Loop({ start: 0, end: TRANS_STEPS, type: 'int', name: 'ti' }, ({ ti }: { ti: N }) => {
			const t = float(ti).add(0.5).mul(ds);
			const rr = sqrt(r.mul(r).add(t.mul(t)).add(r.mul(mu).mul(t).mul(2.0)));
			od.addAssign(density(max(rr.sub(Rg), 0.0)).mul(ds));
		});
		return vec4(exp(extinctionOf(od).negate()), 1.0);
	});
	/** Transmittance from radius r along cosine mu to the top of the air (the ground ignored). */
	const transmittance = (r0: N, mu: N): N => {
		const r = clamp(r0, Rg, Rt);
		const rho = sqrt(max(r.sub(Rg).mul(r.add(Rg)), 0.0));
		const d = max(
			r
				.mul(mu)
				.negate()
				.add(
					sqrt(
						max(
							r
								.mul(r)
								.mul(mu.mul(mu).sub(1.0))
								.add(Rt * Rt),
							0.0
						)
					)
				),
			0.0
		);
		const dMin = float(Rt).sub(r);
		const dMax = rho.add(H);
		const xmu = d.sub(dMin).div(max(dMax.sub(dMin), 1e-3));
		const coord = vec2(toTexel(clamp(xmu, 0.0, 1.0), TRANS.w), toTexel(rho.div(H), TRANS.h));
		return texture(transRT.texture, coord).level(0).xyz;
	};
	const sunlight = (p: N, l: N): N => {
		const r = length(p);
		const mu = dot(p, l).div(r);
		const s = float(Rg).div(r);
		const muH = sqrt(max(float(1.0).sub(s.mul(s)), 0.0)).negate();
		return transmittance(r, mu).mul(smoothstep(-SUN_RADIUS, SUN_RADIUS, mu.sub(muH)));
	};

	// --- multiple scattering ----------------------------------------------------------------------
	const msRT = target(MS);
	// the planet pass's ground (albedo times 0.08 of the irradiance), as an albedo
	const groundAlbedo = vec3(0.18, 0.2, 0.12).mul(0.08 * PI);
	const msFrag = Fn(() => {
		const sunMu = fromTexel(uv().x, MS.w).mul(2.0).sub(1.0);
		const r = mix(float(Rg + 1), float(Rt - 1), fromTexel(uv().y, MS.h));
		const pos = vec3(0.0, r, 0.0);
		const sun = vec3(sqrt(max(float(1.0).sub(sunMu.mul(sunMu)), 0.0)), sunMu, 0.0);
		const sumL = vec3(0.0).toVar();
		const sumF = vec3(0.0).toVar();
		Loop({ start: 0, end: MS_DIRS, type: 'int', name: 'mi' }, ({ mi }: { mi: N }) => {
			Loop({ start: 0, end: MS_DIRS, type: 'int', name: 'mj' }, ({ mj }: { mj: N }) => {
				const cz = float(1.0).sub(
					float(mj)
						.add(0.5)
						.mul(2.0 / MS_DIRS)
				);
				const sz = sqrt(max(float(1.0).sub(cz.mul(cz)), 0.0));
				const phi = float(mi)
					.add(0.5)
					.mul((2 * PI) / MS_DIRS);
				const dir = vec3(sz.mul(cos(phi)), cz, sz.mul(sin(phi)));
				const top = raySphere(r, cz, Rt);
				const gnd = raySphere(r, cz, Rg);
				const hitGround = gnd.x.greaterThan(0.0);
				const tMax = select(hitGround, gnd.x, top.y);
				const dt = tMax.div(MS_STEPS);
				const L = vec3(0.0).toVar();
				const F = vec3(0.0).toVar();
				const thr = vec3(1.0).toVar();
				Loop({ start: 0, end: MS_STEPS, type: 'int', name: 'ms' }, ({ ms }: { ms: N }) => {
					const p = pos.add(dir.mul(float(ms).add(0.5).mul(dt)));
					const dn = density(max(length(p).sub(Rg), 0.0));
					const sigS = betaR.mul(dn.x).add(vec3(betaMs.mul(dn.y)));
					const sigT = max(extinctionOf(dn), vec3(1e-20));
					const stepT = exp(sigT.negate().mul(dt));
					const S = sunlight(p, sun)
						.mul(sigS)
						.mul(1.0 / (4.0 * PI));
					L.addAssign(thr.mul(S.sub(S.mul(stepT)).div(sigT)));
					F.addAssign(thr.mul(sigS.sub(sigS.mul(stepT)).div(sigT)));
					thr.mulAssign(stepT);
				});
				If(hitGround, () => {
					const p = pos.add(dir.mul(tMax));
					L.addAssign(
						thr
							.mul(sunlight(p, sun))
							.mul(max(dot(normalize(p), sun), 0.0))
							.mul(groundAlbedo)
							.mul(1.0 / PI)
					);
				});
				sumL.addAssign(L);
				sumF.addAssign(F);
			});
		});
		const n = MS_DIRS * MS_DIRS;
		return vec4(sumL.div(n).div(max(vec3(1.0).sub(sumF.div(n)), vec3(1e-4))), 1.0);
	});
	const multipleScattering = (r: N, sunMu: N): N =>
		texture(
			msRT.texture,
			vec2(
				toTexel(clamp(sunMu.mul(0.5).add(0.5), 0.0, 1.0), MS.w),
				toTexel(clamp(r.sub(Rg).div(Rt - Rg), 0.0, 1.0), MS.h)
			)
		).level(0).xyz;
	const inscatterAt = (p: N, dir: N, sun: N): N => {
		const r = length(p);
		const dn = density(max(r.sub(Rg), 0.0));
		const sR = betaR.mul(dn.x);
		const sM = vec3(betaMs.mul(dn.y));
		const c = dot(dir, sun);
		const single = sunlight(p, sun).mul(sR.mul(rayleighPhase(c)).add(sM.mul(miePhase(c))));
		return single.add(multipleScattering(r, dot(p, sun).div(r)).mul(sR.add(sM)));
	};

	// --- sky view ---------------------------------------------------------------------------------
	const viewRT = target(VIEW);
	const horizon = (r: N) => {
		const vH = sqrt(max(r.sub(Rg).mul(r.add(Rg)), 0.0));
		const beta = acos(clamp(vH.div(r), 0.0, 1.0));
		return { beta, zha: float(PI).sub(beta) };
	};
	const viewFrag = Fn(() => {
		const u = fromTexel(uv().x, VIEW.w);
		const v = fromTexel(uv().y, VIEW.h);
		const r = uViewR;
		const { beta, zha } = horizon(r);
		// squares by multiplication: pow of a negative base is NaN in WGSL
		const c2 = v.mul(2.0).sub(1.0);
		const above = float(1.0).sub(c2.mul(c2)).mul(zha);
		const below = zha.add(beta.mul(c2.mul(c2)));
		const vz = select(v.lessThan(0.5), above, below);
		const cz = cos(vz);
		const sz = sin(vz);
		const lv = float(1.0).sub(u.mul(u).mul(2.0));
		const dir = vec3(sz.mul(lv), cz, sz.mul(sqrt(max(float(1.0).sub(lv.mul(lv)), 0.0))));
		const sun = vec3(sqrt(max(float(1.0).sub(uSunMu.mul(uSunMu)), 0.0)), uSunMu, 0.0);
		const pos = vec3(0.0, r, 0.0);
		const top = raySphere(r, cz, Rt);
		const gnd = raySphere(r, cz, Rg);
		const t0 = max(top.x, 0.0);
		const t1 = select(gnd.x.greaterThan(0.0), gnd.x, top.y);
		const dt = max(t1.sub(t0), 0.0).div(VIEW_STEPS);
		const L = vec3(0.0).toVar();
		const thr = vec3(1.0).toVar();
		Loop({ start: 0, end: VIEW_STEPS, type: 'int', name: 'vi' }, ({ vi }: { vi: N }) => {
			const p = pos.add(dir.mul(t0.add(float(vi).add(0.5).mul(dt))));
			const sigT = max(extinctionOf(density(max(length(p).sub(Rg), 0.0))), vec3(1e-20));
			const stepT = exp(sigT.negate().mul(dt));
			const S = inscatterAt(p, dir, sun);
			L.addAssign(thr.mul(S.sub(S.mul(stepT)).div(sigT)));
			thr.mulAssign(stepT);
		});
		return vec4(select(top.y.greaterThan(0.0), L, vec3(0.0)).mul(atm.sunIrradiance), 1.0);
	});
	// the sun the sky view was built with, for the lookup's azimuth
	const uSun = uniform(new Vector3(0, 1, 0));

	const inscatter = (ro: N, rd: N): N => {
		const r = length(ro);
		const up = ro.div(r);
		const cz = dot(up, rd);
		const gnd = raySphere(r, cz, Rg);
		const side = normalize(cross(up, rd));
		const fwd = normalize(cross(side, up));
		const lp = normalize(vec2(dot(uSun, fwd), dot(uSun, side)));
		const u = sqrt(clamp(lp.x.mul(-0.5).add(0.5), 0.0, 1.0));
		const { beta, zha } = horizon(r);
		const a = acos(clamp(cz, -1.0, 1.0));
		const vAbove = float(1.0)
			.sub(sqrt(max(float(1.0).sub(a.div(zha)), 0.0)))
			.mul(0.5);
		const vBelow = sqrt(max(a.sub(zha).div(beta), 0.0))
			.mul(0.5)
			.add(0.5);
		const v = select(gnd.x.greaterThan(0.0), vBelow, vAbove);
		const coord = vec2(toTexel(u, VIEW.w), toTexel(clamp(v, 0.0, 1.0), VIEW.h));
		return texture(viewRT.texture, coord).level(0).xyz;
	};

	const viewTransmittance = (ro: N, rd: N, hitGround: N, tG: N): N => {
		const r = length(ro);
		const atmHit = raySphere(r, dot(ro, rd).div(r), Rt);
		const pe = ro.add(rd.mul(max(atmHit.x, 0.0)));
		const re = min(length(pe), Rt);
		const muE = dot(pe, rd).div(re);
		const p = ro.add(rd.mul(tG));
		// toward the ground: from the ground back up over from the entry back up (Bruneton)
		const toGround = min(
			transmittance(float(Rg), dot(normalize(p), rd).negate()).div(
				max(transmittance(re, muE.negate()), vec3(1e-6))
			),
			vec3(1.0)
		);
		const toSpace = transmittance(re, muE);
		return select(atmHit.y.greaterThan(0.0), select(hitGround, toGround, toSpace), vec3(1.0));
	};

	const segment = (ro: N, rd: N, tA: N, tB: N, steps: number) => {
		const L = vec3(0.0).toVar();
		const thr = vec3(1.0).toVar();
		const dt = max(tB.sub(tA), 0.0).div(steps);
		Loop({ start: 0, end: steps, type: 'int', name: 'si' }, ({ si }: { si: N }) => {
			const p = ro.add(rd.mul(tA.add(float(si).add(0.5).mul(dt))));
			const sigT = max(extinctionOf(density(max(length(p).sub(Rg), 0.0))), vec3(1e-20));
			const stepT = exp(sigT.negate().mul(dt));
			const S = inscatterAt(p, rd, uSun);
			L.addAssign(thr.mul(S.sub(S.mul(stepT)).div(sigT)));
			thr.mulAssign(stepT);
		});
		return { inscatter: L.mul(atm.sunIrradiance), transmittance: thr };
	};

	const march = (
		ro: N,
		rd: N,
		t0: N,
		t1: N,
		tcA: N,
		tcB: N,
		steps: number,
		power: N,
		jitter: N
	) => {
		const L = vec3(0.0).toVar();
		const thr = vec3(1.0).toVar();
		const insA = vec3(0.0).toVar();
		const transA = vec3(1.0).toVar();
		const insB = vec3(0.0).toVar();
		const transB = vec3(1.0).toVar();
		const snapA = float(0.0).toVar();
		const snapB = float(0.0).toVar();
		const len = max(t1.sub(t0), 0.0).toVar();
		Loop({ start: 0, end: steps, type: 'int', name: 'ai' }, ({ ai }: { ai: N }) => {
			const u = float(ai).add(jitter).div(steps);
			const s = t0.add(len.mul(pow(u, power)));
			const ds = len
				.mul(power)
				.mul(pow(max(u, 1e-4), power.sub(1.0)))
				.div(steps);
			If(snapA.lessThan(0.5).and(s.greaterThanEqual(tcA)), () => {
				snapA.assign(1.0);
				insA.assign(L);
				transA.assign(thr);
			});
			If(snapB.lessThan(0.5).and(s.greaterThanEqual(tcB)), () => {
				snapB.assign(1.0);
				insB.assign(L);
				transB.assign(thr);
			});
			const p = ro.add(rd.mul(s));
			const sigT = max(extinctionOf(density(max(length(p).sub(Rg), 0.0))), vec3(1e-20));
			const stepT = exp(sigT.negate().mul(ds));
			const S = inscatterAt(p, rd, uSun);
			L.addAssign(thr.mul(S.sub(S.mul(stepT)).div(sigT)));
			thr.mulAssign(stepT);
		});
		If(snapA.lessThan(0.5), () => {
			insA.assign(L);
			transA.assign(thr);
		});
		If(snapB.lessThan(0.5), () => {
			insB.assign(L);
			transB.assign(thr);
		});
		const k = atm.sunIrradiance;
		return {
			inscatter: L.mul(k),
			transmittance: thr,
			insA: insA.mul(k),
			transA,
			insB: insB.mul(k),
			transB
		};
	};

	const pass = (frag: N) => {
		const m = new MeshBasicNodeMaterial();
		// raw output, as the tables are data, not colour
		m.fragmentNode = frag();
		m.depthTest = false;
		m.depthWrite = false;
		return { m, q: new QuadMesh(m) };
	};
	const transPass = pass(transFrag);
	const msPass = pass(msFrag);
	const viewPass = pass(viewFrag);
	const run = (renderer: WebGPURenderer, rt: RenderTarget, p: { q: QuadMesh }): void => {
		const prev = renderer.getRenderTarget();
		renderer.setRenderTarget(rt);
		p.q.render(renderer);
		renderer.setRenderTarget(prev);
	};

	return {
		inscatter,
		viewTransmittance,
		segment,
		march,
		sunlight,
		bake(renderer) {
			run(renderer, transRT, transPass);
			run(renderer, msRT, msPass);
		},
		update(renderer, r, up, sun) {
			uViewR.value = r;
			uSunMu.value = up.dot(sun);
			uSun.value.copy(sun);
			run(renderer, viewRT, viewPass);
		},
		dispose() {
			for (const p of [transPass, msPass, viewPass]) p.m.dispose();
			for (const rt of [transRT, msRT, viewRT]) rt.dispose();
		}
	};
}
