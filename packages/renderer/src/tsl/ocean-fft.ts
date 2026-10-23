/**
 * The sea's 64² FFT on the GPU (plan 401, ADR 0330 point 3): the Phillips spectrum of
 * `ocean-fft.ts` evolved in time and inverse transformed in three fragment passes (the pattern of the
 * sky tables, `lut-sky.ts`): two row passes sum over kx for every (x, ky) into float targets
 * (height and the x slope, then the z slope), a column pass sums over ky and writes the real field
 * (height, slope x, slope z, foam) into a tiling half-float texture the planet pass samples. A direct
 * separable transform: 64³ × 3 terms, a fraction of a millisecond. The foam is the slope's steepness
 * (not the displacement Jacobian: there is no displacement field).
 */
import {
	DataTexture,
	FloatType,
	HalfFloatType,
	LinearFilter,
	NearestFilter,
	RGBAFormat,
	RenderTarget,
	RepeatWrapping,
	type Texture
} from 'three';
import * as TSL from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import { WAVE_GRAVITY } from '../water-model.ts';
import { initialSpectrum, normalizeSlope, type OceanParams } from '../ocean-fft.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const {
	Fn,
	Loop,
	cos,
	float,
	fract,
	int,
	mod,
	select,
	sin,
	smoothstep,
	sqrt,
	texture,
	uniform,
	uv,
	vec2,
	vec4,
	max,
	length
} = T;

/** The grid and the tile it covers: 64² over 200 m (wavelengths from 3 m to 200 m). */
export const OCEAN_FFT = { n: 64, size: 200, slope: 0.16 } as const;

export const OCEAN_PARAMS: OceanParams = {
	n: OCEAN_FFT.n,
	size: OCEAN_FFT.size,
	windSpeed: 12,
	windDirection: 0.35,
	seed: 20_241_024
};

const TAU = Math.PI * 2;

export interface OceanFft {
	/** The tiling (height, slope x, slope z, foam) texture; its tile is `OCEAN_FFT.size` metres. */
	texture: Texture;
	/** Re-runs the passes for `time` seconds. */
	update(renderer: WebGPURenderer, time: number): void;
	dispose(): void;
}

