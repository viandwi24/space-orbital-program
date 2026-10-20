/**
 * The GLSL noise of the planet pass in TSL (plan 261 Phase 2): `hashNoiseGLSL` (pcg3d value noise),
 * `noiseT` and `warpedLatLon` (terrain.glsl.ts), `fbmF` (cloud-field.glsl.ts). Same lattice, same
 * hashes, so a TSL pixel reads the noise the GLSL pixel read.
 */
import * as TSL from 'three/tsl';
import { MAP_WARP as W, OCTAVE_ROTATION } from '@orbital/core';

/* TSL nodes are untyped proxies; three's TSL typings lag its runtime */
type N = any;
const T = TSL as any;
const { Fn, float, int, ivec3, uvec3, vec2, vec3, floor, mix, dot, clamp, asin, atan, max, cos } =
	T;

const pcg3d = Fn(([v0]: N[]) => {
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

/** A lattice cell (ivec3) to one value in [0, 1]. */
export const hash13i = (c: N): N =>
	pcg3d(uvec3(c))
		.x.toFloat()
		.mul(1.0 / 4294967295.0);
/** A lattice cell (ivec3) to three values in [0, 1]. */
export const hash33i = (c: N): N => vec3(pcg3d(uvec3(c))).mul(1.0 / 4294967295.0);

/** Quintic-smoothed value noise of cell c (ivec3) at fraction f. */
export const valueNoiseCell = Fn(([c, f0]: N[]) => {
	const f = f0
		.mul(f0)
		.mul(f0)
		.mul(f0.mul(f0.mul(6.0).sub(15.0)).add(10.0));
	const I = (x: number, y: number, z: number): N => hash13i(c.add(ivec3(x, y, z)));
	const a = mix(I(0, 0, 0), I(1, 0, 0), f.x);
	const b = mix(I(0, 1, 0), I(1, 1, 0), f.x);
	const cc = mix(I(0, 0, 1), I(1, 0, 1), f.x);
	const d = mix(I(0, 1, 1), I(1, 1, 1), f.x);
	return mix(mix(a, b, f.y), mix(cc, d, f.y), f.z);
});

/** Plain float-position noise (stars, clouds). */
export const noiseF = (p: N): N => {
	const fl = floor(p);
	return valueNoiseCell(ivec3(fl), p.sub(fl));
};

/** `noiseF3`: three values per lattice fetch (one pcg3d hash gives a whole vec3). */
export const noiseF3 = Fn(([p]: N[]) => {
	const fl = floor(p);
	const f0 = p.sub(fl);
	const f = f0
		.mul(f0)
		.mul(f0)
		.mul(f0.mul(f0.mul(6.0).sub(15.0)).add(10.0));
	const c = ivec3(fl);
	const I = (x: number, y: number, z: number): N => hash33i(c.add(ivec3(x, y, z)));
	const a = mix(I(0, 0, 0), I(1, 0, 0), f.x);
	const b = mix(I(0, 1, 0), I(1, 1, 0), f.x);
	const cc = mix(I(0, 0, 1), I(1, 0, 1), f.x);
	const d = mix(I(0, 1, 1), I(1, 1, 1), f.x);
	return mix(mix(a, b, f.y), mix(cc, d, f.y), f.z);
});

/** The octave rotation of core's terrain (rows), applied between octaves. */
export const octaveRotate = (p: N): N => {
	const r = OCTAVE_ROTATION;
	return vec3(dot(vec3(...r[0]!), p), dot(vec3(...r[1]!), p), dot(vec3(...r[2]!), p));
};

/** `fbmF`: `octaves` octaves (a JS number) of `noiseF`, normalised. */
export const fbmF = (p0: N, octaves: number): N => {
	let sum: N = float(0.0);
	let p = p0;
	let amp = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum = sum.add(noiseF(p.add(i * 7.31)).mul(amp));
		norm += amp;
		amp *= 0.5;
		p = octaveRotate(p).mul(2.03);
	}
	return sum.div(norm);
};

/** `noiseT`: the terrain's lattice noise; `shift` is the seed's lattice shift (an int node). */
export const noiseT = (q: N, freq: number, salt: number, shift: N): N => {
	const p = q.mul(freq);
	const fl = floor(p);
	const c = ivec3(fl)
		.add(ivec3(Math.imul(salt, 131), Math.imul(salt, 71), Math.imul(salt, 17)))
		.add(ivec3(shift));
	return valueNoiseCell(c, p.sub(fl));
};

/**
 * `noiseA`: value noise whose lattice is anchored to the floating origin. `pl` is metres from the
 * anchor (body-fixed), `anchorCell` the anchor / 1024 m in integers; exact for lam = 1024 / 2^k.
 */
export const noiseA = (pl: N, lam: number, salt: number, anchorCell: N): N => {
	const f = pl.div(lam);
	const fl = floor(f);
	const c = ivec3(fl)
		.add(ivec3(anchorCell).mul(int(Math.round(1024 / lam))))
		.add(ivec3(Math.imul(salt, 131), Math.imul(salt, 71), Math.imul(salt, 17)));
	return valueNoiseCell(c, f.sub(fl));
};

/** Latitude and longitude at which the biome map is read for the unit body-fixed direction n. */
export const warpedLatLon = (n: N, radius: N, shift: N): N => {
	const lat = asin(clamp(n.y, -1.0, 1.0));
	const lon = atan(n.z.negate(), n.x);
	const q = n.mul(radius.div(1000.0));
	const octave = (salts: readonly [number, number]): N =>
		noiseT(q, 1 / W.wavelengthsKm[0], salts[0], shift)
			.mul(2.0)
			.sub(1.0)
			.mul(W.weights[0])
			.add(
				noiseT(q, 1 / W.wavelengthsKm[1], salts[1], shift)
					.mul(2.0)
					.sub(1.0)
					.mul(W.weights[1])
			);
	const k = W.amplitude / (W.weights[0] + W.weights[1]);
	return vec2(
		lat.add(octave(W.saltsLat).mul(k)),
		lon.add(
			octave(W.saltsLon)
				.mul(k)
				.div(max(cos(lat), 0.2))
		)
	);
};
