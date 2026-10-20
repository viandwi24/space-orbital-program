/**
 * Plan 261, phase 0 (spike): the same fullscreen sky drawn by today's WebGL renderer (our GLSL,
 * `atmosphereGLSL` and `hashNoiseGLSL` unchanged) and by three's WebGPU renderer (a TSL port of
 * the same functions), so their cost per pixel can be compared on one machine.
 *
 * The sky is the planet pass's atmosphere: a single-scattering Rayleigh + Mie + ozone march of
 * `VIEW_SAMPLES` samples per pixel with one sun-depth table fetch each (ADR 0027, plan 039), over a
 * lit ground. `noiseOctaves` adds that many octaves of the pcg3d hash noise per pixel, standing in
 * for the clouds' cost and testing the integer path of WGSL. Development only; not used by the game.
 */
import {
	DataTexture,
	LinearSRGBColorSpace,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	Vector3,
	WebGLRenderer,
	type IUniform
} from 'three';
import { atmosphereFor, OZONE, type Atmosphere } from '../atmosphere-model.ts';
import { createAtmosphereUniforms } from '../planet.ts';
import { atmosphereGLSL, hashNoiseGLSL } from '../shaders/atmosphere.glsl.ts';
import { SUN_DEPTH_H, SUN_DEPTH_MU, SUN_DEPTH_SCALE } from '../sun-depth-table.ts';

/**
 * `webgpu-lut` is phase 6's sky (lut-sky.ts: Hillaire's tables, multiple scattering) on the WebGPU
 * renderer; the `-fallback` ones run the WebGPU renderer on its WebGL2 backend.
 */
export type SpikeBackend =
	'webgl' | 'webgpu' | 'webgpu-fallback' | 'webgpu-lut' | 'webgpu-lut-fallback';

export interface SpikeView {
	/** Camera height above the surface, m. */
	altitude: number;
	/** Sun elevation above the horizon, rad. */
	sunElevation: number;
	/** Camera pitch above the horizon, rad. */
	pitch: number;
}

export interface SkySpike {
	/** The backend in use: `webgpu-fallback` is the WebGPU renderer on its WebGL2 backend. */
	readonly backend: SpikeBackend | 'webgpu-requested-but-webgl2';
	/** The one-off table bake (LUT sky only), ms. */
	readonly bakeMs?: number;
	setSize(width: number, height: number, pixelRatio: number): void;
	setView(view: SpikeView): void;
	/** Draws `frames` frames back to back and waits for the GPU; returns ms per frame. */
	benchmark(frames: number): Promise<number>;
	/** One frame, for looking at it. */
	draw(): void;
	dispose(): void;
}

export interface SpikeOptions {
	backend: SpikeBackend;
	/** Hash-noise octaves per pixel (0 = the sky alone). */
	noiseOctaves: number;
	/** Atmosphere samples per pixel (the `high` preset: 12). */
	viewSamples?: number;
}

/** The home planet's air, as the renderer builds it (600 km, 70 km of atmosphere). */
export const SPIKE_ATMOSPHERE: Atmosphere = atmosphereFor(600_000, 70_000);
const FOV = (60 * Math.PI) / 180;
/** The LUT sky's exposure against the march's tone map (see lutColour). */
const LUT_EXPOSURE = 1.6;

/** Camera basis for a view: position above the north pole, looking along +X tilted by pitch. */
function basis(atm: Atmosphere, v: SpikeView) {
	const pos = new Vector3(0, atm.radius + v.altitude, 0);
	const forward = new Vector3(Math.cos(v.pitch), Math.sin(v.pitch), 0).normalize();
	const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
	const up = new Vector3().crossVectors(right, forward).normalize();
	const sun = new Vector3(Math.cos(v.sunElevation), Math.sin(v.sunElevation), 0.35).normalize();
	return { pos, forward, right, up, sun };
}

// ---------------------------------------------------------------------------------------------
// WebGL: today's GLSL, unchanged
// ---------------------------------------------------------------------------------------------