export function createOceanFft(): OceanFft {
	const n = OCEAN_FFT.n;
	const h0 = normalizeSlope(initialSpectrum(OCEAN_PARAMS), OCEAN_PARAMS, OCEAN_FFT.slope);
	const data = new Float32Array(n * n * 4);
	for (let i = 0; i < n * n; i++) {
		data[i * 4] = h0.re[i]!;
		data[i * 4 + 1] = h0.im[i]!;
	}
	const spectrum = new DataTexture(data, n, n, RGBAFormat, FloatType);
	spectrum.minFilter = NearestFilter;
	spectrum.magFilter = NearestFilter;
	spectrum.needsUpdate = true;

	const mid = (): RenderTarget =>
		new RenderTarget(n, n, {
			type: FloatType,
			magFilter: NearestFilter,
			minFilter: NearestFilter,
			depthBuffer: false,
			generateMipmaps: false
		});
	const rowA = mid();
	const rowB = mid();
	const out = new RenderTarget(n, n, {
		type: HalfFloatType,
		magFilter: LinearFilter,
		minFilter: LinearFilter,
		wrapS: RepeatWrapping,
		wrapT: RepeatWrapping,
		depthBuffer: false,
		generateMipmaps: false
	});

	const uTime = uniform(0);
	const kOf = (i: N): N =>
		select(i.lessThan(n / 2), float(i), float(i).sub(n)).mul(TAU / OCEAN_FFT.size);
	const at = (tex: Texture, x: N, y: N): N =>
		texture(tex, vec2(float(x).add(0.5).div(n), float(y).add(0.5).div(n))).level(0);
	/** H(kx, ky, t) as (re, im). */
	const evolved = (kx: N, ky: N): N => {
		const k = sqrt(
			kOf(kx)
				.mul(kOf(kx))
				.add(kOf(ky).mul(kOf(ky)))
		);
		const w = sqrt(k.mul(WAVE_GRAVITY)).mul(uTime);
		const c = cos(w);
		const s = sin(w);
		const a = at(spectrum, kx, ky);
		const b = at(spectrum, int(n).sub(kx).mod(n), int(n).sub(ky).mod(n));
		// h0(k) e^{iw} + conj(h0(-k)) e^{-iw}
		const re = a.x
			.mul(c)
			.sub(a.y.mul(s))
			.add(b.x.mul(c).sub(b.y.mul(s)));
		const im = a.x
			.mul(s)
			.add(a.y.mul(c))
			.sub(b.x.mul(s).add(b.y.mul(c)));
		return vec2(re, im);
	};
	/** The texel (x, j) of a pass: output position x, spectrum row j. */
	const texel = (): { x: N; j: N } => {
		const px = uv().mul(n).floor();
		return { x: int(px.x), j: int(px.y) };
	};

	// row passes: sum over kx of H e^{i 2π kx x / n}, with the slope factors i kx and i ky
	const rows = (second: boolean) =>
		Fn(() => {
			const { x, j } = texel();
			const ky = kOf(j);
			const h = vec2(0.0).toVar();
			const sx = vec2(0.0).toVar();
			Loop({ start: 0, end: n, type: 'int', name: 'i' }, ({ i }: { i: N }) => {
				const H = evolved(i, j);
				const th = fract(float(i.mul(x).mod(n)).div(n)).mul(TAU);
				const e = vec2(cos(th), sin(th));
				const he = vec2(H.x.mul(e.x).sub(H.y.mul(e.y)), H.x.mul(e.y).add(H.y.mul(e.x)));
				h.addAssign(he);
				// i kx (a + ib) = -kx b + i kx a
				sx.addAssign(vec2(he.y.negate().mul(kOf(i)), he.x.mul(kOf(i))));
			});
			if (!second) return vec4(h.x, h.y, sx.x, sx.y);
			// z slope: i ky (a + ib)
			return vec4(h.y.negate().mul(ky), h.x.mul(ky), 0.0, 0.0);
		})();
	// column pass: sum over ky of F(x, ky) e^{i 2π ky y / n}, the real part
	const column = Fn(() => {
		const { x, j: y } = texel();
		const hv = float(0.0).toVar();
		const sxv = float(0.0).toVar();
		const szv = float(0.0).toVar();
		Loop({ start: 0, end: n, type: 'int', name: 'j' }, ({ j }: { j: N }) => {
			const th = fract(float(j.mul(y).mod(n)).div(n)).mul(TAU);
			const c = cos(th);
			const s = sin(th);
			const a = at(rowA.texture, x, j);
			const b = at(rowB.texture, x, j);
			hv.addAssign(a.x.mul(c).sub(a.y.mul(s)));
			sxv.addAssign(a.z.mul(c).sub(a.w.mul(s)));
			szv.addAssign(b.x.mul(c).sub(b.y.mul(s)));
		});
		const steep = length(vec2(sxv, szv));
		const foam = smoothstep(0.28, 0.6, steep);
		return vec4(hv, sxv, szv, foam);
	})();

	const pass = (frag: N, name: string) => {
		const m = new MeshBasicNodeMaterial();
		m.name = name;
		m.fragmentNode = frag;
		m.depthTest = false;
		m.depthWrite = false;
		return { m, q: new QuadMesh(m) };
	};
	// the row passes read the spectrum, the column pass reads the two row targets
	const passA = pass(rows(false), 'ocean-fft-rows-a');
	const passB = pass(rows(true), 'ocean-fft-rows-b');
	const passC = pass(column, 'ocean-fft-column');
	const run = (renderer: WebGPURenderer, rt: RenderTarget, p: { q: QuadMesh }): void => {
		const prev = renderer.getRenderTarget();
		renderer.setRenderTarget(rt);
		p.q.render(renderer);
		renderer.setRenderTarget(prev);
	};
	void max;
	return {
		texture: out.texture,
		update(renderer, time) {
			uTime.value = time;
			run(renderer, rowA, passA);
			run(renderer, rowB, passB);
			run(renderer, out, passC);
		},
		dispose() {
			for (const p of [passA, passB, passC]) p.m.dispose();
			for (const rt of [rowA, rowB, out]) rt.dispose();
			spectrum.dispose();
		}
	};
}
