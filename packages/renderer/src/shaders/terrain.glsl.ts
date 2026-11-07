/**
 * The terrain bake (ADR 0036, ADR 0044): fullscreen passes evaluate the height function of
 * `@orbital/core` `terrain.ts` (this file is its GLSL twin; every constant comes from there) into
 * the cube map (far field) and into the camera-centred patches. A texel holds
 * `(hi, lo, g1, g2)`: the height split in two half floats (`hi` a multiple of 16 m, `lo` the rest,
 * so heights are exact to 8 mm up to 4.5 km), and the tangent gradient (rise over run) in the basis
 * `(t1, t2)` of the texel's own direction (`terrainTangentGLSL`), so the planet pass can march
 * heights with one fetch and shade with smooth normals.
 */
import {
	LAKE_SHAPE as LAKE,
	MAP_WARP as W,
	MAX_TERRAIN_ZONES,
	OCTAVE_ROTATION,
	TERRAIN_SHAPE as S
} from '@orbital/core';
import { hashNoiseGLSL } from './atmosphere.glsl.ts';

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
const m = OCTAVE_ROTATION;
/** GLSL matrices are built column by column. */
export const octaveRotationGLSL = `mat3(${[0, 1, 2].map((c) => `vec3(${m[0]![c]}, ${m[1]![c]}, ${m[2]![c]})`).join(', ')})`;

/**
 * Lattice noise of the terrain (`noiseT`, twin of `terrainNoise` in core), the octave rotation and
 * the map warp (twin of `warpedLatLon`); shared by the bake and the planet pass. Needs
 * `valueNoiseCell` from `hashNoiseGLSL`. `uTerrainShift` is the seed's lattice shift (`terrainShift`,
 * ADR 0142); a material that never sets it reads 0, the Legacy terrain.
 */
export const terrainNoiseGLSL = /* glsl */ `
const mat3 OCT_ROT = ${octaveRotationGLSL};
uniform int uTerrainShift;

float noiseT(vec3 q, float freq, int salt) {
	vec3 p = q * freq;
	vec3 fl = floor(p);
	ivec3 c = ivec3(fl) + ivec3(salt * 131, salt * 71, salt * 17) + ivec3(uTerrainShift);
	return valueNoiseCell(c, p - fl);
}

// Latitude/longitude at which the biome map is read for the unit body-fixed direction n.
vec2 warpedLatLon(vec3 n, float radius) {
	float lat = asin(clamp(n.y, -1.0, 1.0));
	float lon = atan(-n.z, n.x);
	vec3 q = n * (radius / 1000.0);
	float dLat = ${f(W.weights[0])} * (2.0 * noiseT(q, 1.0 / ${f(W.wavelengthsKm[0])}, ${W.saltsLat[0]}) - 1.0)
		+ ${f(W.weights[1])} * (2.0 * noiseT(q, 1.0 / ${f(W.wavelengthsKm[1])}, ${W.saltsLat[1]}) - 1.0);
	float dLon = ${f(W.weights[0])} * (2.0 * noiseT(q, 1.0 / ${f(W.wavelengthsKm[0])}, ${W.saltsLon[0]}) - 1.0)
		+ ${f(W.weights[1])} * (2.0 * noiseT(q, 1.0 / ${f(W.wavelengthsKm[1])}, ${W.saltsLon[1]}) - 1.0);
	float k = ${f(W.amplitude)} / ${f(W.weights[0] + W.weights[1])};
	return vec2(lat + dLat * k, lon + dLon * k / max(cos(lat), 0.2));
}
`;

/** Tangent basis of a body-fixed direction and the decode of a baked texel (shared with the planet pass). */
export const terrainTangentGLSL = /* glsl */ `
vec3 terrainTangent1(vec3 n) {
	return normalize(cross(n, abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
}
// Baked (hi, lo, g1, g2) at direction n -> height in x, body-fixed tangent gradient in yzw.
vec4 decodeTerrain(vec4 t, vec3 n) {
	vec3 t1 = terrainTangent1(n);
	return vec4(t.r + t.g, t.b * t1 + t.a * cross(n, t1));
}
`;

