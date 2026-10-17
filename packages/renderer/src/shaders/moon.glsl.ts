/**
 * The moon's GLSL (ADR 0054): the twin of `@orbital/core` `moon-terrain.ts` (every constant comes
 * from `MOON_SHAPE`), the bakes that evaluate it into a cube map and camera-centred patches, and the
 * code injected into a `MeshStandardMaterial` so the moon is lit like every other object (sun,
 * shadows, image-based light, tone mapping) and displaced from the baked heights.
 */
import { CRATERS_SEED_SALT, MOON_SHAPE as S } from '@orbital/core';
import { STONES } from '../stones-model.ts';
import { SHADOW_MARCH as M } from '../terrain-shadow.ts';
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
		(s) =>
			`h += craterLayer(q, ${f(s.cellKm)}, ${f(s.radius[0])}, ${f(s.radius[1])}, ${s.salt} + seedShift);`
	)
	.join('\n\t');

/** `moonHeight(n, radius)`: metres above the reference sphere of the unit body-fixed direction. */
export const moonHeightGLSL = /* glsl */ `
uniform int uSeed;
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
	int seedShift = uSeed * ${CRATERS_SEED_SALT};
	vec3 q = n * (radius / 1000.0);
	float h = 0.0;
	${layers}
	float hills = ${f(S.hillAmplitude)} * (noiseT(q, 1.0 / ${f(S.hillWavelengthKm)}, ${S.hillSalt} + seedShift) - 0.5) * 2.0;
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
varying vec2 vPatchSt;
varying float vPatchH;
varying float vStoneShade;
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
vPatchSt = pSt;
vPatchH = pH;
`;
export const moonPatchNormal = /* glsl */ `
vec3 objectNormal = patchNormal(position.xy, patchHeight(position.xy));
`;

/**
 * Stones as domes of the world-fixed lattice of `stones-model.ts` (its GLSL twin; every constant
 * comes from `STONES`): the stones beyond the instanced radius, and the ones the instances replace.
 * Cell hashes are the same integers as the TypeScript side feeds `pcgX`.
 */
const stoneDomesGLSL = /* glsl */ `
float stoneHash(int face, int i, int j, int k) {
	return hash13i(ivec3(i + k * 7919, j + k * 104729, face * 131 + ${STONES.salt}));
}
float stoneDomes(vec3 n) {
	vec3 an = abs(n);
	int face;
	vec2 ab;
	if (an.x >= an.y && an.x >= an.z) { face = n.x > 0.0 ? 0 : 1; ab = vec2(n.y, n.z) / an.x; }
	else if (an.y >= an.z) { face = n.y > 0.0 ? 2 : 3; ab = vec2(n.z, n.x) / an.y; }
	else { face = n.z > 0.0 ? 4 : 5; ab = vec2(n.x, n.y) / an.z; }
	vec2 p = ab * uRadius;
	ivec2 c0 = ivec2(floor(p / ${f(STONES.cell)}));
	float best = 0.0;
	for (int dj = -1; dj <= 1; dj++) {
		for (int di = -1; di <= 1; di++) {
			int ci = c0.x + di;
			int cj = c0.y + dj;
			float r3 = hash13i(ivec3(int(floor(float(ci) / ${f(STONES.regionCells)})), int(floor(float(cj) / ${f(STONES.regionCells)})), face * 131 + ${STONES.salt + 1}));
			float chance = ${f(STONES.quiet)} + ${f(STONES.busy)} * r3 * r3 * r3;
			if (stoneHash(face, ci, cj, 0) >= chance) continue;
			vec2 centre = (vec2(float(ci), float(cj)) + 0.2 + 0.6 * vec2(stoneHash(face, ci, cj, 1), stoneHash(face, ci, cj, 2))) * ${f(STONES.cell)};
			float hr = stoneHash(face, ci, cj, 3);
			float radius = (${f(STONES.radiusMin)} + ${f(STONES.radiusSpan)} * hr * hr) * (stoneHash(face, ci, cj, 4) > ${f(1 - STONES.boulderChance)} ? ${f(STONES.boulderScale)} : 1.0);
			float x = length(p - centre) / radius;
			if (x < 1.0) { float w = 1.0 - x * x; best = max(best, ${f(STONES.flatten * (1 - STONES.sink))} * radius * w * w); }
		}
	}
	return best;
}
`;

