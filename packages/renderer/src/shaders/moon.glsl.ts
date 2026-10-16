/**
 * The moon's GLSL (ADR 0054): the twin of `@orbital/core` `moon-terrain.ts` (every constant comes
 * from `MOON_SHAPE`), the bakes that evaluate it into a cube map and camera-centred patches, and the
 * code injected into a `MeshStandardMaterial` so the moon is lit like every other object (sun,
 * shadows, image-based light, tone mapping) and displaced from the baked heights.
 */
import { MOON_SHAPE as S } from '@orbital/core';
import { hashNoiseGLSL } from './atmosphere.glsl.ts';

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

/** Lattice noise of the hills (`noiseT`, twin of `terrainNoise`): needs `hashNoiseGLSL`. */
const noiseGLSL = /* glsl */ `
float noiseT(vec3 q, float freq, int salt) {
	vec3 p = q * freq;
	vec3 fl = floor(p);
	ivec3 c = ivec3(fl) + ivec3(salt * 131, salt * 71, salt * 17);
	return valueNoiseCell(c, p - fl);
}
`;

const layers = S.scales
	.map(
		(s) => `h += craterLayer(q, ${f(s.cellKm)}, ${f(s.radius[0])}, ${f(s.radius[1])}, ${s.salt});`
	)
	.join('\n\t');

/** `moonHeight(n, radius)`: metres above the reference sphere of the unit body-fixed direction. */
export const moonHeightGLSL = /* glsl */ `
${hashNoiseGLSL}
${noiseGLSL}
float craterProfile(float x, float r) {
	float h = 0.0;
	if (x < 1.0) {
		float bowl = 1.0 - x * x;
		h -= ${f(S.depth)} * r * bowl * bowl;
	}
	float u = (x - 1.0) / ${f(S.rimWidth)};
	return h + ${f(S.rim)} * r * exp(-u * u);
}
float cellHash(ivec3 c, int salt, int k) {
	return hash13i(c + ivec3(salt * 131 + k * 7919, salt * 71 + k * 104729, salt * 17 + k * 1299709));
}
float craterLayer(vec3 q, float cellKm, float rMin, float rSpan, int salt) {
	ivec3 c0 = ivec3(floor(q / cellKm));
	float h = 0.0;
	for (int dx = -1; dx <= 1; dx++) {
		for (int dy = -1; dy <= 1; dy++) {
			for (int dz = -1; dz <= 1; dz++) {
				ivec3 c = c0 + ivec3(dx, dy, dz);
				vec3 centre = (vec3(c) + vec3(cellHash(c, salt, 1), cellHash(c, salt, 2), cellHash(c, salt, 3))) * cellKm;
				float r = cellKm * 1000.0 * (rMin + rSpan * cellHash(c, salt, 4));
				float x = length(q - centre) * 1000.0 / r;
				if (x < ${f(S.reach)}) h += craterProfile(x, r);
			}
		}
	}
	return h;
}
float moonHeight(vec3 n, float radius) {
	float relief = smoothstep(${f(S.plainFrom)}, ${f(S.plainTo)}, radius * acos(clamp(n.x, -1.0, 1.0)));
	if (relief <= 0.0) return ${f(S.base)};
	vec3 q = n * (radius / 1000.0);
	float h = 0.0;
	${layers}
	float hills = ${f(S.hillAmplitude)} * (noiseT(q, 1.0 / ${f(S.hillWavelengthKm)}, ${S.hillSalt}) - 0.5) * 2.0;
	return ${f(S.base)} + relief * (h + hills);
}
`;