/**
 * The flat zones of the sites (ADR 0142 point 3, at most ${MAX_TERRAIN_ZONES}): `uZones[i]` is the unit
 * body-fixed centre and the flat radius (m), `uZoneBlend[i]` the blend width (m). `terrainZones(n,
 * radius)` returns (site weight = product over zones, arc to the first zone in m, lake gate = minimum
 * over zones), the twin of the zone loop in core's `terrainHeight`.
 */
export const terrainZonesGLSL = /* glsl */ `
uniform vec4 uZones[${MAX_TERRAIN_ZONES}];
uniform float uZoneBlend[${MAX_TERRAIN_ZONES}];
uniform int uZoneCount;
vec3 terrainZones(vec3 n, float radius) {
	float arc0 = radius * acos(clamp(dot(n, uZones[0].xyz), -1.0, 1.0));
	float site = 1.0;
	float gate = 1.0;
	for (int i = 0; i < ${MAX_TERRAIN_ZONES}; i++) {
		if (i >= uZoneCount) break;
		float a = i == 0 ? arc0 : radius * acos(clamp(dot(n, uZones[i].xyz), -1.0, 1.0));
		site *= smoothstep(uZones[i].w, uZones[i].w + uZoneBlend[i], a);
		gate = min(gate, smoothstep(${f(LAKE.siteFrom)}, ${f(LAKE.siteTo)}, a));
	}
	return vec3(site, arc0, gate);
}
`;

export const terrainBakeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The height function of the terrain, `heightAt(n)` (twin of `terrainHeight` in core), with the
 * noise it needs. It reads the uniforms `uMap` (the biome map), `uRadius` and the zones of
 * `terrainZonesGLSL`, which the including shader declares before it. The planet pass's bakes and a later body's ground pass
 * (ADR 0090) run this one text.
 */
