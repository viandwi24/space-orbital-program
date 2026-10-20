/**
 * The analytic atmosphere of ADR 0027 in TSL (plan 261 Phase 4): the single-scattering Rayleigh,
 * Mie and ozone march of `atmosphereGLSL` with its sun-depth table, for the bodies the planet pass
 * does not draw (a moon's air and its sky shell, ADR 0121 point 2). Same maths as the GLSL, read
 * from the same uniform objects (`createAtmosphereUniforms`).
 */
import type { Uniform } from 'three';
import * as TSL from 'three/tsl';
import { OZONE } from '../atmosphere-model.ts';
import { SUN_DEPTH_H, SUN_DEPTH_MU, SUN_DEPTH_SCALE } from '../sun-depth-table.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const { Loop, If, clamp, dot, exp, float, length, max, pow, select, sqrt, texture, vec2, vec3 } = T;

const PI = Math.PI;

export interface Air {
	/** Near and far roots of a ray from radius r0 at cosine mu with a sphere rs; (-1, -1) if missed. */
	raySphere(r0: N, mu: N, rs: N): N;
	/** The air between t0 and t1 along rd from ro, toward the sun l: (in-scatter, transmittance). */
	march(
		ro: N,
		rd: N,
		t0: N,
		t1: N,
		l: N,
		jitter: N,
		power: N,
		samples: number
	): { inscatter: N; transmittance: N };
	/** Top of the air, m from the centre. */
	top: N;
	/** The body's radius (the air's sea level), m. */
	R: N;
}

/**
 * The air read from the atmosphere uniforms `u` (`uR`, `uAtmH`, `uBetaR`, …, `uSunDepthLUT`);
 * `link(name)` makes a TSL uniform that follows one of them each frame.
 */
export function makeAir(u: Record<string, Uniform<unknown>>, link: (name: string) => N): Air {
	const uR = link('uR');
	const uAtmH = link('uAtmH');
	const uBetaR = link('uBetaR');
	const uBetaO = link('uBetaO');
	const uBetaM = link('uBetaM');
	const uHR = link('uHR');
	const uHM = link('uHM');
	const uMieG = link('uMieG');
	const uSunIrr = link('uSunIrr');
	const uSkyBoost = link('uSkyBoost');
	const uMieBoost = link('uMieBoost');
	const lut = u.uSunDepthLUT!.value;

	const raySphere = (r0: N, mu: N, rs: N): N => {
		const b = r0.mul(mu);
		const disc = b.mul(b).sub(r0.mul(r0)).add(rs.mul(rs));
		const s = sqrt(max(disc, 0.0));
		return select(disc.lessThan(0.0), vec2(-1.0), vec2(b.negate().sub(s), b.negate().add(s)));
	};
	const ozone = (h: N): N =>
		max(
			select(
				h.lessThan(OZONE.peak),
				h.sub(OZONE.base).div(OZONE.peak - OZONE.base),
				float(OZONE.top)
					.sub(h)
					.div(OZONE.top - OZONE.peak)
			),
			0.0
		);
	const sunDepth = (p: N, l: N): N => {
		const r = length(p);
		const mu = dot(p, l).div(r);
		const rho = uR.div(r);
		const muH = sqrt(max(float(1.0).sub(rho.mul(rho)), 0.0)).negate();
		const m = clamp(mu.sub(muH).div(float(1.0).sub(muH)), 0.0, 1.0);
		const hn = clamp(r.sub(uR).div(uAtmH), 0.0, 1.0);
		const coord = vec2(sqrt(m), sqrt(hn))
			.mul(vec2(SUN_DEPTH_MU - 1, SUN_DEPTH_H - 1))
			.add(0.5)
			.div(vec2(SUN_DEPTH_MU, SUN_DEPTH_H));
		return select(
			mu.lessThan(muH),
			vec3(-1.0),
			texture(lut, coord).level(0).xyz.mul(SUN_DEPTH_SCALE)
		);
	};
	const extinction = (od: N): N =>
		exp(
			uBetaR
				.mul(od.x)
				.add(vec3(uBetaM.mul(1.1).mul(od.y)))
				.add(uBetaO.mul(od.z))
				.negate()
		);
	const rayleighPhase = (c: N): N => float(3.0 / (16.0 * PI)).mul(c.mul(c).add(1.0));
	const miePhase = (c: N, g: N): N =>
		float(1.0 / (4.0 * PI)).mul(
			float(1.0)
				.sub(g.mul(g))
				.div(pow(g.mul(g).add(1.0).sub(g.mul(2.0).mul(c)), 1.5))
		);

	const march = (ro: N, rd: N, t0: N, t1: N, l: N, jitter: N, power: N, samples: number) => {
		const len = max(t1.sub(t0), 0.0).toVar();
		const cosv = dot(rd, l);
		const pr = rayleighPhase(cosv).toVar();
		const pm = miePhase(cosv, uMieG).toVar();
		const od = vec3(0.0).toVar();
		const insR = vec3(0.0).toVar();
		const insM = vec3(0.0).toVar();
		Loop({ start: 0, end: samples, type: 'int', name: 'ai' }, ({ ai }: { ai: N }) => {
			const uu = float(ai).add(jitter).div(samples);
			const s = t0.add(len.mul(pow(uu, power)));
			const ds = len
				.mul(power)
				.mul(pow(max(uu, 1e-4), power.sub(1.0)))
				.div(samples);
			const p = ro.add(rd.mul(s)).toVar();
			const h = max(length(p).sub(uR), 0.0);
			const dR = exp(h.negate().div(uHR)).mul(ds).toVar();
			const dM = exp(h.negate().div(uHM)).mul(ds).toVar();
			od.addAssign(vec3(dR, dM, ozone(h).mul(ds)));
			const sd = sunDepth(p, l).toVar();
			If(sd.x.greaterThanEqual(0.0), () => {
				const att = extinction(od.add(sd));
				insR.addAssign(att.mul(uBetaR).mul(dR).mul(pr));
				insM.addAssign(att.mul(uBetaM.div(1.1).mul(dM).mul(pm)));
			});
		});
		return {
			inscatter: insR.mul(uSkyBoost).add(insM.mul(uMieBoost)).mul(uSunIrr),
			transmittance: extinction(od)
		};
	};
	return { raySphere, march, top: uR.add(uAtmH), R: uR };
}