export const moonBakeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Cube face bake: (hi, lo) of the height, hi a multiple of 16 m, so half floats keep centimetres. */
export const moonCubeFragment = /* glsl */ `
${moonHeightGLSL}
varying vec2 vUv;
uniform float uRadius;
uniform int uFace;
vec3 faceDir(int face, vec2 st) {
	if (face == 0) return vec3(1.0, -st.y, -st.x);
	if (face == 1) return vec3(-1.0, -st.y, st.x);
	if (face == 2) return vec3(st.x, 1.0, st.y);
	if (face == 3) return vec3(st.x, -1.0, -st.y);
	if (face == 4) return vec3(st.x, -st.y, 1.0);
	return vec3(-st.x, -st.y, -1.0);
}
void main() {
	float h = moonHeight(normalize(faceDir(uFace, vUv * 2.0 - 1.0)), uRadius);
	float hi = floor(h / 16.0) * 16.0;
	gl_FragColor = vec4(hi, h - hi, 0.0, 0.0);
}
`;

/** Patch bake: the height at the texel's direction, 32-bit float. */
export const moonPatchFragment = /* glsl */ `
${moonHeightGLSL}
varying vec2 vUv;
uniform float uRadius;
uniform vec3 uPatchC;
uniform vec3 uPatchE;
uniform vec3 uPatchF;
uniform float uHalfTan;
void main() {
	vec2 st = vUv * 2.0 - 1.0;
	vec3 n = normalize(uPatchC + uHalfTan * (st.x * uPatchE + st.y * uPatchF));
	gl_FragColor = vec4(moonHeight(n, uRadius), 0.0, 0.0, 0.0);
}
`;

/**
 * Pieces injected into the `MeshStandardMaterial` of a layer. `GLOBE` displaces an icosphere of unit
 * directions by the cube map; `PATCH` displaces a grid in patch coordinates by a float patch. Both
 * set the object-space position and the normal and pass the body-fixed direction on for the texture.
 */
export const moonVertexCommon = /* glsl */ `
uniform float uRadius;
varying vec3 vMoonN;
`;

export const moonGlobeVertex = /* glsl */ `
uniform samplerCube uCube;
uniform float uCubeOn;
float cubeHeight(vec3 n) {
	vec4 t = textureLod(uCube, n, 0.0);
	return (t.r + t.g) * uCubeOn;
}
vec3 globeNormal(vec3 n, float h) {
	vec3 t1 = normalize(cross(n, abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
	vec3 t2 = cross(n, t1);
	float d = 0.004;
	float h1 = cubeHeight(normalize(n + t1 * d));
	float h2 = cubeHeight(normalize(n + t2 * d));
	float m = d * uRadius;
	return normalize(n - t1 * ((h1 - h) / m) - t2 * ((h2 - h) / m));
}
`;

export const moonPatchVertex = /* glsl */ `
uniform sampler2D uPatch;
uniform float uTexels;
uniform vec3 uC;
uniform vec3 uE;
uniform vec3 uF;
uniform float uK;
uniform float uHc;
uniform float uDrop;
float patchFetch(ivec2 i) {
	int m = int(uTexels) - 1;
	return texelFetch(uPatch, clamp(i, ivec2(0), ivec2(m)), 0).r;
}
float patchHeight(vec2 st) {
	vec2 t = (st * 0.5 + 0.5) * uTexels - 0.5;
	vec2 fl = floor(t);
	vec2 fr = t - fl;
	ivec2 i = ivec2(fl);
	return mix(mix(patchFetch(i), patchFetch(i + ivec2(1, 0)), fr.x), mix(patchFetch(i + ivec2(0, 1)), patchFetch(i + ivec2(1, 1)), fr.x), fr.y);
}
// Twin of patchVertex in moon-model.ts: the vertex relative to the patch centre point.
vec3 patchPoint(vec2 st, float h) {
	vec3 w = st.x * uE + st.y * uF;
	float kk = uK * uK * dot(w, w);
	float L = sqrt(1.0 + kk);
	float s = kk / (L + 1.0);
	return ((uK * w - uC * s) * ((uRadius + h) / L)) + uC * (h - uHc);
}
vec3 patchDir(vec2 st) {
	return normalize(uC + uK * (st.x * uE + st.y * uF));
}
vec3 patchNormal(vec2 st, float h) {
	float ds = 2.0 / uTexels;
	float m = uK * uRadius * ds;
	float hu = patchHeight(st + vec2(ds, 0.0)) - patchHeight(st - vec2(ds, 0.0));
	float hv = patchHeight(st + vec2(0.0, ds)) - patchHeight(st - vec2(0.0, ds));
	vec3 n = patchDir(st);
	return normalize(n - uE * (hu / (2.0 * m)) - uF * (hv / (2.0 * m)));
}
`;

