/**
 * Plan 261, phase 6 (spike): Hillaire's sky (EGSR 2020, "A Scalable and Production Ready Sky and
 * Atmosphere Rendering Technique") in TSL, on the same air as `atmosphereGLSL`.
 *
 * Three tables replace the per-pixel march:
 * - **transmittance** (256 × 64, height × view angle; Bruneton's mapping), baked once per atmosphere;
 * - **multiple scattering** (32 × 32, height × sun angle), baked once: every higher order of
 *   scattering from 64 directions, in place of the march's `skyBoost` fudge;
 * - **sky view** (192 × 108, view angle × azimuth from the sun, finest at the horizon), rebuilt per
 *   frame for the camera's height and the sun, 32 samples a texel.
 *
 * A screen pixel then costs one sky-view fetch, plus two transmittance fetches where it sees the
 * ground. From above the air (orbit) the same table holds: its rays start where they enter it.
 */
import { HalfFloatType, LinearFilter, RenderTarget, Vector3 } from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import { OZONE, type Atmosphere } from '../atmosphere-model.ts';

type N = any;
// three's TSL typings lag its runtime (named Loop variables, numbers for nodes): untyped here
const {
	Fn,
	If,
	Loop,
	acos,
	clamp,
	cos,
	cross,
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
	vec4
} = TSL as any;

const PI = Math.PI;
const TRANS = { w: 256, h: 64 };
const MS = { w: 32, h: 32 };
const VIEW = { w: 192, h: 108 };
const TRANS_STEPS = 40;
const MS_DIRS = 8; // 8 × 8 directions
const MS_STEPS = 20;
const VIEW_STEPS = 32;
/** The sun's angular radius, rad: the terminator fades over the disc instead of cutting. */
const SUN_RADIUS = 0.00467;

function target(size: { w: number; h: number }): RenderTarget {
	return new RenderTarget(size.w, size.h, {
		type: HalfFloatType,
		magFilter: LinearFilter,
		minFilter: LinearFilter,
		depthBuffer: false,
		generateMipmaps: false
	});
}

/** A table's texel centre for a value in [0, 1], and back (Bruneton's half-texel remap). */
const toTexel = (x: N, size: number) => x.mul(1 - 1 / size).add(0.5 / size);
const fromTexel = (u: N, size: number) => u.sub(0.5 / size).div(1 - 1 / size);

export interface LutSkyUniforms {
	camPos: { value: Vector3 };
	forward: { value: Vector3 };
	right: { value: Vector3 };
	up: { value: Vector3 };
	sun: { value: Vector3 };
	tanHalf: { value: number };
	aspect: { value: number };
}

export interface LutSky {
	uniforms: LutSkyUniforms;
	/** The screen's colour before tone mapping (linear radiance). */
	radiance: N;
	/** The ray direction of this pixel. */
	rayDir: N;
	/** Bakes the transmittance and multiple-scattering tables (once per atmosphere). */
	bake(renderer: WebGPURenderer): void;
	/** Rebuilds the sky-view table for the current camera height and sun (per frame). */
	update(renderer: WebGPURenderer): void;
	dispose(): void;
}

