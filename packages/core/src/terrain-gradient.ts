/**
 * The analytic gradient of the terrain height (plan 068, ADR 0116): `terrainHeight` evaluated in
 * forward mode, every quantity carried as a value and its gradient with respect to the body-fixed
 * direction `n` (as a point of R^3). Projected on the tangent plane and divided by the radius, this
 * is the rise over run the bakes store; it replaces two extra height evaluations per texel.
 * The value is `terrainHeight` exactly (same operations in the same order).
 */
import type { Vec3 } from './math.ts';
import { sampleMap, type PlanetMap } from './planet-map.ts';
import {
	LAKE_SHAPE,
	latLonDirection,
	LEGACY_ZONE,
	MAP_WARP,
	OCTAVE_ROTATION,
	pcgX,
	TERRAIN_SHAPE,
	terrainHeight,
	type TerrainContext
} from './terrain.ts';

/** A value and its gradient with respect to `n`. */
interface D {
	v: number;
	g: Vec3;
}
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const c = (v: number): D => ({ v, g: ZERO });
const add = (a: D, b: D): D => ({
	v: a.v + b.v,
	g: { x: a.g.x + b.g.x, y: a.g.y + b.g.y, z: a.g.z + b.g.z }
});
const sub = (a: D, b: D): D => ({
	v: a.v - b.v,
	g: { x: a.g.x - b.g.x, y: a.g.y - b.g.y, z: a.g.z - b.g.z }
});
const scl = (a: D, s: number): D => ({
	v: a.v * s,
	g: { x: a.g.x * s, y: a.g.y * s, z: a.g.z * s }
});
const mul = (a: D, b: D): D => ({
	v: a.v * b.v,
	g: {
		x: a.g.x * b.v + b.g.x * a.v,
		y: a.g.y * b.v + b.g.y * a.v,
		z: a.g.z * b.v + b.g.z * a.v
	}
});
/** `f(a)` with `f'(a.v) = d`. */
const chain = (v: number, d: number, a: D): D => ({
	v,
	g: { x: a.g.x * d, y: a.g.y * d, z: a.g.z * d }
});

const smoothstepD = (e0: number, e1: number, x: D): D => {
	const raw = (x.v - e0) / (e1 - e0);
	if (raw <= 0) return c(0);
	if (raw >= 1) return c(1);
	return chain(raw * raw * (3 - 2 * raw), (6 * raw * (1 - raw)) / (e1 - e0), x);
};
const minD = (a: D, b: D): D => (b.v < a.v ? b : a);

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const fadeD = (t: number): number => 30 * t * t * (t * (t - 2) + 1);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Value noise of `q * freq` and its gradient with respect to `q` (the twin of `terrainNoise`,
 * same lattice and hash).
 */
function noiseQ(q: Vec3, freq: number, salt: number, shift: number): { v: number; g: Vec3 } {
	const fx = q.x * freq;
	const fy = q.y * freq;
	const fz = q.z * freq;
	const x0 = Math.floor(fx);
	const y0 = Math.floor(fy);
	const z0 = Math.floor(fz);
	const cx = x0 + salt * 131 + shift;
	const cy = y0 + salt * 71 + shift;
	const cz = z0 + salt * 17 + shift;
	const [rx, ry, rz] = [fx - x0, fy - y0, fz - z0];
	const [tx, ty, tz] = [fade(rx), fade(ry), fade(rz)];
	const [dx, dy, dz] = [fadeD(rx), fadeD(ry), fadeD(rz)];
	const h = (a: number, b: number, e: number): number => pcgX(cx + a, cy + b, cz + e);
	const h000 = h(0, 0, 0);
	const h100 = h(1, 0, 0);
	const h010 = h(0, 1, 0);
	const h110 = h(1, 1, 0);
	const h001 = h(0, 0, 1);
	const h101 = h(1, 0, 1);
	const h011 = h(0, 1, 1);
	const h111 = h(1, 1, 1);
	const a = mix(h000, h100, tx);
	const b = mix(h010, h110, tx);
	const cc = mix(h001, h101, tx);
	const d = mix(h011, h111, tx);
	const ab = mix(a, b, ty);
	const cd = mix(cc, d, ty);
	const v = mix(ab, cd, tz);
	// partials with respect to the fade weights, then the chain through fade and `freq`
	const dTx = mix(mix(h100 - h000, h110 - h010, ty), mix(h101 - h001, h111 - h011, ty), tz);
	const dTy = mix(b - a, d - cc, tz);
	const dTz = cd - ab;
	return { v, g: { x: dTx * dx * freq, y: dTy * dy * freq, z: dTz * dz * freq } };
}