/** Replaces `begin_vertex` / `beginnormal_vertex` of the globe layer. */
export const moonGlobeBegin = /* glsl */ `
vec3 gN = normalize(position);
float gH = cubeHeight(gN);
vec3 transformed = gN * (uRadius + gH);
vMoonN = gN;
`;
export const moonGlobeNormal = /* glsl */ `
vec3 objectNormal = globeNormal(normalize(position), cubeHeight(normalize(position)));
`;

/** Patch layers: `position.xy` are patch coordinates, `position.z` is 1 on the skirt. */
export const moonPatchBegin = /* glsl */ `
vec2 pSt = position.xy;
float pH = patchHeight(pSt);
vec3 transformed = patchPoint(pSt, pH - position.z * uDrop);
vMoonN = patchDir(pSt);
`;
export const moonPatchNormal = /* glsl */ `
vec3 objectNormal = patchNormal(position.xy, patchHeight(position.xy));
`;

/** Fragment: regolith albedo with low- and high-frequency variation of the body-fixed direction. */
export const moonFragmentCommon = /* glsl */ `
varying vec3 vMoonN;
uniform float uRadius;
uniform vec3 uTint;
${hashNoiseGLSL}
float moonGrain(vec3 p) {
	vec3 fl = floor(p);
	return valueNoiseCell(ivec3(fl), p - fl);
}
`;
export const moonFragmentColor = /* glsl */ `
{
	vec3 mp = vMoonN * uRadius;
	float huge = moonGrain(mp * (1.0 / 60000.0));
	float broad = moonGrain(mp * (1.0 / 9000.0));
	float mid = moonGrain(mp * (1.0 / 140.0));
	float fine = moonGrain(mp * (1.0 / 3.0));
	float grit = moonGrain(mp * 1.7);
	// The plain around the landing site is a dark basin: its edge is a soft ring of lighter highlands.
	float arc = uRadius * acos(clamp(vMoonN.x, -1.0, 1.0));
	float basin = 1.0 - smoothstep(${f(S.plainFrom)} * 1.6, ${f(S.plainTo)} * 2.4, arc);
	float shade = 0.7 + 0.5 * (huge - 0.5) + 0.34 * broad + 0.2 * (mid - 0.5) + 0.16 * (fine - 0.5) + 0.1 * (grit - 0.5);
	diffuseColor.rgb = uTint * shade * (1.0 - 0.38 * basin);
}
`;

/** Small relief (stones, grain) as a bump on the shading normal; written after `normal_fragment_maps`. */
export const moonFragmentBump = /* glsl */ `
{
	vec3 bp = vMoonN * uRadius;
	// Stones: domed bumps where a lattice noise peaks, in patches (a quiet and a busy ground).
	float density = smoothstep(0.35, 0.7, moonGrain(bp * (1.0 / 24.0)));
	float big = smoothstep(0.62, 1.0, moonGrain(bp * (1.0 / 2.4)));
	float small = smoothstep(0.6, 1.0, moonGrain(bp * (1.0 / 0.7) + 17.0));
	float stones = density * (0.45 * big * big + 0.12 * small * small);
	float h = 0.03 * moonGrain(bp * 2.3) + 0.012 * moonGrain(bp * 9.0) + stones + 0.2 * moonGrain(bp * (1.0 / 6.0));
	vec2 dH = vec2(dFdx(h), dFdy(h));
	vec3 sx = dFdx(-vViewPosition);
	vec3 sy = dFdy(-vViewPosition);
	vec3 r1 = cross(sy, normal);
	vec3 r2 = cross(normal, sx);
	float det = dot(sx, r1);
	vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
	normal = normalize(abs(det) * normal - grad);
}
`;