export const terrainHeightGLSL = /* glsl */ `const float PI_ = 3.14159265359;
// Metres of one texel of the bake that includes this (the bakes define it as uTexel * uRadius); 0 is
// the exact function. Octaves finer than about four texels fade out into their mean (plan 417): a
// texel cannot carry them, and aliased they were noise that moved with the patch.
#ifndef TERRAIN_TEXEL_M
#define TERRAIN_TEXEL_M 0.0
#endif
float bandT(float wavelengthM) {
	return TERRAIN_TEXEL_M > 0.0 ? smoothstep(2.0 * TERRAIN_TEXEL_M, 4.0 * TERRAIN_TEXEL_M, wavelengthM) : 1.0;
}
float fbmT(vec3 q, float wavelengthKm, int octaves, int salt) {
	float sum = 0.5 * 2.0 * (1.0 - exp2(-float(octaves)));
	float amp = 1.0;
	float norm = 2.0 * (1.0 - exp2(-float(octaves)));
	float freq = 1.0 / wavelengthKm;
	for (int i = 0; i < 10; i++) {
		if (i >= octaves) break;
		float w = bandT(1000.0 / freq);
		if (w <= 0.0) break;
		sum += amp * w * (noiseT(q, freq, salt + i) - 0.5);
		amp *= 0.5;
		freq *= 2.0;
		q = OCT_ROT * q;
	}
	return sum / norm;
}

// The octaves from fineFrom on are scaled by fineFade and not evaluated when it is 0 (the
// normaliser is that of all octaves), the twin of \`ridged\` in core.
float ridgedT(vec3 q, float wavelengthKm, int octaves, int salt, int fineFrom, float fineFade) {
	float norm = 2.0 * (1.0 - exp2(-float(octaves)));
	float sum = ${f(S.ridgeMean)} * norm;
	float amp = 1.0;
	float freq = 1.0 / wavelengthKm;
	for (int i = 0; i < 10; i++) {
		if (i >= octaves) break;
		float w = (i >= fineFrom ? fineFade : 1.0) * bandT(1000.0 / freq);
		if (w <= 0.0) break;
		float rx = 2.0 * noiseT(q, freq, salt + i) - 1.0;
		float r = 1.0 - (sqrt(rx * rx + ${f(S.ridgeSoftness ** 2)}) - ${f(S.ridgeSoftness)});
		sum += amp * w * (r - ${f(S.ridgeMean)});
		amp *= 0.5;
		freq *= 2.0;
		q = OCT_ROT * q;
	}
	return sum / norm;
}

// The ridge profile pulled toward the cliff staircase by mask (twin of \`terrace\` in core).
float terraceT(float p, float mask) {
	float fs = p * ${f(S.cliffSteps)};
	float i = floor(fs);
	float stair = (i + smoothstep(${f(S.cliffTreadLow)}, ${f(S.cliffTreadHigh)}, fs - i)) / ${f(S.cliffSteps)};
	return p + mask * ${f(S.cliffStrength)} * (stair - p);
}

float heightAt(vec3 n) {
	vec2 ll = warpedLatLon(n, uRadius);
	float e = textureLod(uMap, vec2(ll.y / (2.0 * PI_) + 0.5, ll.x / PI_ + 0.5), 0.0).r;
	float land = smoothstep(${f(S.landStart)}, ${f(S.landFull)}, e);
	if (land <= 0.0) return 0.0;
	vec3 zones = terrainZones(n, uRadius);
	float site = zones.x;
	float arc = zones.y;
	if (site <= 0.0) return 0.0;
	vec3 q = n * (uRadius / 1000.0);
	float hillN = fbmT(q, ${f(S.hillWavelengthKm)}, ${S.hillOctaves}, 11);
	float hills = ${f(S.hillAmplitude)} * smoothstep(${f(S.hillLow)}, ${f(S.hillHigh)}, hillN);
	float rangeN = 0.65 * noiseT(q, 1.0 / ${f(S.rangeWavelengthsKm[0])}, ${S.rangeSalts[0]}) + 0.35 * noiseT(q, 1.0 / ${f(S.rangeWavelengthsKm[1])}, ${S.rangeSalts[1]});
	float backdrop = smoothstep(${f(S.backdropRiseMetres[0])}, ${f(S.backdropRiseMetres[1])}, arc)
		* (1.0 - smoothstep(${f(S.backdropFallMetres[0])}, ${f(S.backdropFallMetres[1])}, arc))
		* smoothstep(${f(S.backdropLow)}, ${f(S.backdropHigh)}, noiseT(q, 1.0 / ${f(S.backdropWavelengthKm)}, ${S.backdropSalt}));
	float rangeA = smoothstep(${f(S.rangeLow)}, ${f(S.rangeHigh)}, rangeN);
	float rangeH = max(${f(S.rangeBlend)} - abs(rangeA - backdrop), 0.0);
	float range = max(rangeA, backdrop) + rangeH * rangeH / ${f(4 * S.rangeBlend)};
	float ridge = ridgedT(q, ${f(S.ridgeWavelengthKm)}, ${S.ridgeOctaves}, 31, ${S.ridgeFineFrom}, smoothstep(${f(S.ridgeFineLow)}, ${f(S.ridgeFineHigh)}, range));
	float upland = smoothstep(${f(S.uplandLow)}, ${f(S.uplandHigh)}, e);
	float profile = smoothstep(0.25, 0.8, ridge);
	if (range > ${f(S.cliffRangeLow)}) {
		float cliffMask = smoothstep(${f(S.cliffLow)}, ${f(S.cliffHigh)}, noiseT(q, 1.0 / ${f(S.cliffWavelengthKm)}, ${S.cliffSalt}))
			* smoothstep(${f(S.cliffRangeLow)}, ${f(S.cliffRangeHigh)}, range);
		profile = terraceT(profile, cliffMask);
	}
	float mountains = ${f(S.mountainAmplitude)} * range * profile * (0.7 + 0.3 * upland);
	// lakes (plan 038): the relief is capped by a cone around the basins, zero on their floor (twin of terrainHeight)
	float lakeLevel = noiseT(q, 1.0 / ${f(LAKE.wavelengthKm)}, ${LAKE.salt}) * zones.z;
	float lakeCap = max(0.0, ${f(LAKE.slope)} * (${f(LAKE.to)} - lakeLevel) / ${LAKE.gradientBound.toExponential()});
	return min(land * site * (hills + mountains), lakeCap);
}`;

/**
 * The height and its gradient in one pass (plan 068, ADR 0116): the twin of core's
 * `terrainHeightAndGradient`, forward mode with `vec4(value, gradient with respect to n)`. The value
 * follows `heightAt` operation for operation (the map is read with the same filtered fetch); the
 * map's derivative comes from its four texels. Two height evaluations per texel cheaper than the
 * central differences it replaces.
 */
