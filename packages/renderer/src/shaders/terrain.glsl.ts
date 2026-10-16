/**
 * The terrain bake (ADR 0036): one fullscreen pass per cube face evaluates the height function of
 * `terrain-model.ts` (this file is its GLSL twin; every constant comes from there) and writes
 * height in metres plus the tangent gradient (rise over run, body-fixed) so the planet pass can
 * march heights with one fetch and shade with smooth normals.
 */
import {
	MAP_WARP as W,
	OCTAVE_ROTATION,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
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
 * `valueNoiseCell` from `hashNoiseGLSL`.
 */
export const terrainNoiseGLSL = /* glsl */ `
const mat3 OCT_ROT = ${octaveRotationGLSL};

float noiseT(vec3 q, float freq, int salt) {
	vec3 p = q * freq;
	vec3 fl = floor(p);
	ivec3 c = ivec3(fl) + ivec3(salt * 131, salt * 71, salt * 17);
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

export const terrainBakeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const terrainBakeFragment = /* glsl */ `
${hashNoiseGLSL}
${terrainNoiseGLSL}
varying vec2 vUv;
uniform sampler2D uMap;
uniform int uFace;
uniform float uTexel;   // angular size of one texel at the face centre, rad
uniform float uRadius;
uniform vec3 uSiteDir;  // unit, body-fixed

const float PI_ = 3.14159265359;
float fbmT(vec3 q, float wavelengthKm, int octaves, int salt) {
	float sum = 0.0;
	float amp = 1.0;
	float norm = 0.0;
	float freq = 1.0 / wavelengthKm;
	for (int i = 0; i < 6; i++) {
		if (i >= octaves) break;
		sum += amp * noiseT(q, freq, salt + i);
		norm += amp;
		amp *= 0.5;
		freq *= 2.0;
		q = OCT_ROT * q;
	}
	return sum / norm;
}

float ridgedT(vec3 q, float wavelengthKm, int octaves, int salt) {
	float sum = 0.0;
	float amp = 1.0;
	float norm = 0.0;
	float freq = 1.0 / wavelengthKm;
	for (int i = 0; i < 6; i++) {
		if (i >= octaves) break;
		float rx = 2.0 * noiseT(q, freq, salt + i) - 1.0;
		float r = 1.0 - (sqrt(rx * rx + ${f(S.ridgeSoftness ** 2)}) - ${f(S.ridgeSoftness)});
		sum += amp * r;
		norm += amp;
		amp *= 0.5;
		freq *= 2.0;
		q = OCT_ROT * q;
	}
	return sum / norm;
}

float heightAt(vec3 n) {
	vec2 ll = warpedLatLon(n, uRadius);
	float e = textureLod(uMap, vec2(ll.y / (2.0 * PI_) + 0.5, ll.x / PI_ + 0.5), 0.0).r;
	float land = smoothstep(${f(S.landStart)}, ${f(S.landFull)}, e);
	if (land <= 0.0) return 0.0;
	float arc = uRadius * acos(clamp(dot(n, uSiteDir), -1.0, 1.0));
	float site = smoothstep(${f(SITE_FLAT_RADIUS)}, ${f(SITE_FLAT_RADIUS + SITE_BLEND_WIDTH)}, arc);
	if (site <= 0.0) return 0.0;
	vec3 q = n * (uRadius / 1000.0);
	float hillN = fbmT(q, ${f(S.hillWavelengthKm)}, ${S.hillOctaves}, 11);
	float hills = ${f(S.hillAmplitude)} * smoothstep(${f(S.hillLow)}, ${f(S.hillHigh)}, hillN);
	float rangeN = 0.65 * noiseT(q, 1.0 / ${f(S.rangeWavelengthsKm[0])}, ${S.rangeSalts[0]}) + 0.35 * noiseT(q, 1.0 / ${f(S.rangeWavelengthsKm[1])}, ${S.rangeSalts[1]});
	float backdrop = smoothstep(${f(S.backdropRiseMetres[0])}, ${f(S.backdropRiseMetres[1])}, arc)
		* (1.0 - smoothstep(${f(S.backdropFallMetres[0])}, ${f(S.backdropFallMetres[1])}, arc))
		* smoothstep(${f(S.backdropLow)}, ${f(S.backdropHigh)}, noiseT(q, 1.0 / ${f(S.backdropWavelengthKm)}, ${S.backdropSalt}));
	float range = max(smoothstep(${f(S.rangeLow)}, ${f(S.rangeHigh)}, rangeN), backdrop);
	float ridge = ridgedT(q, ${f(S.ridgeWavelengthKm)}, ${S.ridgeOctaves}, 31);
	float upland = smoothstep(${f(S.uplandLow)}, ${f(S.uplandHigh)}, e);
	float mountains = ${f(S.mountainAmplitude)} * range * smoothstep(0.25, 0.8, ridge) * (0.7 + 0.3 * upland);
	return land * site * (hills + mountains);
}

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
	vec3 n = normalize(faceDir(uFace, vUv * 2.0 - 1.0));
	vec3 t1 = normalize(cross(n, abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
	vec3 t2 = cross(n, t1);
	float d = uTexel;
	float h0 = heightAt(n);
	float h1 = heightAt(normalize(n + t1 * d));
	float h2 = heightAt(normalize(n + t2 * d));
	vec3 g = ((h1 - h0) * t1 + (h2 - h0) * t2) / (d * uRadius);
	gl_FragColor = vec4(h0, g);
}
`;