/** Fragment: regolith albedo with low- and high-frequency variation of the body-fixed direction. */
export const moonFragmentCommon = /* glsl */ `
varying vec3 vMoonN;
varying vec2 vPatchSt;
varying float vPatchH;
varying float vStoneShade;
uniform float uRadius;
uniform vec3 uTint;
${hashNoiseGLSL}
float moonGrain(vec3 p) {
	vec3 fl = floor(p);
	return valueNoiseCell(ivec3(fl), p - fl);
}
${stoneDomesGLSL}
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
	// Stones: the lattice domes fade out where the instanced stones stand (they shrink as these grow),
	// plus a little noise-made gravel in patches (a quiet and a busy ground).
	float density = smoothstep(0.35, 0.7, moonGrain(bp * (1.0 / 24.0)));
	float small = smoothstep(0.6, 1.0, moonGrain(bp * (1.0 / 0.7) + 17.0));
	float viewDist = length(vViewPosition);
	float domeWeight = smoothstep(${f(STONES.instanceRadius * 0.6)}, ${f(STONES.instanceRadius * 0.84)}, viewDist);
	// beyond ~100 m a stone is smaller than a pixel: its bump would only alias, so it fades out
	float domeFar = 1.0 - smoothstep(${f(STONES.farFade[0])}, ${f(STONES.farFade[1])}, viewDist);
	float stones = domeWeight * domeFar * stoneDomes(vMoonN) + density * 0.12 * small * small;
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

/**
 * Terrain-cast shadows (ADR 0068): the sun's visibility at the fragment's ground point by a march
 * through the baked patch (and, beyond it, the next coarser one). The twin of `terrainSunVisibility`
 * in `terrain-shadow.ts`, with the same constants.
 */
export const moonShadowCommon = /* glsl */ `
uniform vec3 uSunBody;
uniform float uSunScale;
uniform float uShadowOn;
uniform int uShadowSteps;
uniform sampler2D uPatch;
uniform float uTexels;
uniform vec3 uC;
uniform vec3 uE;
uniform vec3 uF;
uniform float uK;
uniform sampler2D uSecPatch;
uniform float uSecTexels;
uniform vec3 uSecC;
uniform vec3 uSecE;
uniform vec3 uSecF;
uniform float uSecK;
uniform float uSecOn;
float shadowFetch(sampler2D t, int m, ivec2 i) {
	return texelFetch(t, clamp(i, ivec2(0), ivec2(m)), 0).r;
}
float shadowSample(sampler2D t, float texels, vec2 st) {
	vec2 q = (st * 0.5 + 0.5) * texels - 0.5;
	vec2 fl = floor(q);
	vec2 fr = q - fl;
	ivec2 i = ivec2(fl);
	int m = int(texels) - 1;
	return mix(mix(shadowFetch(t, m, i), shadowFetch(t, m, i + ivec2(1, 0)), fr.x), mix(shadowFetch(t, m, i + ivec2(0, 1)), shadowFetch(t, m, i + ivec2(1, 1)), fr.x), fr.y);
}
float moonSunVisibility(vec2 st, float h0, float lift) {
	vec3 n0 = normalize(uC + uK * (st.x * uE + st.y * uF));
	float mu = dot(n0, uSunBody);
	if (uShadowOn < 0.5) return 1.0;
	if (mu < ${f(M.nightSine)}) return 0.0;
	if (mu >= ${f(M.freeSine)}) return 1.0;
	float hh = h0 + lift;
	float r0 = uRadius + hh;
	float len = clamp(${f(M.relief)} / max(mu, ${f(M.minSine)}), ${f(M.minLength)}, ${f(M.maxDistance)});
	float vis = 1.0;
	for (int i = 1; i <= ${M.steps}; i++) {
		if (i > uShadowSteps) break;
		float fi = float(i) / float(uShadowSteps);
		float t = ${f(M.minDistance)} + (len - ${f(M.minDistance)}) * fi * fi;
		float d = hh * (2.0 * uRadius + hh) + 2.0 * t * r0 * mu + t * t;
		vec3 q = r0 * n0 + t * uSunBody;
		float hq = d / (length(q) + uRadius);
		float g;
		float dp = dot(q, uC);
		vec2 s = vec2(dot(q, uE), dot(q, uF)) / (dp * uK);
		if (dp > 0.0 && max(abs(s.x), abs(s.y)) < 0.98) {
			g = shadowSample(uPatch, uTexels, s);
		} else {
			float dq = dot(q, uSecC);
			vec2 s2 = vec2(dot(q, uSecE), dot(q, uSecF)) / (dq * uSecK);
			if (uSecOn < 0.5 || dq <= 0.0 || max(abs(s2.x), abs(s2.y)) >= 0.98) break;
			g = shadowSample(uSecPatch, uSecTexels, s2);
		}
		float a = (hq - g + ${f(M.biasAbsolute)} + ${f(M.biasPerMetre)} * t) / t;
		vis = min(vis, clamp(0.5 + 0.5 * a / ${f(M.sunRadius)}, 0.0, 1.0));
		if (vis < 0.002) return 0.0;
	}
	return vis;
}
`;

/** Written after the bump: the fragment's visibility, relative to the scaled sun light the vessel sees (`uSunScale`). */
export const moonShadowFragment = (lift: number): string => /* glsl */ `
float moonSunVis = moonSunVisibility(vPatchSt, vPatchH, ${f(lift)}) / uSunScale;
`;

/** Stones as instances (ADR 0068): `aStone` = (patch u, patch v, radius, yaw), `aShade`; set on the fine patch's mesh frame. */
export const moonStoneVertex = /* glsl */ `
uniform vec3 uStoneCam;
attribute vec4 aStone;
attribute float aStoneShade;
`;
export const moonStoneNormal = /* glsl */ `
vec2 sSt = aStone.xy;
float sH = patchHeight(sSt);
vec3 sUp = patchDir(sSt);
vec3 sT1 = normalize(cross(sUp, abs(sUp.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
vec3 sT2 = cross(sUp, sT1);
float sC = cos(aStone.w);
float sS = sin(aStone.w);
vec3 sAx = sT1 * sC + sT2 * sS;
vec3 sAz = sT2 * sC - sT1 * sS;
vec3 objectNormal = normalize(sAx * normal.x + sAz * normal.z + sUp * (normal.y / ${f(STONES.flatten)}));
`;
export const moonStoneBegin = /* glsl */ `
vec3 sBase = patchPoint(sSt, sH);
float sDist = distance(sBase, uStoneCam);
float sScale = aStone.z * (1.0 - smoothstep(${f(STONES.instanceRadius * 0.6)}, ${f(STONES.instanceRadius * 0.84)}, sDist));
vec3 transformed = sBase + (sAx * position.x + sAz * position.z) * sScale + sUp * ((position.y - ${f(STONES.sink)}) * ${f(STONES.flatten)} * sScale);
vMoonN = sUp;
vPatchSt = sSt;
vPatchH = sH;
vStoneShade = aStoneShade;
`;
export const moonStoneColor = /* glsl */ `
diffuseColor.rgb = uTint * (0.45 + 0.9 * vStoneShade);
`;