export const terrainHeightGradGLSL = /* glsl */ `
vec4 cD(float v) { return vec4(v, 0.0, 0.0, 0.0); }
vec4 mulD(vec4 a, vec4 b) { return vec4(a.x * b.x, a.yzw * b.x + b.yzw * a.x); }
vec4 chainD(float v, float d, vec4 a) { return vec4(v, a.yzw * d); }
vec4 smoothstepD(float e0, float e1, vec4 x) {
	float r = (x.x - e0) / (e1 - e0);
	if (r <= 0.0) return cD(0.0);
	if (r >= 1.0) return cD(1.0);
	return chainD(r * r * (3.0 - 2.0 * r), 6.0 * r * (1.0 - r) / (e1 - e0), x);
}
vec4 minD(vec4 a, vec4 b) { return b.x < a.x ? b : a; }

// valueNoiseCell and its gradient with respect to the position in the cell
vec4 valueNoiseCellD(ivec3 c, vec3 r) {
	vec3 f = r * r * r * (r * (r * 6.0 - 15.0) + 10.0);
	vec3 df = 30.0 * r * r * (r * (r - 2.0) + 1.0);
	float h000 = hash13i(c);
	float h100 = hash13i(c + ivec3(1, 0, 0));
	float h010 = hash13i(c + ivec3(0, 1, 0));
	float h110 = hash13i(c + ivec3(1, 1, 0));
	float h001 = hash13i(c + ivec3(0, 0, 1));
	float h101 = hash13i(c + ivec3(1, 0, 1));
	float h011 = hash13i(c + ivec3(0, 1, 1));
	float h111 = hash13i(c + ivec3(1, 1, 1));
	float a = mix(h000, h100, f.x);
	float b = mix(h010, h110, f.x);
	float cc = mix(h001, h101, f.x);
	float d = mix(h011, h111, f.x);
	float ab = mix(a, b, f.y);
	float cd = mix(cc, d, f.y);
	float dx = mix(mix(h100 - h000, h110 - h010, f.y), mix(h101 - h001, h111 - h011, f.y), f.z);
	return vec4(mix(ab, cd, f.z), vec3(dx, mix(b - a, d - cc, f.z), cd - ab) * df);
}
// noiseT and its gradient with respect to q
vec4 noiseTD(vec3 q, float freq, int salt) {
	vec3 p = q * freq;
	vec3 fl = floor(p);
	ivec3 c = ivec3(fl) + ivec3(salt * 131, salt * 71, salt * 17) + ivec3(uTerrainShift);
	vec4 r = valueNoiseCellD(c, p - fl);
	return vec4(r.x, r.yzw * freq);
}
vec4 octavesD(vec3 q, float kq, float wavelengthKm, int octaves, int salt, bool ridge, int fineFrom, vec4 fineFade) {
	float norm = 2.0 * (1.0 - exp2(-float(octaves)));
	float mean = ridge ? ${f(S.ridgeMean)} : 0.5;
	vec4 sum = cD(mean * norm);
	float amp = 1.0;
	float freq = 1.0 / wavelengthKm;
	mat3 back = mat3(1.0);
	mat3 rotT = transpose(OCT_ROT);
	for (int i = 0; i < 10; i++) {
		if (i >= octaves) break;
		float band = bandT(1000.0 / freq);
		if (band <= 0.0 || (i >= fineFrom && fineFade.x <= 0.0)) break;
		vec4 r = noiseTD(q, freq, salt + i);
		vec4 term = vec4(r.x, back * r.yzw * kq);
		if (ridge) {
			float x = 2.0 * term.x - 1.0;
			float s = sqrt(x * x + ${f(S.ridgeSoftness ** 2)});
			term = chainD(1.0 - (s - ${f(S.ridgeSoftness)}), -2.0 * x / s, term);
		}
		vec4 dev = term - cD(mean);
		sum += (i >= fineFrom ? mulD(dev, fineFade) : dev) * (amp * band);
		amp *= 0.5;
		freq *= 2.0;
		q = OCT_ROT * q;
		back = back * rotT;
	}
	return sum / norm;
}
// terraceT with its gradient: the staircase's own slope is the smoothstep's (twin of terraceD in core)
vec4 terraceD(vec4 p, vec4 mask) {
	float fs = p.x * ${f(S.cliffSteps)};
	float i = floor(fs);
	float raw = (fs - i - ${f(S.cliffTreadLow)}) / ${f(S.cliffTreadHigh - S.cliffTreadLow)};
	float t = clamp(raw, 0.0, 1.0);
	float dStep = (raw > 0.0 && raw < 1.0) ? 6.0 * t * (1.0 - t) / ${f(S.cliffTreadHigh - S.cliffTreadLow)} : 0.0;
	vec4 stair = chainD((i + t * t * (3.0 - 2.0 * t)) / ${f(S.cliffSteps)}, dStep, p);
	return p + mulD(mask * ${f(S.cliffStrength)}, stair - p);
}
vec4 arcD(vec3 n, vec3 dir, float radius) {
	float c = clamp(dot(n, dir), -1.0, 1.0);
	float s = sqrt(1.0 - c * c);
	return vec4(radius * acos(c), s > 0.0 ? dir * (-radius / s) : vec3(0.0));
}

vec4 heightGrad(vec3 n) {
	float kq = uRadius / 1000.0;
	vec3 q = n * kq;
	float y = clamp(n.y, -1.0, 1.0);
	vec4 lat = vec4(asin(y), 0.0, abs(n.y) < 1.0 ? 1.0 / sqrt(1.0 - y * y) : 0.0, 0.0);
	float r2 = n.x * n.x + n.z * n.z;
	vec4 lon = vec4(atan(-n.z, n.x), r2 > 0.0 ? vec3(n.z, 0.0, -n.x) / r2 : vec3(0.0));
	vec4 dLat = ${f(W.weights[0])} * (2.0 * noiseTD(q, 1.0 / ${f(W.wavelengthsKm[0])}, ${W.saltsLat[0]}) - cD(1.0))
		+ ${f(W.weights[1])} * (2.0 * noiseTD(q, 1.0 / ${f(W.wavelengthsKm[1])}, ${W.saltsLat[1]}) - cD(1.0));
	vec4 dLon = ${f(W.weights[0])} * (2.0 * noiseTD(q, 1.0 / ${f(W.wavelengthsKm[0])}, ${W.saltsLon[0]}) - cD(1.0))
		+ ${f(W.weights[1])} * (2.0 * noiseTD(q, 1.0 / ${f(W.wavelengthsKm[1])}, ${W.saltsLon[1]}) - cD(1.0));
	dLat.yzw *= kq;
	dLon.yzw *= kq;
	float k = ${f(W.amplitude)} / ${f(W.weights[0] + W.weights[1])};
	float cosLat = cos(lat.x);
	vec4 inv = cosLat > 0.2 ? chainD(1.0 / cosLat, sin(lat.x) / (cosLat * cosLat), lat) : cD(1.0 / 0.2);
	vec4 wLat = lat + dLat * k;
	vec4 wLon = lon + mulD(dLon * k, inv);
	// the map: the value from the filtered fetch heightAt uses, the derivative from its four texels
	vec2 uv = vec2(wLon.x / (2.0 * PI_) + 0.5, wLat.x / PI_ + 0.5);
	float e = textureLod(uMap, uv, 0.0).r;
	ivec2 size = textureSize(uMap, 0);
	float fx = uv.x * float(size.x) - 0.5;
	float rawY = uv.y * float(size.y) - 0.5;
	float fy = clamp(rawY, 0.0, float(size.y - 1));
	float x0 = floor(fx);
	float y0 = floor(fy);
	float tx = fx - x0;
	float ty = fy - y0;
	int ix0 = int(mod(x0, float(size.x)));
	int ix1 = int(mod(x0 + 1.0, float(size.x)));
	int iy0 = int(clamp(y0, 0.0, float(size.y - 1)));
	int iy1 = int(clamp(y0 + 1.0, 0.0, float(size.y - 1)));
	float a = texelFetch(uMap, ivec2(ix0, iy0), 0).r;
	float b = texelFetch(uMap, ivec2(ix1, iy0), 0).r;
	float cc = texelFetch(uMap, ivec2(ix0, iy1), 0).r;
	float d = texelFetch(uMap, ivec2(ix1, iy1), 0).r;
	float dTx = (b - a) * (1.0 - ty) + (d - cc) * ty;
	float dTy = fy != rawY ? 0.0 : (cc + (d - cc) * tx) - (a + (b - a) * tx);
	vec4 eD = vec4(e, wLat.yzw * (dTy * float(size.y) / PI_) + wLon.yzw * (dTx * float(size.x) / (2.0 * PI_)));
	vec4 land = smoothstepD(${f(S.landStart)}, ${f(S.landFull)}, eD);
	if (land.x <= 0.0) return cD(0.0);
	vec4 arc = arcD(n, uZones[0].xyz, uRadius);
	vec4 site = cD(1.0);
	vec4 gate = cD(1.0);
	for (int i = 0; i < ${MAX_TERRAIN_ZONES}; i++) {
		if (i >= uZoneCount) break;
		vec4 az = i == 0 ? arc : arcD(n, uZones[i].xyz, uRadius);
		site = mulD(site, smoothstepD(uZones[i].w, uZones[i].w + uZoneBlend[i], az));
		gate = minD(gate, smoothstepD(${f(LAKE.siteFrom)}, ${f(LAKE.siteTo)}, az));
	}
	if (site.x <= 0.0) return cD(0.0);
	vec4 hillN = octavesD(q, kq, ${f(S.hillWavelengthKm)}, ${S.hillOctaves}, 11, false, ${S.hillOctaves}, cD(1.0));
	vec4 hills = ${f(S.hillAmplitude)} * smoothstepD(${f(S.hillLow)}, ${f(S.hillHigh)}, hillN);
	vec4 n0 = noiseTD(q, 1.0 / ${f(S.rangeWavelengthsKm[0])}, ${S.rangeSalts[0]});
	vec4 n1 = noiseTD(q, 1.0 / ${f(S.rangeWavelengthsKm[1])}, ${S.rangeSalts[1]});
	vec4 rangeN = vec4(0.65 * n0.x + 0.35 * n1.x, (0.65 * n0.yzw + 0.35 * n1.yzw) * kq);
	vec4 bn = noiseTD(q, 1.0 / ${f(S.backdropWavelengthKm)}, ${S.backdropSalt});
	bn.yzw *= kq;
	vec4 backdrop = mulD(mulD(smoothstepD(${f(S.backdropRiseMetres[0])}, ${f(S.backdropRiseMetres[1])}, arc),
		cD(1.0) - smoothstepD(${f(S.backdropFallMetres[0])}, ${f(S.backdropFallMetres[1])}, arc)),
		smoothstepD(${f(S.backdropLow)}, ${f(S.backdropHigh)}, bn));
	vec4 rangeA = smoothstepD(${f(S.rangeLow)}, ${f(S.rangeHigh)}, rangeN);
	vec4 diff = rangeA - backdrop;
	float rangeH = max(${f(S.rangeBlend)} - abs(diff.x), 0.0);
	vec4 range = rangeA.x >= backdrop.x ? rangeA : backdrop;
	if (rangeH > 0.0) {
		vec3 dh = diff.yzw * (diff.x >= 0.0 ? -1.0 : 1.0);
		range += vec4(rangeH * rangeH / ${f(4 * S.rangeBlend)}, dh * rangeH / ${f(2 * S.rangeBlend)});
	}
	vec4 ridge = octavesD(q, kq, ${f(S.ridgeWavelengthKm)}, ${S.ridgeOctaves}, 31, true, ${S.ridgeFineFrom}, smoothstepD(${f(S.ridgeFineLow)}, ${f(S.ridgeFineHigh)}, range));
	vec4 upland = smoothstepD(${f(S.uplandLow)}, ${f(S.uplandHigh)}, eD);
	vec4 profile = smoothstepD(0.25, 0.8, ridge);
	if (range.x > ${f(S.cliffRangeLow)}) {
		vec4 cn = noiseTD(q, 1.0 / ${f(S.cliffWavelengthKm)}, ${S.cliffSalt});
		cn.yzw *= kq;
		vec4 cliffMask = mulD(smoothstepD(${f(S.cliffLow)}, ${f(S.cliffHigh)}, cn), smoothstepD(${f(S.cliffRangeLow)}, ${f(S.cliffRangeHigh)}, range));
		profile = terraceD(profile, cliffMask);
	}
	vec4 mountains = ${f(S.mountainAmplitude)} * mulD(mulD(range, profile), cD(0.7) + 0.3 * upland);
	vec4 relief = mulD(mulD(land, site), hills + mountains);
	vec4 ln = noiseTD(q, 1.0 / ${f(LAKE.wavelengthKm)}, ${LAKE.salt});
	ln.yzw *= kq;
	vec4 level = mulD(ln, gate);
	vec4 capRaw = (cD(${f(LAKE.to)}) - level) * ${f(LAKE.slope / LAKE.gradientBound)};
	vec4 cap = capRaw.x > 0.0 ? capRaw : cD(0.0);
	return minD(relief, cap);
}`;