const fragmentGLSL = (octaves: number) => /* glsl */ `
precision highp float;
precision highp int;
${hashNoiseGLSL}
${atmosphereGLSL}
uniform vec3 uCamPos;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uSun;
uniform float uTanHalf;
uniform float uAspect;
varying vec2 vUv;
void main() {
	vec2 ndc = vUv * 2.0 - 1.0;
	vec3 rd = normalize(uForward + uRight * ndc.x * uTanHalf * uAspect + uUp * ndc.y * uTanHalf);
	vec3 ro = uCamPos;
	float r0 = length(ro);
	float mu = dot(ro, rd) / r0;
	vec2 atm = raySphere(r0, mu, uR + uAtmH);
	vec2 gnd = raySphere(r0, mu, uR);
	vec3 col = vec3(0.0);
	if (atm.y > 0.0) {
		float t0 = max(atm.x, 0.0);
		bool hit = gnd.x > 0.0;
		float t1 = hit ? gnd.x : atm.y;
		Scatter s = marchAtmosphere(ro, rd, t0, t1, uSun, 0.5, 1e30, 1e30, 1.0);
		col = s.inscatter;
		if (hit) {
			vec3 p = ro + rd * t1;
			vec3 n = normalize(p);
			vec3 ground = vec3(0.18, 0.2, 0.12) * max(dot(n, uSun), 0.0) * sunTransmittance(p, uSun) * uSunIrr * 0.08;
			col += s.transmittance * ground;
		}
	}
	float acc = 0.0;
	vec3 q = rd * 40.0;
	for (int k = 0; k < ${octaves}; k++) {
		acc += noiseF(q) / float(k + 1);
		q *= 2.03;
	}
	col += vec3(acc * 1e-4);
	gl_FragColor = vec4(1.0 - exp(-col * 1.4), 1.0);
}
`;

const vertexGLSL = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function webglSpike(canvas: HTMLCanvasElement, options: SpikeOptions): SkySpike {
	const atm = SPIKE_ATMOSPHERE;
	const renderer = new WebGLRenderer({
		canvas,
		antialias: false,
		powerPreference: 'high-performance'
	});
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const scene = new Scene();
	const uniforms: Record<string, IUniform> = {
		...(createAtmosphereUniforms(atm) as unknown as Record<string, IUniform>),
		uCamPos: { value: new Vector3() },
		uForward: { value: new Vector3() },
		uRight: { value: new Vector3() },
		uUp: { value: new Vector3() },
		uSun: { value: new Vector3() },
		uTanHalf: { value: Math.tan(FOV / 2) },
		uAspect: { value: 1 }
	};
	const material = new ShaderMaterial({
		uniforms,
		vertexShader: vertexGLSL,
		fragmentShader: fragmentGLSL(options.noiseOctaves),
		defines: { VIEW_SAMPLES: options.viewSamples ?? 12 },
		depthTest: false,
		depthWrite: false
	});
	scene.add(new Mesh(new PlaneGeometry(2, 2), material));
	const gl = renderer.getContext();
	const pixel = new Uint8Array(4);
	return {
		backend: 'webgl',
		setSize(w, h, ratio) {
			renderer.setPixelRatio(ratio);
			renderer.setSize(w, h, false);
			uniforms.uAspect!.value = w / h;
		},
		setView(v) {
			const b = basis(atm, v);
			uniforms.uCamPos!.value.copy(b.pos);
			uniforms.uForward!.value.copy(b.forward);
			uniforms.uRight!.value.copy(b.right);
			uniforms.uUp!.value.copy(b.up);
			uniforms.uSun!.value.copy(b.sun);
		},
		async benchmark(frames) {
			renderer.render(scene, camera);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
			const t0 = performance.now();
			for (let i = 0; i < frames; i++) renderer.render(scene, camera);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
			return (performance.now() - t0) / frames;
		},
		draw: () => renderer.render(scene, camera),
		dispose() {
			material.dispose();
			renderer.dispose();
		}
	};
}

// ---------------------------------------------------------------------------------------------
// WebGPU: the same functions in TSL
// ---------------------------------------------------------------------------------------------