const M = OCTAVE_ROTATION;
const turn = (q: Vec3): Vec3 => ({
	x: M[0]![0] * q.x + M[0]![1] * q.y + M[0]![2] * q.z,
	y: M[1]![0] * q.x + M[1]![1] * q.y + M[1]![2] * q.z,
	z: M[2]![0] * q.x + M[2]![1] * q.y + M[2]![2] * q.z
});
/** `Mᵀ g`: the gradient taken through `turn` back to the unturned position. */
const turnBack = (g: Vec3): Vec3 => ({
	x: M[0]![0] * g.x + M[1]![0] * g.y + M[2]![0] * g.z,
	y: M[0]![1] * g.x + M[1]![1] * g.y + M[2]![1] * g.z,
	z: M[0]![2] * g.x + M[1]![2] * g.y + M[2]![2] * g.z
});

/** Noise at `q = n * kq` (km), gradient with respect to `n`. */
const noiseN = (q: Vec3, kq: number, freq: number, salt: number, shift: number): D => {
	const r = noiseQ(q, freq, salt, shift);
	return { v: r.v, g: { x: r.g.x * kq, y: r.g.y * kq, z: r.g.z * kq } };
};

/** fbm (or the ridged sum with `ridge`) with its gradient through the octave rotations. */
function octavesN(
	q0: Vec3,
	kq: number,
	wavelengthKm: number,
	octaves: number,
	salt: number,
	shift: number,
	ridge: boolean
): D {
	let q = q0;
	// back[i] maps a gradient at octave i's position to the unturned position: (M^i)ᵀ
	let sum: D = c(0);
	let amp = 1;
	let norm = 0;
	let freq = 1 / wavelengthKm;
	const e = TERRAIN_SHAPE.ridgeSoftness;
	for (let i = 0; i < octaves; i++) {
		const r = noiseQ(q, freq, salt + i, shift);
		let g = r.g;
		for (let k = 0; k < i; k++) g = turnBack(g);
		let term: D = { v: r.v, g: { x: g.x * kq, y: g.y * kq, z: g.z * kq } };
		if (ridge) {
			const x = 2 * term.v - 1;
			const s = Math.sqrt(x * x + e * e);
			term = chain(1 - (s - e), (-x / s) * 2, term);
		}
		sum = add(sum, scl(term, amp));
		norm += amp;
		amp *= 0.5;
		freq *= 2;
		q = turn(q);
	}
	return scl(sum, 1 / norm);
}

/** The biome map's elevation, bilinear as `sampleMap`, and its partials in (latitude, longitude). */
function mapElevationD(
	map: PlanetMap,
	lat: number,
	lon: number
): { v: number; dLat: number; dLon: number } {
	const u = lon / (2 * Math.PI) + 0.5;
	const vv = lat / Math.PI + 0.5;
	const fx = u * map.width - 0.5;
	const rawY = vv * map.height - 0.5;
	const fy = Math.min(map.height - 1, Math.max(0, rawY));
	const clampedY = fy !== rawY;
	const x0 = Math.floor(fx);
	const y0 = Math.floor(fy);
	const tx = fx - x0;
	const ty = fy - y0;
	const px = (x: number) => ((x % map.width) + map.width) % map.width;
	const py = (y: number) => Math.min(map.height - 1, Math.max(0, y));
	const at = (x: number, y: number) => map.data[(py(y) * map.width + px(x)) * 4]! / 255;
	const [a, b, cc, d] = [at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)];
	const value = sampleMap(map, lat, lon)[0];
	const dTx = (b - a) * (1 - ty) + (d - cc) * ty;
	const dTy = clampedY ? 0 : cc + (d - cc) * tx - (a + (b - a) * tx);
	return {
		v: value,
		dLon: (dTx * map.width) / (2 * Math.PI),
		dLat: (dTy * map.height) / Math.PI
	};
}