/** Height function, encoding and uniforms shared by the cube and patch bakes. */
const terrainBakeCommon = /* glsl */ `
${hashNoiseGLSL}
${terrainNoiseGLSL}
${terrainTangentGLSL}
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uTexel;   // angular size of one texel at the centre, rad
uniform float uRadius;
#define TERRAIN_TEXEL_M (uTexel * uRadius)
${terrainZonesGLSL}

${terrainHeightGLSL}
${terrainHeightGradGLSL}

// One baked texel for the unit body-fixed direction n; d is the angular size of a texel, rad.
vec4 terrainTexel(vec3 n, float d) {
	vec3 t1 = terrainTangent1(n);
	vec3 t2 = cross(n, t1);
#ifdef TERRAIN_NO_GRADIENT
	// plan 068's measurement only: one height, no gradient (what any gradient costs on top)
	float h0 = heightAt(n);
	vec2 g = vec2(0.0);
#elif defined(TERRAIN_FD_GRADIENT)
	// plan 068's baseline: the forward differences the bake used before the analytic gradient
	float h0 = heightAt(n);
	vec2 g = vec2(heightAt(normalize(n + t1 * d)) - h0, heightAt(normalize(n + t2 * d)) - h0) / (d * uRadius);
#else
	// the analytic gradient (ADR 0116): one pass, rise over run along t1 and t2
	vec4 hg = heightGrad(n);
	float h0 = hg.x;
	vec2 g = vec2(dot(hg.yzw, t1), dot(hg.yzw, t2)) / uRadius;
#endif
	float hi = floor(h0 / 16.0) * 16.0;
	return vec4(hi, h0 - hi, g);
}
`;