export function createLutSky(atm: Atmosphere): LutSky {
	const Rg = atm.radius;
	const Rt = atm.radius + atm.height;
	const H = Math.sqrt(Rt * Rt - Rg * Rg);

	const betaR = vec3(...atm.betaRayleigh);
	const betaO = vec3(...atm.betaOzone);
	// the march's split (atmosphere-model.ts): Mie scatters βM / 1.1 and extinguishes 1.1 βM
	const betaMs = float(atm.betaMie / 1.1);
	const betaMe = float(atm.betaMie * 1.1);

	const uCamPos = uniform(new Vector3());
	const uForward = uniform(new Vector3());
	const uRight = uniform(new Vector3());
	const uUp = uniform(new Vector3());
	const uSun = uniform(new Vector3());
	const uTanHalf = uniform(1);
	const uAspect = uniform(1);
	// the sky-view table's frame: the camera's radius and the sun's height above its horizon
	const uViewR = uniform(Rg + 1);
	const uSunMu = uniform(0);

	// near and far roots of a ray from radius r0 at cosine mu with a sphere rs; (-1, -1) if missed
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
	/** Rayleigh, Mie and ozone densities at height h. */
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

	// --- transmittance ------------------------------------------------------------------------
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
	/** Sunlight reaching point p (planet-centred), faded across the sun's disc at the terminator. */
	const sunlight = (p: N, l: N): N => {
		const r = length(p);
		const mu = dot(p, l).div(r);
		const s = float(Rg).div(r);
		const muH = sqrt(max(float(1.0).sub(s.mul(s)), 0.0)).negate();
		const fade = smoothstep(-SUN_RADIUS, SUN_RADIUS, mu.sub(muH));
		return transmittance(r, mu).mul(fade);
	};

	// --- multiple scattering --------------------------------------------------------------------
	const msRT = target(MS);
	const groundAlbedo = vec3(0.18, 0.2, 0.12).mul(0.08 * PI); // the march's ground, as an albedo
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
					const n = normalize(p);
					L.addAssign(
						thr
							.mul(sunlight(p, sun))
							.mul(max(dot(n, sun), 0.0))
							.mul(groundAlbedo)
							.mul(1.0 / PI)
					);
				});
				sumL.addAssign(L);
				sumF.addAssign(F);
			});
		});
		const n = MS_DIRS * MS_DIRS;
		const l2 = sumL.div(n);
		const fms = sumF.div(n);
		return vec4(l2.div(max(vec3(1.0).sub(fms), vec3(1e-4))), 1.0);
	});
	const multipleScattering = (r: N, sunMu: N): N => {
		const coord = vec2(
			toTexel(clamp(sunMu.mul(0.5).add(0.5), 0.0, 1.0), MS.w),
			toTexel(clamp(r.sub(Rg).div(Rt - Rg), 0.0, 1.0), MS.h)
		);
		return texture(msRT.texture, coord).level(0).xyz;
	};

	/** In-scattered light per metre at p toward the camera (rays travelling along dir). */
	const inscatter = (p: N, dir: N, sun: N): N => {
		const r = length(p);
		const dn = density(max(r.sub(Rg), 0.0));
		const sR = betaR.mul(dn.x);
		const sM = vec3(betaMs.mul(dn.y));
		const c = dot(dir, sun);
		const single = sunlight(p, sun).mul(sR.mul(rayleighPhase(c)).add(sM.mul(miePhase(c))));
		const multi = multipleScattering(r, dot(p, sun).div(r)).mul(sR.add(sM));
		return single.add(multi);
	};

	// --- sky view --------------------------------------------------------------------------------
	const viewRT = target(VIEW);
	/** The horizon angles from radius r: [the ground's tangent from zenith, the angle below it to nadir]. */
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
		const above = float(1.0)
			.sub(pow(float(1.0).sub(v.mul(2.0)), 2.0))
			.mul(zha);
		const below = zha.add(beta.mul(pow(v.mul(2.0).sub(1.0), 2.0)));
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
		const len = max(t1.sub(t0), 0.0);
		const dt = len.div(VIEW_STEPS);
		const L = vec3(0.0).toVar();
		const thr = vec3(1.0).toVar();
		Loop({ start: 0, end: VIEW_STEPS, type: 'int', name: 'vi' }, ({ vi }: { vi: N }) => {
			const p = pos.add(dir.mul(t0.add(float(vi).add(0.5).mul(dt))));
			const sigT = max(extinctionOf(density(max(length(p).sub(Rg), 0.0))), vec3(1e-20));
			const stepT = exp(sigT.negate().mul(dt));
			const S = inscatter(p, dir, sun);
			L.addAssign(thr.mul(S.sub(S.mul(stepT)).div(sigT)));
			thr.mulAssign(stepT);
		});
		return vec4(select(top.y.greaterThan(0.0), L, vec3(0.0)).mul(atm.sunIrradiance), 1.0);
	});

	// --- the screen --------------------------------------------------------------------------------
	// WebGPU's uv runs top-down; flip it so the frame matches the march's
	const ndc = vec2(uv().x, float(1.0).sub(uv().y)).mul(2.0).sub(1.0);
	const rayDir = normalize(
		uForward.add(uRight.mul(ndc.x.mul(uTanHalf).mul(uAspect))).add(uUp.mul(ndc.y.mul(uTanHalf)))
	);
	const radiance = Fn(() => {
		const rd = rayDir;
		const ro = uCamPos;
		const r = length(ro);
		const up = ro.div(r);
		const cz = dot(up, rd);
		const atmHit = raySphere(r, cz, Rt);
		const gnd = raySphere(r, cz, Rg);
		const hitGround = gnd.x.greaterThan(0.0);
		// azimuth from the sun on the camera's horizon plane
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
		const v = select(hitGround, vBelow, vAbove);
		const coord = vec2(toTexel(u, VIEW.w), toTexel(clamp(v, 0.0, 1.0), VIEW.h));
		const col = vec3(0.0).toVar();
		If(atmHit.y.greaterThan(0.0), () => {
			col.assign(texture(viewRT.texture, coord).level(0).xyz);
			If(hitGround, () => {
				const p = ro.add(rd.mul(gnd.x));
				const n = normalize(p);
				// the view ray's transmittance: from the ground back up, over from the entry back up
				const pe = ro.add(rd.mul(max(atmHit.x, 0.0)));
				const re = min(length(pe), Rt);
				const tg = transmittance(float(Rg), dot(n, rd).negate());
				const te = transmittance(re, dot(pe, rd).div(re).negate());
				const tView = min(tg.div(max(te, vec3(1e-6))), vec3(1.0));
				const ground = vec3(0.18, 0.2, 0.12)
					.mul(max(dot(n, uSun), 0.0))
					.mul(sunlight(p, uSun))
					.mul(atm.sunIrradiance * 0.08);
				col.addAssign(tView.mul(ground));
			});
		});
		return col;
	})();

	const pass = (frag: N) => {
		const m = new MeshBasicNodeMaterial();
		m.colorNode = frag();
		m.depthTest = false;
		m.depthWrite = false;
		return { m, q: new QuadMesh(m) };
	};
	const transPass = pass(transFrag);
	const msPass = pass(msFrag);
	const viewPass = pass(viewFrag);
	const run = (renderer: WebGPURenderer, rt: RenderTarget, p: { q: QuadMesh }) => {
		const prev = renderer.getRenderTarget();
		renderer.setRenderTarget(rt);
		p.q.render(renderer);
		renderer.setRenderTarget(prev);
	};

	return {
		uniforms: {
			camPos: uCamPos,
			forward: uForward,
			right: uRight,
			up: uUp,
			sun: uSun,
			tanHalf: uTanHalf,
			aspect: uAspect
		},
		radiance,
		rayDir,
		bake(renderer) {
			run(renderer, transRT, transPass);
			run(renderer, msRT, msPass);
		},
		update(renderer) {
			const r = uCamPos.value.length();
			uViewR.value = r;
			uSunMu.value = uCamPos.value.dot(uSun.value) / r;
			run(renderer, viewRT, viewPass);
		},
		dispose() {
			for (const p of [transPass, msPass, viewPass]) p.m.dispose();
			for (const rt of [transRT, msRT, viewRT]) rt.dispose();
		}
	};
}
