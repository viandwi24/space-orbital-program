/**
 * The clouds in TSL (plan 261 Phase 2, slice 2c): the cumulus coverage field of ADR 0037
 * (`cloudFieldGLSL`), the cumulus slab's density and lighting (plan 037, ADR 0059, the twin of
 * `cloud-volume.ts`), the cirrus streaks, and the cloud map that the ground's shadows and the light
 * shafts read (plan 054, ADR 0070; `cloudMapFragment`). Same noise, same constants as the GLSL.
 */
import { LinearFilter, RenderTarget, RepeatWrapping, UnsignedByteType } from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import {
	CLOUD_FILL,
	CLOUD_GAIN_CAP,
	CLOUD_PHASE,
	CLOUD_SIGMA,
	CLOUD_SUN_BULK,
	CLOUD_SUN_MU_MIN,
	CLOUD_THICKNESS,
	EROSION_FADE,
	EROSION_WEIGHTS
} from '../cloud-volume.ts';
import { CLOUD_MAP_H, CLOUD_MAP_OCTAVES, CLOUD_MAP_W } from '../light-shaft.ts';
import { fbmF, noiseF, noiseF3 } from './noise.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	If,
	asin,
	atan,
	clamp,
	cos,
	exp,
	float,
	max,
	min,
	mix,
	pow,
	sin,
	smoothstep,
	texture,
	uniform,
	uv,
	vec2,
	vec3,
	vec4
} = T;

const PI = Math.PI;

/** Rotation about the body's axis (the clouds' drift). */
export const rotY = (v: N, a: N): N => {
	const c = cos(a);
	const s = sin(a);
	return vec3(c.mul(v.x).add(s.mul(v.z)), v.y, s.negate().mul(v.x).add(c.mul(v.z)));
};

/** Henyey-Greenstein phase with a constant asymmetry g. */
export const hgPhase = (c: N, g: number): N =>
	float((1 - g * g) / (4 * PI)).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));

/**
 * `cloudDensityQ`: cumulus density at p = (drifted body-fixed direction) * (radius / 16 km); `full`
 * adds the fine billows; fp is the pixel's footprint on the shell, m.
 */
export const cloudDensityQ = (p0: N, full: boolean, fp: N, octaves: number, cover: N): N => {
	const p = p0.add(noiseF3(p0.mul(0.45).add(3.7)).sub(0.5).mul(0.7)).toVar();
	const n = fbmF(p, octaves);
	const puffW = smoothstep(500.0, 1500.0, fp).oneMinus();
	const puff = float(0.5).toVar();
	If(puffW.greaterThan(0.001), () => {
		puff.assign(mix(0.5, smoothstep(0.3, 0.7, fbmF(p.mul(11.0).add(21.0), 2)), puffW));
	});
	const t0 = mix(0.66, 0.4, cover);
	const body = smoothstep(
		t0,
		t0.add(mix(0.2, 0.28, smoothstep(300.0, 3000.0, fp))),
		n.add(puff.sub(0.5).mul(0.3))
	).toVar();
	const dens = body.mul(puff.mul(0.75).add(0.55)).toVar();
	if (full) {
		const billowW = smoothstep(120.0, 450.0, fp).oneMinus();
		If(billowW.greaterThan(0.001), () => {
			const billow = mix(0.5, smoothstep(0.28, 0.72, fbmF(p.mul(48.0).add(5.0), 2)), billowW);
			dens.mulAssign(billow.mul(0.65).add(0.65));
		});
	}
	return clamp(dens.sub(body.oneMinus().mul(0.06)), 0.0, 1.0);
};

/** Cirrus: thin streaks along the wind, high above the cumulus. */
export const cirrusDensity = (dirBF: N, angle: N, radius: number): N => {
	const p = rotY(dirBF, angle.mul(1.7).add(1.3))
		.mul(radius / 26000)
		.toVar();
	const mask = noiseF(p.mul(vec3(0.18, 0.5, 0.5)).add(4.0)).toVar();
	const out = float(0.0).toVar();
	If(mask.greaterThanEqual(0.3), () => {
		const p2 = p.add(noiseF3(p.mul(0.6).add(7.1)).sub(0.5).mul(0.5));
		const q = p2.mul(vec3(0.25, 1.0, 1.0)).toVar();
		const n = fbmF(q, 2);
		const streak = fbmF(q.mul(vec3(2.2, 8.0, 8.0)).add(11.0), 2);
		const c = smoothstep(0.3, 0.62, mask).mul(smoothstep(0.42, 0.7, n));
		out.assign(clamp(c.mul(streak.add(0.2)).mul(0.42), 0.0, 1.0));
	});
	return out;
};

/** The slab's vertical profile at relative height h for a coverage. */
export const cloudProfile = (h: N, cover: N): N => {
	const top = clamp(cover, 0.0, 1.0).mul(0.6).add(0.4);
	return smoothstep(0.0, 0.12, h).mul(smoothstep(top.mul(0.55), top, h).oneMinus());
};

/** Dual-lobe phase through three octaves of the multiple-scattering stand-in; tau toward the sun. */
const cloudMultiScatter = (tau: N, c: N): N => {
	let sum: N = float(0.0);
	let a = 1;
	let b = 1;
	let k = 1;
	for (let n = 0; n < 3; n++) {
		const ph = hgPhase(c, CLOUD_PHASE.forward * b)
			.mul(CLOUD_PHASE.weight)
			.add(hgPhase(c, CLOUD_PHASE.back * b).mul(1 - CLOUD_PHASE.weight));
		sum = sum.add(ph.mul(exp(tau.mul(-k))).mul(a));
		a *= 0.5;
		b *= 0.5;
		k *= 0.5;
	}
	return sum;
};
export const cloudFill = (tau: N, h: N): N =>
	float(CLOUD_FILL)
		.mul(clamp(h, 0.0, 1.0).mul(0.3).add(0.7))
		.mul(exp(tau.mul(-0.35)).mul(0.4).add(0.6));