export const terrainBakeFragment = /* glsl */ `
${terrainBakeCommon}
uniform int uFace;
// Direction of a texel of a cube face (OpenGL cube map convention: +X, -X, +Y, -Y, +Z, -Z).
vec3 faceDir(int face, vec2 st) {
	if (face == 0) return vec3(1.0, -st.y, -st.x);
	if (face == 1) return vec3(-1.0, -st.y, st.x);
	if (face == 2) return vec3(st.x, 1.0, st.y);
	if (face == 3) return vec3(st.x, -1.0, -st.y);
	if (face == 4) return vec3(st.x, -st.y, 1.0);
	return vec3(-st.x, -st.y, -1.0);
}

void main() {
	gl_FragColor = terrainTexel(normalize(faceDir(uFace, vUv * 2.0 - 1.0)), uTexel);
}
`;

/**
 * A camera-centred patch (ADR 0044): the texel at patch coordinates (u, v) in [-1, 1] is the
 * direction `normalize(c + halfTan (u e + v f))` (gnomonic projection around the unit direction c
 * with tangent axes e and f), the pure twin of `patchDirection` in `terrain-patch.ts`.
 */
export const terrainPatchFragment = /* glsl */ `
${terrainBakeCommon}
uniform vec3 uPatchC;
uniform vec3 uPatchE;
uniform vec3 uPatchF;
uniform float uHalfTan;

void main() {
	vec2 st = vUv * 2.0 - 1.0;
	vec3 n = normalize(uPatchC + uHalfTan * (st.x * uPatchE + st.y * uPatchF));
	// 32-bit floats: height in x (exact to float precision), gradient in the tangent basis in yz.
	// The planet pass filters these by hand (half floats lose centimetres when filtered).
	vec4 t = terrainTexel(n, uTexel);
	gl_FragColor = vec4(t.r + t.g, t.b, t.a, 0.0);
}
`;
