/**
 * The water of the planet pass in TSL (plan 261 Phase 2, slice 2c): deep-water waves
 * (`water-model.ts`), shore swash and surf (plan 038, `shore-wave.ts`), ripples and the river field
 * (plan 025). The twins of the GLSL in `planet.glsl.ts`, same constants.
 */
import * as TSL from 'three/tsl';
import { BEACH_SLOPE, BREAKER_INDEX, SHORE_MIN_DISTANCE, shoreOmega } from '../shore-wave.ts';
import { DETAIL_LAYERS, WAVES, WAVE_GRAVITY, waveNumber, waveOmega } from '../water-model.ts';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const { cos, dot, float, max, min, mix, sin, smoothstep, sqrt, vec2, vec3 } = T;

const SHORE_W = shoreOmega();
const SHORE_GS = WAVE_GRAVITY * BEACH_SLOPE;

/**
 * `waveGradient`: the sum of the deep-water waves' tangent gradient (rise over run) and crest height
 * at p (metres from the anchor); components shorter than about three pixels fade out. `anchors`
 * are each wave's phase at the anchor (`PlanetPass.updateWaveAnchors`).
 */
export const waveGradient = (
	p: N,
	n: N,
	footprint: N,
	ctx: {
		east: N;
		north: N;
		time: N;
		anchors: N[];
		noiseA: (p: N, lam: number, salt: number) => N;
		/** Add the scrolled detail normals (plan 401, Medium and up). */
		detail?: boolean;
		/** The FFT texture (height, slope x, slope z, foam) tiling every `tile` metres (plan 401, High). */
		fft?: { node: N; tile: number };
	}
): { gradient: N; crest: N } => {
	const seed = ctx.noiseA(p, 256, 91);
	const warp = ctx.noiseA(p, 48, 92).sub(0.5).mul(6.0);
	let g: N = vec3(0.0);
	let crest: N = float(0.0);
	WAVES.forEach((w, i) => {
		const k = waveNumber(w.wavelength);
		const fade = max(min(float(w.wavelength).div(footprint.mul(3.0)).sub(1.0), 1.0), 0.0);
		const D = ctx.east.mul(Math.cos(w.direction)).add(ctx.north.mul(Math.sin(w.direction)));
		const ph = dot(D, p)
			.mul(k)
			.add(ctx.anchors[i])
			.sub(ctx.time.mul(waveOmega(w.wavelength)))
			.add(w.phase)
			.add(warp.mul(0.35 + 0.2 * i));
		const a = fade.mul(w.amplitude).mul(
			sin(seed.mul(5 + 2.3 * i).add(i))
				.mul(0.5)
				.add(0.75)
		);
		g = g.add(D.mul(a.mul(k).mul(cos(ph))));
		crest = crest.add(a.mul(sin(ph)));
	});
	if (ctx.fft) {
		// the FFT sea: its slopes in the tangent plane, faded as a pixel grows past the waves they hold
		// (read at level 0: the sea branch is not uniform control flow)
		const uvf = vec2(dot(ctx.east, p), dot(ctx.north, p)).div(ctx.fft.tile);
		const f = ctx.fft.node.sample(uvf).level(0);
		const fade = smoothstep(6.0, 30.0, footprint).oneMinus();
		g = g.add(ctx.east.mul(f.y).add(ctx.north.mul(f.z)).mul(fade));
		crest = crest.add(f.x.mul(fade));
	}
	if (ctx.detail) {
		// Two scrolled layers of fine ripples (plan 401) break the regular sine pattern close up: each is
		// the slope of a value noise drifting in its own direction, faded by the footprint like a wave
		// (gone from about three pixels a wavelength; `detailFade`).
		DETAIL_LAYERS.forEach((d) => {
			const fade = max(min(float(d.lambda).div(footprint.mul(3.0)).sub(1.0), 1.0), 0.0);
			const drift = ctx.east
				.mul(Math.cos(d.heading))
				.add(ctx.north.mul(Math.sin(d.heading)))
				.mul(ctx.time.mul(d.speed));
			const q = p.add(drift);
			const e = d.lambda * 0.15;
			const n0 = ctx.noiseA(q, d.lambda, d.salt);
			const nx = ctx.noiseA(q.add(ctx.east.mul(e)), d.lambda, d.salt);
			const ny = ctx.noiseA(q.add(ctx.north.mul(e)), d.lambda, d.salt);
			const slope = fade.mul(d.slope / 0.15);
			g = g.add(
				ctx.east
					.mul(nx.sub(n0))
					.add(ctx.north.mul(ny.sub(n0)))
					.mul(slope)
			);
		});
	}
	return { gradient: g.sub(n.mul(dot(g, n))), crest };
};

/** The waterline's run up and down the beach, m. */
export const swashOffset = (t: N, H: N): N =>
	H.mul(0.12 / BEACH_SLOPE).mul(
		sin(t.mul(SHORE_W)).add(sin(t.mul(2 * SHORE_W).add(1.1)).mul(0.35))
	);

const surfPhase = (x: N, t: N): N =>
	sqrt(max(x, SHORE_MIN_DISTANCE).div(SHORE_GS))
		.mul(2 * SHORE_W)
		.add(t.mul(SHORE_W));

/** Surf foam at x metres from the shoreline into the water. */
export const surfFoam = (x: N, t: N, H: N, fp: N): N => {
	const xb = H.div(BREAKER_INDEX * BEACH_SLOPE);
	const c = cos(surfPhase(x.sub(swashOffset(t, H).mul(0.5)), t))
		.mul(0.5)
		.add(0.5);
	// a breaker line is a fraction of the lines' spacing (it narrows toward the shore): a pixel near a
	// third of the spacing gets the line's mean (35/128), not dashes of it
	const spacing = sqrt(max(x, SHORE_MIN_DISTANCE).mul(SHORE_GS)).mul((2 * Math.PI) / SHORE_W);
	const crest = mix(
		c.mul(c).mul(c).mul(c),
		35 / 128,
		smoothstep(spacing.mul(0.08), spacing.mul(0.3), fp)
	);
	const breaking = smoothstep(xb.mul(0.9), xb.mul(1.6), x).oneMinus();
	const reach = smoothstep(xb.mul(2.5), xb.mul(5.0), x).oneMinus();
	return min(
		1.0,
		smoothstep(-2.0, 1.0, x).mul(
			crest
				.mul(reach)
				.mul(0.12)
				.add(breaking.mul(crest.mul(0.75).add(0.25)))
		)
	);
};

/** Ripples of a river or lake surface: three scales faded by the footprint. */
export const rippleAt = (
	p: N,
	f1: N,
	f2: N,
	f3: N,
	noiseA: (p: N, lam: number, salt: number) => N
): N =>
	f1
		.mul(noiseA(p, 8, 21))
		.add(f2.mul(0.5).mul(noiseA(p, 2, 22)))
		.add(f3.mul(0.25).mul(noiseA(p, 0.5, 23)));

/** The river field whose level set is the river. */
export const riverField = (p: N, noiseA: (p: N, lam: number, salt: number) => N): N =>
	noiseA(p, 1024, 41)
		.mul(0.62)
		.add(noiseA(p, 512, 42).mul(0.3))
		.add(noiseA(p, 128, 43).mul(0.08));