export interface HeightAndGradient {
	/** `terrainHeight(n, ctx)`. */
	height: number;
	/** Gradient with respect to `n` as a point of R^3 (only its tangent part means anything). */
	gradient: Vec3;
}

const ZERO_HEIGHT: HeightAndGradient = { height: 0, gradient: ZERO };

/** `terrainHeight` and its gradient in one pass (ADR 0116). */
export function terrainHeightAndGradient(n: Vec3, ctx: TerrainContext): HeightAndGradient {
	const s = TERRAIN_SHAPE;
	const shift = ctx.shift ?? 0;
	const kq = ctx.radius / 1000;
	const q = { x: n.x * kq, y: n.y * kq, z: n.z * kq };
	// latitude and longitude of n with their gradients
	const y = Math.min(1, Math.max(-1, n.y));
	const lat: D = {
		v: Math.asin(y),
		g: { x: 0, y: Math.abs(n.y) < 1 ? 1 / Math.sqrt(1 - y * y) : 0, z: 0 }
	};
	const r2 = n.x * n.x + n.z * n.z;
	const lon: D = {
		v: Math.atan2(-n.z, n.x),
		g: r2 > 0 ? { x: n.z / r2, y: 0, z: -n.x / r2 } : ZERO
	};
	// the map warp
	const w = MAP_WARP;
	let dLat = c(0);
	let dLon = c(0);
	let norm = 0;
	for (let i = 0; i < 2; i++) {
		const freq = 1 / w.wavelengthsKm[i]!;
		dLat = add(
			dLat,
			scl(sub(scl(noiseN(q, kq, freq, w.saltsLat[i]!, shift), 2), c(1)), w.weights[i]!)
		);
		dLon = add(
			dLon,
			scl(sub(scl(noiseN(q, kq, freq, w.saltsLon[i]!, shift), 2), c(1)), w.weights[i]!)
		);
		norm += w.weights[i]!;
	}
	const k = w.amplitude / norm;
	const cosLat = Math.cos(lat.v);
	const inv: D =
		cosLat > 0.2 ? chain(1 / cosLat, Math.sin(lat.v) / (cosLat * cosLat), lat) : c(1 / 0.2);
	const wLat = add(lat, scl(dLat, k));
	const wLon = add(lon, mul(scl(dLon, k), inv));
	// the map's elevation at the warped position
	const m = mapElevationD(ctx.map, wLat.v, wLon.v);
	const e: D = {
		v: m.v,
		g: {
			x: m.dLat * wLat.g.x + m.dLon * wLon.g.x,
			y: m.dLat * wLat.g.y + m.dLon * wLon.g.y,
			z: m.dLat * wLat.g.z + m.dLon * wLon.g.z
		}
	};
	const land = smoothstepD(s.landStart, s.landFull, e);
	if (land.v <= 0) return ZERO_HEIGHT;
	// zones: the site weight is the product, the lake gate the minimum
	const zones = zoneDirections(ctx);
	const arcD = (dir: Vec3): D => {
		const cos = Math.min(1, Math.max(-1, n.x * dir.x + n.y * dir.y + n.z * dir.z));
		const sin = Math.sqrt(1 - cos * cos);
		const f = sin > 0 ? -ctx.radius / sin : 0;
		return { v: ctx.radius * Math.acos(cos), g: { x: dir.x * f, y: dir.y * f, z: dir.z * f } };
	};
	const arc = arcD(zones[0]!.direction);
	let site: D = c(1);
	let gate: D = c(1);
	for (let i = 0; i < zones.length; i++) {
		const z = zones[i]!;
		const a = i === 0 ? arc : arcD(z.direction);
		site = mul(site, smoothstepD(z.flatRadius, z.flatRadius + z.blendWidth, a));
		gate = minD(gate, smoothstepD(LAKE_SHAPE.siteFrom, LAKE_SHAPE.siteTo, a));
	}
	if (site.v <= 0) return ZERO_HEIGHT;
	const hillN = octavesN(q, kq, s.hillWavelengthKm, s.hillOctaves, 11, shift, false);
	const hills = scl(smoothstepD(s.hillLow, s.hillHigh, hillN), s.hillAmplitude);
	const rangeN = add(
		scl(noiseN(q, kq, 1 / s.rangeWavelengthsKm[0], s.rangeSalts[0], shift), 0.65),
		scl(noiseN(q, kq, 1 / s.rangeWavelengthsKm[1], s.rangeSalts[1], shift), 0.35)
	);
	const backdrop = mul(
		mul(
			smoothstepD(s.backdropRiseMetres[0], s.backdropRiseMetres[1], arc),
			sub(c(1), smoothstepD(s.backdropFallMetres[0], s.backdropFallMetres[1], arc))
		),
		smoothstepD(
			s.backdropLow,
			s.backdropHigh,
			noiseN(q, kq, 1 / s.backdropWavelengthKm, s.backdropSalt, shift)
		)
	);
	// the smooth maximum of the range mask and the massif
	const ra = smoothstepD(s.rangeLow, s.rangeHigh, rangeN);
	const kb = s.rangeBlend;
	const diff = sub(ra, backdrop);
	const hv = Math.max(kb - Math.abs(diff.v), 0);
	let range = ra.v >= backdrop.v ? ra : backdrop;
	if (hv > 0) {
		const h: D = scl(diff, diff.v >= 0 ? -1 : 1); // d(k − |a − b|)
		range = add(range, {
			v: (hv * hv) / (4 * kb),
			g: { x: (h.g.x * hv) / (2 * kb), y: (h.g.y * hv) / (2 * kb), z: (h.g.z * hv) / (2 * kb) }
		});
	}
	const ridge = octavesN(q, kq, s.ridgeWavelengthKm, s.ridgeOctaves, 31, shift, true);
	const upland = smoothstepD(s.uplandLow, s.uplandHigh, e);
	const mountains = scl(
		mul(mul(range, smoothstepD(0.25, 0.8, ridge)), add(c(0.7), scl(upland, 0.3))),
		s.mountainAmplitude
	);
	const relief = mul(mul(land, site), add(hills, mountains));
	const level = mul(noiseN(q, kq, 1 / LAKE_SHAPE.wavelengthKm, LAKE_SHAPE.salt, shift), gate);
	const capRaw = scl(sub(c(LAKE_SHAPE.to), level), LAKE_SHAPE.slope / LAKE_SHAPE.gradientBound);
	const cap = capRaw.v > 0 ? capRaw : c(0);
	const out = minD(relief, cap);
	// the value is the plain function's, bit for bit (forward mode reorders nothing it returns)
	return { height: terrainHeight(n, ctx), gradient: out.g };
}