export const cloudScatterGain = (tau: N, c: N): N =>
	min(cloudMultiScatter(tau, c).mul(4 * PI), CLOUD_GAIN_CAP);
export const cloudBillowShade = (e: N): N => smoothstep(0.2, 0.8, e).mul(0.4).add(0.6);
export const cloudPowder = (localTau: N, c: N): N => {
	const p = float(1.0).sub(exp(localTau.mul(-2.0)));
	return float(1.0).add(
		p
			.sub(1.0)
			.mul(0.6)
			.mul(float(0.5).sub(c.mul(0.5)))
	);
};
export const cloudSunDepth = (h: N, cover: N, mu: N): N => {
	const m = max(mu, CLOUD_SUN_MU_MIN);
	let sum: N = float(0.0);
	for (let i = 1; i <= 3; i++)
		sum = sum.add(
			cloudProfile(
				h.add(
					float(1.0)
						.sub(h)
						.mul(i / 3.5)
				),
				cover
			)
		);
	return float(CLOUD_SUN_BULK * CLOUD_SIGMA)
		.mul(cover)
		.mul(float(1.0).sub(h).mul(CLOUD_THICKNESS))
		.mul(sum)
		.div(m.mul(3.0));
};

/** Billow erosion: up to `oct` octaves (cells of 210, 70 and 25 m), faded where a pixel is wider. */
export const cloudErosion = (dirBF: N, fp: N, oct: number, angle: N, radius: number): N => {
	const q = rotY(dirBF, angle)
		.mul(radius / 16000)
		.toVar();
	const fade = (i: number): N =>
		smoothstep(EROSION_FADE[i]![0], EROSION_FADE[i]![1], fp).oneMinus();
	let e: N = mix(0.5, noiseF(q.mul(75.0).add(5.0)), fade(0)).mul(EROSION_WEIGHTS[0]);
	const n1 = float(0.5).toVar();
	const n2 = float(0.5).toVar();
	if (oct > 1)
		If(fade(1).greaterThan(0.001), () => {
			n1.assign(mix(0.5, noiseF(q.mul(220.0).add(17.0)), fade(1)));
		});
	if (oct > 2)
		If(fade(2).greaterThan(0.001), () => {
			n2.assign(mix(0.5, noiseF(q.mul(610.0).add(29.0)), fade(2)));
		});
	e = e.add(n1.mul(EROSION_WEIGHTS[1])).add(n2.mul(EROSION_WEIGHTS[2]));
	return clamp(e.sub(0.5).mul(2.0).add(0.5), 0.0, 1.0);
};

export const cloudSlabDensity = (cover: N, h: N, e: N): N =>
	clamp(
		cloudProfile(h.add(e.sub(0.5).mul(0.7)), cover)
			.mul(cover)
			.mul(1.2)
			.sub(e.oneMinus().mul(0.75)),
		0.0,
		1.0
	);

/**
 * The cloud map: equirectangular, red the coverage the light shafts read, green the density the
 * ground's cloud shadows read. Baked when the cover changes.
 */
export class CloudMapTSL {
	readonly target = new RenderTarget(CLOUD_MAP_W, CLOUD_MAP_H, {
		type: UnsignedByteType,
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		wrapS: RepeatWrapping,
		depthBuffer: false,
		generateMipmaps: false
	});
	private readonly cover = uniform(0.42);
	private baked = -1;
	// named for the load report (plan 370)
	private readonly material = Object.assign(new MeshBasicNodeMaterial(), { name: 'cloud-map-bake' });
	private readonly quad: QuadMesh;

	constructor(radius: number) {
		this.material.fragmentNode = Fn(() => {
			const lon = uv()
				.x.sub(0.5)
				.mul(2 * PI);
			const lat = uv().y.sub(0.5).mul(PI);
			const dir = vec3(cos(lat).mul(cos(lon)), sin(lat), cos(lat).mul(sin(lon)));
			const d = cloudDensityQ(
				dir.mul(radius / 16000),
				false,
				float(2000.0),
				CLOUD_MAP_OCTAVES,
				this.cover
			);
			return vec4(smoothstep(0.08, 0.55, d), d, 0.0, 1.0);
		})();
		this.material.depthTest = false;
		this.material.depthWrite = false;
		this.quad = new QuadMesh(this.material);
	}

	/** Bakes the map when the cover has changed since the last bake. */
	update(renderer: WebGPURenderer, cover: number): void {
		if (this.baked >= 0 && Math.abs(cover - this.baked) < 1e-4) return;
		this.cover.value = cover;
		const prev = renderer.getRenderTarget();
		renderer.setRenderTarget(this.target);
		this.quad.render(renderer);
		renderer.setRenderTarget(prev);
		this.baked = cover;
	}

	/** (coverage, density) at a drifted body-fixed direction. */
	at(rq: N): N {
		return texture(
			this.target.texture,
			vec2(
				atan(rq.z, rq.x)
					.mul(1 / (2 * PI))
					.add(0.5),
				asin(clamp(rq.y, -1.0, 1.0))
					.mul(1 / PI)
					.add(0.5)
			)
		).level(0).xy;
	}

	dispose(): void {
		this.target.dispose();
		this.material.dispose();
	}
}