async function webgpuSpike(canvas: HTMLCanvasElement, options: SpikeOptions): Promise<SkySpike> {
	const { WebGPURenderer, MeshBasicNodeMaterial, QuadMesh } = await import('three/webgpu');
	const T = await import('three/tsl');
	const {
		Fn,
		Loop,
		If,
		float,
		int,
		vec2,
		vec3,
		vec4,
		uvec3,
		uniform,
		texture,
		uv,
		exp,
		pow,
		sqrt,
		max,
		clamp,
		dot,
		length,
		normalize,
		mix,
		floor,
		select
	} = T;
	const atm = SPIKE_ATMOSPHERE;
	const samples = options.viewSamples ?? 12;
	const renderer = new WebGPURenderer({
		canvas,
		antialias: false,
		powerPreference: 'high-performance',
		forceWebGL: options.backend.endsWith('fallback')
	});
	await renderer.init();
	// our GLSL writes linear values straight to the canvas: no sRGB conversion here either
	renderer.outputColorSpace = LinearSRGBColorSpace;
	const onWebGPU = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;

	const glslUniforms = createAtmosphereUniforms(atm);
	const lut = glslUniforms.uSunDepthLUT.value as DataTexture;
	const uR = uniform(atm.radius);
	const uAtmH = uniform(atm.height);
	const uBetaR = uniform(new Vector3(...atm.betaRayleigh));
	const uBetaO = uniform(new Vector3(...atm.betaOzone));
	const uBetaM = uniform(atm.betaMie);
	const uHR = uniform(atm.rayleighHeight);
	const uHM = uniform(atm.mieHeight);
	const uMieG = uniform(atm.mieG);
	const uSunIrr = uniform(atm.sunIrradiance);
	const uSkyBoost = uniform(atm.skyBoost);
	const uMieBoost = uniform(atm.mieBoost);
	const uCamPos = uniform(new Vector3());
	const uForward = uniform(new Vector3());
	const uRight = uniform(new Vector3());
	const uUp = uniform(new Vector3());
	const uSun = uniform(new Vector3());
	const uTanHalf = uniform(Math.tan(FOV / 2));
	const uAspect = uniform(1);
	const kPI = 3.14159265359;

	// one fn per GLSL function, same maths (atmosphere.glsl.ts)
	const raySphere = Fn(([r0, mu, rs]: any[]) => {
		const b = r0.mul(mu);
		const disc = b.mul(b).sub(r0.mul(r0)).add(rs.mul(rs));
		const s = sqrt(max(disc, 0.0));
		return select(disc.lessThan(0.0), vec2(-1.0), vec2(b.negate().sub(s), b.negate().add(s)));
	});
	const ozone = Fn(([h]: any[]) => {
		const rise = h.sub(OZONE.base).div(OZONE.peak - OZONE.base);
		const fall = float(OZONE.top)
			.sub(h)
			.div(OZONE.top - OZONE.peak);
		return max(select(h.lessThan(OZONE.peak), rise, fall), 0.0);
	});
	const sunDepth = Fn(([p, l]: any[]) => {
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
		const od = texture(lut, coord).xyz.mul(SUN_DEPTH_SCALE);
		return select(mu.lessThan(muH), vec3(-1.0), od);
	});
	const extinction = Fn(([od]: any[]) =>
		exp(
			uBetaR
				.mul(od.x)
				.add(vec3(uBetaM.mul(1.1).mul(od.y)))
				.add(uBetaO.mul(od.z))
				.negate()
		)
	);
	const rayleighPhase = (c: any) => float(3.0 / (16.0 * kPI)).mul(c.mul(c).add(1.0));
	const miePhase = (c: any, g: any) =>
		float(1.0 / (4.0 * kPI)).mul(
			float(1.0)
				.sub(g.mul(g))
				.div(pow(g.mul(g).add(1.0).sub(g.mul(2.0).mul(c)), 1.5))
		);

	// pcg3d hash value noise (hashNoiseGLSL)
	const pcg3d = Fn(([v0]: any[]) => {
		const v = v0.mul(1664525).add(1013904223).toVar();
		v.x.addAssign(v.y.mul(v.z));
		v.y.addAssign(v.z.mul(v.x));
		v.z.addAssign(v.x.mul(v.y));
		v.bitXorAssign(v.shiftRight(uvec3(16)));
		v.x.addAssign(v.y.mul(v.z));
		v.y.addAssign(v.z.mul(v.x));
		v.z.addAssign(v.x.mul(v.y));
		return v;
	});
	const hash13 = (c: any) =>
		pcg3d(uvec3(c))
			.x.toFloat()
			.mul(1.0 / 4294967295.0);
	const noiseF = Fn(([p]: any[]) => {
		const fl = floor(p);
		const f0 = p.sub(fl);
		const f = f0
			.mul(f0)
			.mul(f0)
			.mul(f0.mul(f0.mul(6.0).sub(15.0)).add(10.0));
		const c = (T.ivec3 as (v: unknown) => any)(fl);
		const I = (x: number, y: number, z: number) => hash13(c.add(T.ivec3(x, y, z)));
		const a = mix(I(0, 0, 0), I(1, 0, 0), f.x);
		const b = mix(I(0, 1, 0), I(1, 1, 0), f.x);
		const cc = mix(I(0, 0, 1), I(1, 0, 1), f.x);
		const d = mix(I(0, 1, 1), I(1, 1, 1), f.x);
		return mix(mix(a, b, f.y), mix(cc, d, f.y), f.z);
	});

	const sky = Fn(() => {
		// WebGPU's uv runs top-down; flip it so both backends draw the same frame
		const ndc = vec2(uv().x, float(1.0).sub(uv().y)).mul(2.0).sub(1.0);
		const rd = normalize(
			uForward.add(uRight.mul(ndc.x.mul(uTanHalf).mul(uAspect))).add(uUp.mul(ndc.y.mul(uTanHalf)))
		);
		const ro = uCamPos;
		const r0 = length(ro);
		const mu = dot(ro, rd).div(r0);
		const atmHit = raySphere(r0, mu, uR.add(uAtmH));
		const gnd = raySphere(r0, mu, uR);
		const col = vec3(0.0).toVar();
		If(atmHit.y.greaterThan(0.0), () => {
			const t0 = max(atmHit.x, 0.0);
			const hit = gnd.x.greaterThan(0.0);
			const t1 = select(hit, gnd.x, atmHit.y);
			const len = max(t1.sub(t0), 0.0);
			const cosv = dot(rd, uSun);
			const pr = rayleighPhase(cosv);
			const pm = miePhase(cosv, uMieG);
			const od = vec3(0.0).toVar();
			const insR = vec3(0.0).toVar();
			const insM = vec3(0.0).toVar();
			Loop(samples, ({ i }: { i: any }) => {
				const u = float(i).add(0.5).div(samples);
				const s = t0.add(len.mul(u));
				const ds = len.div(samples);
				const p = ro.add(rd.mul(s));
				const h = max(length(p).sub(uR), 0.0);
				const dR = exp(h.negate().div(uHR)).mul(ds);
				const dM = exp(h.negate().div(uHM)).mul(ds);
				od.addAssign(vec3(dR, dM, ozone(h).mul(ds)));
				const sd = sunDepth(p, uSun);
				If(sd.x.greaterThanEqual(0.0), () => {
					const att = extinction(od.add(sd));
					insR.addAssign(att.mul(uBetaR).mul(dR).mul(pr));
					insM.addAssign(att.mul(uBetaM.div(1.1).mul(dM).mul(pm)));
				});
			});
			col.assign(insR.mul(uSkyBoost).add(insM.mul(uMieBoost)).mul(uSunIrr));
			If(hit, () => {
				const p = ro.add(rd.mul(t1));
				const n = normalize(p);
				const sd = sunDepth(p, uSun);
				const trans = select(sd.x.lessThan(0.0), vec3(0.0), extinction(sd));
				const ground = vec3(0.18, 0.2, 0.12)
					.mul(max(dot(n, uSun), 0.0))
					.mul(trans)
					.mul(uSunIrr)
					.mul(0.08);
				col.addAssign(extinction(od).mul(ground));
			});
		});
		const acc = float(0.0).toVar();
		const q = rd.mul(40.0).toVar();
		Loop(options.noiseOctaves, ({ i }: { i: any }) => {
			acc.addAssign(noiseF(q).div(float(i).add(1.0)));
			q.mulAssign(2.03);
		});
		col.addAssign(vec3(acc.mul(1e-4)));
		return vec4(float(1.0).sub(exp(col.mul(-1.4))), 1.0);
	});

	const lutMode = options.backend.startsWith('webgpu-lut');
	const lutSky = lutMode ? (await import('./lut-sky.ts')).createLutSky(atm) : null;
	const lutColour = Fn(() => {
		const col = vec3(lutSky!.radiance).toVar();
		const acc = float(0.0).toVar();
		const q = lutSky!.rayDir.mul(40.0).toVar();
		Loop(options.noiseOctaves, ({ i }: { i: any }) => {
			acc.addAssign(noiseF(q).div(float(i).add(1.0)));
			q.mulAssign(2.03);
		});
		col.addAssign(vec3(acc.mul(1e-4)));
		// the march's 2.2 boost stood in for multiple scattering and lit the whole sky; the tables
		// compute it, so only an exposure brings the brightness to the march's
		return vec4(float(1.0).sub(exp(col.mul(-1.4 * LUT_EXPOSURE))), 1.0);
	});

	const material = new MeshBasicNodeMaterial();
	material.colorNode = lutSky ? lutColour() : sky();
	material.depthTest = false;
	material.depthWrite = false;
	const quad = new QuadMesh(material);
	void int;

	const wait = async (): Promise<void> => {
		const backend = renderer.backend as {
			device?: GPUDevice;
			gl?: WebGL2RenderingContext;
		};
		if (backend.device) await backend.device.queue.onSubmittedWorkDone();
		else if (backend.gl) {
			// read the canvas, not a half-float table left bound by a bake, then put three's binding back
			const gl = backend.gl;
			const bound = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, bound);
		}
	};
	let bakeMs: number | undefined;
	if (lutSky) {
		await wait();
		const t0 = performance.now();
		lutSky.bake(renderer);
		await wait();
		bakeMs = Math.round((performance.now() - t0) * 10) / 10;
	}
	const frame = () => {
		lutSky?.update(renderer);
		quad.render(renderer);
	};
	const fallback = options.backend.endsWith('fallback');
	return {
		backend: onWebGPU || fallback ? options.backend : 'webgpu-requested-but-webgl2',
		bakeMs,
		setSize(w, h, ratio) {
			renderer.setPixelRatio(ratio);
			renderer.setSize(w, h, false);
			uAspect.value = w / h;
			if (lutSky) {
				lutSky.uniforms.aspect.value = w / h;
				lutSky.uniforms.tanHalf.value = Math.tan(FOV / 2);
			}
		},
		setView(v) {
			const b = basis(atm, v);
			uCamPos.value.copy(b.pos);
			uForward.value.copy(b.forward);
			uRight.value.copy(b.right);
			uUp.value.copy(b.up);
			uSun.value.copy(b.sun);
			if (lutSky) {
				const u = lutSky.uniforms;
				u.camPos.value.copy(b.pos);
				u.forward.value.copy(b.forward);
				u.right.value.copy(b.right);
				u.up.value.copy(b.up);
				u.sun.value.copy(b.sun);
			}
		},
		async benchmark(frames) {
			frame();
			await wait();
			const t0 = performance.now();
			for (let i = 0; i < frames; i++) frame();
			await wait();
			return (performance.now() - t0) / frames;
		},
		draw: frame,
		dispose() {
			material.dispose();
			lutSky?.dispose();
			renderer.dispose();
		}
	};
}

/** The spike for a backend (WebGPU ones resolve after the renderer's async init). */
export async function createSkySpike(
	canvas: HTMLCanvasElement,
	options: SpikeOptions
): Promise<SkySpike> {
	return options.backend === 'webgl' ? webglSpike(canvas, options) : webgpuSpike(canvas, options);
}