/** Rise over run along the tangents `t1`, `t2` (what a bake texel stores): `∇h · t / R`. */
export function terrainSlopes(
	n: Vec3,
	t1: Vec3,
	t2: Vec3,
	ctx: TerrainContext
): { height: number; g1: number; g2: number } {
	const r = terrainHeightAndGradient(n, ctx);
	const g = r.gradient;
	return {
		height: r.height,
		g1: (g.x * t1.x + g.y * t1.y + g.z * t1.z) / ctx.radius,
		g2: (g.x * t2.x + g.y * t2.y + g.z * t2.z) / ctx.radius
	};
}

// the zone directions of a context (the cache of terrain.ts is private; this one is the same data)
const dirCache = new WeakMap<
	TerrainContext,
	Array<{ direction: Vec3; flatRadius: number; blendWidth: number }>
>();
function zoneDirections(ctx: TerrainContext) {
	let z = dirCache.get(ctx);
	if (!z) {
		const list = ctx.zones ?? [LEGACY_ZONE];
		z = list.map((zone) => ({
			direction:
				!ctx.zones && ctx.siteDirection
					? ctx.siteDirection
					: latLonDirection(zone.latitude, zone.longitude),
			flatRadius: zone.flatRadius,
			blendWidth: zone.blendWidth
		}));
		dirCache.set(ctx, z);
	}
	return z;
}
