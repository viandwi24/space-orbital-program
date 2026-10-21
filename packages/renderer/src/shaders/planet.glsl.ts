/**
 * The planet pass (ADR 0027): one screen-covering triangle; the fragment shader intersects the
 * view ray with the exact planet sphere and the atmosphere, shades ground / ocean / clouds / stars
 * / sun, and writes a logarithmic depth value so meshes and lines sort against it.
 */
import { NIGHT_SKY } from '../exposure.ts';
import {
	APRONS,
	FLOOD_LIGHT_INTENSITY,
	PAD_RADIUS,
	ROADS,
	SCORCH_RADIUS,
	floodLightPositions
} from '../site.ts';
import {
	BEACH_WIDTH,
	HIGHLAND,
	LAKE_SHAPE,
	SEA_LEVEL,
	TERRAIN_MAX_HEIGHT,
	TERRAIN_MAX_SLOPE
} from '@orbital/core';
import { atmosphereGLSL } from './atmosphere.glsl.ts';
import { SLOPE_EXAGGERATION, SLOPE_EXAGGERATION_RANGE } from '../terrain-model.ts';
import { TERRAIN_VEIL } from '../atmosphere-model.ts';
import { terrainNoiseGLSL, terrainTangentGLSL, terrainZonesGLSL } from './terrain.glsl.ts';
import { PATCH_BLEND } from '../terrain-patch.ts';
import { SHAFT, SHAFT_TERRAIN } from '../light-shaft.ts';
import { EDGE_CHROMA, EDGE_DEPTH_OCTAVES, SKY_DEPTH } from '../half-res.ts';
import { cloudFieldGLSL } from './cloud-field.glsl.ts';
import { auroraGLSL } from './aurora.glsl.ts';
import {
	CLOUD_FILL,
	CLOUD_GAIN_CAP,
	CLOUD_EXTRA_PATH,
	EROSION_FADE,
	EROSION_WEIGHTS,
	CLOUD_MAX_PATH,
	CLOUD_PHASE,
	CLOUD_RADIANCE_KNEE,
	CLOUD_SIGMA,
	CLOUD_SUN_BULK,
	CLOUD_SUN_MU_MIN,
	CLOUD_THICKNESS
} from '../cloud-volume.ts';
import { WAVES, WAVE_GRAVITY, WAVE_PERIOD, waveNumber, waveOmega } from '../water-model.ts';
import { FLOW_CYCLE, FLOW_SPEED } from '../water-flow.ts';
import {
	BEACH_SLOPE,
	BREAKER_INDEX,
	LAKE_WAVE_SHARE,
	SHORE_MIN_DISTANCE,
	SHORE_PERIOD,
	SHORE_WAVE_HEIGHT,
	shoreOmega
} from '../shore-wave.ts';
import {
	MARCH_BLOCK,
	MARCH_NO_HIT,
	STEP_FAR_FRACTION,
	STEP_MIN_FRACTION,
	STEP_MIN_METRES,
	STEP_RELAX,
	TERRAIN_MARCH_SLOPE_MIN
} from '../terrain-model.ts';

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

const siteConstants = (): string => /* glsl */ `
const float PAD_R = ${f(PAD_RADIUS)};
const float SCORCH_R = ${f(SCORCH_RADIUS)};
const int ROAD_N = ${ROADS.length};
const vec4 ROAD_SEG[${ROADS.length}] = vec4[](${ROADS.map((r) => `vec4(${f(r.ax)}, ${f(r.az)}, ${f(r.bx)}, ${f(r.bz)})`).join(', ')});
const float ROAD_W[${ROADS.length}] = float[](${ROADS.map((r) => f(r.width)).join(', ')});
const int FLOOD_N = ${floodLightPositions().length};
const vec3 FLOOD_POS[${floodLightPositions().length}] = vec3[](${floodLightPositions()
	.map((l) => `vec3(${f(l.x)}, ${f(l.y)}, ${f(l.z)})`)
	.join(', ')});
const float FLOOD_I = ${f(FLOOD_LIGHT_INTENSITY)};
const int APRON_N = ${APRONS.length};
const vec4 APRON_BOX[${APRONS.length}] = vec4[](${APRONS.map((a) => `vec4(${f(a.x)}, ${f(a.z)}, ${f(a.hx)}, ${f(a.hz)})`).join(', ')});
`;

/** Lakes, river flow and shore waves (plan 038): constants from the tested twins in core and the renderer. */
const waterConstants = (): string => /* glsl */ `
const float LAKE_WL = ${f(LAKE_SHAPE.wavelengthKm)};
const int LAKE_SALT = ${LAKE_SHAPE.salt};
const float LAKE_TO = ${f(LAKE_SHAPE.to)};
const float LAKE_SITE_FROM = ${f(LAKE_SHAPE.siteFrom)};
const float LAKE_SITE_TO = ${f(LAKE_SHAPE.siteTo)};
const float LAKE_GRAD = ${LAKE_SHAPE.gradientBound.toExponential()};
const float LAKE_DEPTH = ${f(LAKE_SHAPE.depthMetres)};
const float LAKE_RAMP = ${f(LAKE_SHAPE.depthRampMetres)};
const float LAKE_WAVE_SHARE = ${f(LAKE_WAVE_SHARE)};
const float FLOW_CYCLE = ${f(FLOW_CYCLE)};
const float FLOW_SPEED = ${f(FLOW_SPEED)};
const float SHORE_W = ${shoreOmega()};
const float SHORE_PERIOD = ${f(SHORE_PERIOD)};
const float SHORE_H = ${f(SHORE_WAVE_HEIGHT)};
const float SHORE_SLOPE = ${BEACH_SLOPE};
const float SHORE_XMIN = ${f(SHORE_MIN_DISTANCE)};
const float SHORE_GS = ${WAVE_GRAVITY * BEACH_SLOPE};
const float SHORE_BREAK = ${BREAKER_INDEX};
`;

const waveConstants = (): string => /* glsl */ `
const int WAVE_N = ${WAVES.length};
const float WAVE_LEN[${WAVES.length}] = float[](${WAVES.map((w) => f(w.wavelength)).join(', ')});
const float WAVE_K[${WAVES.length}] = float[](${WAVES.map((w) => f(waveNumber(w.wavelength))).join(', ')});
const float WAVE_A[${WAVES.length}] = float[](${WAVES.map((w) => f(w.amplitude)).join(', ')});
const float WAVE_W[${WAVES.length}] = float[](${WAVES.map((w) => f(waveOmega(w.wavelength))).join(', ')});
const float WAVE_PH[${WAVES.length}] = float[](${WAVES.map((w) => f(w.phase)).join(', ')});
const vec2 WAVE_DIR[${WAVES.length}] = vec2[](${WAVES.map((w) => `vec2(${f(Math.cos(w.direction))}, ${f(Math.sin(w.direction))})`).join(', ')});
const float WAVE_LOOP = ${f(WAVE_PERIOD)};
`;

export const planetVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
	vNdc = position.xy;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The terrain sampling and march shared by the planet pass and the march prepass (plan 039, ADR 0053):
 * baked heights (cube map, mid and fine patches), the sphere-traced march and the sun shadow march.
 * Expects `uR`, `uBodyInv`, `uPixelAngle` and `raySphere` from the includer.
 */
export const terrainMarchGLSL = /* glsl */ `
// 1: anti-aliased silhouettes (plan 133); 0 for the before/after screenshots (and in the march prepass)
uniform float uSilhouetteAA;
// --- terrain (ADR 0036) -------------------------------------------------------------------------
#if TERRAIN
uniform samplerCube uTerrain;
uniform float uTerrainOn;
uniform sampler2D uPatchFine;
uniform sampler2D uPatchMid;
uniform float uPatchLinear; // 1 when the float patches can be filtered by the hardware
// Camera-centred patches (ADR 0044): centre c, tangent axes e and f (unit, body-fixed), half width tan; on = 0 or 1.
uniform vec3 uFineC;
uniform vec3 uFineE;
uniform vec3 uFineF;
uniform vec2 uFineK;  // x: 1 / half width tangent, y: on
uniform vec3 uMidC;
uniform vec3 uMidE;
uniform vec3 uMidF;
uniform vec2 uMidK;
uniform float uSkipR;      // ground distance from the camera inside which terrain is flat, m
uniform sampler2D uMarchStart; // march prepass: where each block of pixels may first meet the ground (plan 039)
uniform float uMarchOn;
uniform float uMarchSteps; // steps the per-pixel march may take (the prepass crossed the rest)
const int MARCH_BLOCK = ${MARCH_BLOCK};
const float MARCH_NO_HIT = ${f(MARCH_NO_HIT)};
const float T_MAX = ${f(TERRAIN_MAX_HEIGHT)};
const float T_SLOPE = ${f(TERRAIN_MAX_SLOPE)};
const float T_SLOPE_MIN = ${f(TERRAIN_MARCH_SLOPE_MIN)};
const float T_RELAX = ${f(STEP_RELAX)};
const float T_MIN_FRAC = ${f(STEP_MIN_FRACTION)};
const float T_FAR_FRAC = ${f(STEP_FAR_FRACTION)};
const float T_MIN_M = ${f(STEP_MIN_METRES)};
${terrainTangentGLSL}

// Bilinear read of a 32-bit patch texel by hand (no float filtering needed): (height, g1, g2).
vec3 patchFetch(sampler2D tex, vec2 st) {
	// OES_texture_float_linear (most desktop GPUs): one filtered fetch; otherwise four by hand
	if (uPatchLinear > 0.5) return textureLod(tex, st * 0.5 + 0.5, 0.0).xyz;
	ivec2 size = textureSize(tex, 0);
	vec2 p = st * 0.5 * vec2(size) + 0.5 * vec2(size) - 0.5;
	vec2 f = fract(p);
	ivec2 i0 = ivec2(floor(p));
	ivec2 hi = size - 1;
	vec3 a = texelFetch(tex, clamp(i0, ivec2(0), hi), 0).xyz;
	vec3 b = texelFetch(tex, clamp(i0 + ivec2(1, 0), ivec2(0), hi), 0).xyz;
	vec3 c = texelFetch(tex, clamp(i0 + ivec2(0, 1), ivec2(0), hi), 0).xyz;
	vec3 d = texelFetch(tex, clamp(i0 + ivec2(1, 1), ivec2(0), hi), 0).xyz;
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Blends the baked texel of a patch into t (height, body-fixed gradient) where nB is inside its window.
vec4 blendPatch(vec4 t, sampler2D tex, vec3 nB, vec3 c, vec3 e, vec3 fa, vec2 k) {
	if (k.y < 0.5) return t;
	float d = dot(nB, c);
	if (d < 0.5) return t;
	vec2 uv = vec2(dot(nB, e), dot(nB, fa)) * (k.x / d);
	float m = max(abs(uv.x), abs(uv.y));
	if (m >= 1.0) return t;
	float w = 1.0 - smoothstep(${f(PATCH_BLEND.start)}, ${f(PATCH_BLEND.end)}, m);
	vec3 q = patchFetch(tex, uv);
	vec3 t1 = terrainTangent1(nB);
	vec4 p = vec4(q.x, q.y * t1 + q.z * cross(nB, t1));
	return mix(t, p, w);
}

// Height (x, m) and body-fixed tangent gradient (yzw) at a position relative to the planet centre:
// the cube map, with the mid and fine patches blended in where the camera has them.
vec4 terrainAt(vec3 pI) {
	vec3 nB = uBodyInv * (pI / length(pI));
	vec4 t = decodeTerrain(textureLod(uTerrain, nB, 0.0), nB);
	t = blendPatch(t, uPatchMid, nB, uMidC, uMidE, uMidF, uMidK);
	t = blendPatch(t, uPatchFine, nB, uFineC, uFineE, uFineF, uFineK);
	return t;
}

// Height and gradient magnitude only (the march and the shadow need no direction): the tangent basis
// is orthonormal, so the magnitude is the length of the two stored components.
float terrainH(vec3 pI, out float gmag) {
	vec3 nB = uBodyInv * (pI / length(pI));
	float h = 0.0;
	gmag = 0.0;
	float wFine = 0.0;
	vec3 qFine = vec3(0.0);
	if (uFineK.y > 0.5) {
		float d = dot(nB, uFineC);
		if (d > 0.5) {
			vec2 uv = vec2(dot(nB, uFineE), dot(nB, uFineF)) * (uFineK.x / d);
			float m = max(abs(uv.x), abs(uv.y));
			if (m < 1.0) {
				wFine = 1.0 - smoothstep(${f(PATCH_BLEND.start)}, ${f(PATCH_BLEND.end)}, m);
				qFine = patchFetch(uPatchFine, uv);
				// well inside the fine patch nothing else is read
				if (wFine >= 1.0) {
					gmag = length(qFine.yz);
					return qFine.x;
				}
			}
		}
	}
	// The mid patch is read first: well inside it the cube map is not needed at all (one fetch saved per
	// march step over most of a ground-level view, plan 039).
	float wMid = 0.0;
	vec3 qMid = vec3(0.0);
	if (uMidK.y > 0.5) {
		float d = dot(nB, uMidC);
		if (d > 0.5) {
			vec2 uv = vec2(dot(nB, uMidE), dot(nB, uMidF)) * (uMidK.x / d);
			float m = max(abs(uv.x), abs(uv.y));
			if (m < 1.0) {
				wMid = 1.0 - smoothstep(${f(PATCH_BLEND.start)}, ${f(PATCH_BLEND.end)}, m);
				qMid = patchFetch(uPatchMid, uv);
			}
		}
	}
	if (wMid >= 1.0) {
		h = qMid.x;
		gmag = length(qMid.yz);
	} else {
		vec4 t = textureLod(uTerrain, nB, 0.0);
		h = t.r + t.g;
		gmag = length(t.ba);
		if (wMid > 0.0) {
			h = mix(h, qMid.x, wMid);
			gmag = mix(gmag, length(qMid.yz), wMid);
		}
	}
	if (wFine > 0.0) {
		h = mix(h, qFine.x, wFine);
		gmag = mix(gmag, length(qFine.yz), wFine);
	}
	return h;
}

// Height of the ray point at distance t above the sea sphere. length(p) - uR loses 6 cm of float32
// at 600 km (stair steps on grazing rays); (|p|^2 - R^2) / (|p| + R) expands |p|^2 from the camera.
float rayAltitude(float r0, float d, float t, vec3 p) {
	float h0 = r0 - uR;
	return (h0 * (2.0 * uR + h0) + 2.0 * r0 * t * d + t * t) / (length(p) + uR);
}

// Sphere-traces the baked heights from the camera ray; true with the hit distance in tOut.
// tFrom: where the march prepass proved the terrain cannot be hit before (0 without it).
// sMin/tMin (plan 133): a miss's closest clearance in pixel footprints and where it was, negative when
// the ray crossed a crest between two samples (twin: marchTerrain in terrain-model.ts)
bool marchTerrain(vec3 ro, vec3 rd, float r0, float d, float tLimit, float tFrom, out float tOut, out float sMin, out float tMin) {
	tOut = 0.0;
	sMin = 1e9;
	tMin = 0.0;
	float tP = 0.0, cP = 1e9, cM = 1e9, tN = 0.0, cN = -1.0;
	bool grabNext = false;
	vec2 shell = raySphere(r0, d, uR + T_MAX);
	if (shell.y <= 0.0) return false;
	float t = max(shell.x, 0.0);
	float tEnd = min(shell.y, tLimit);
	if (uSkipR > 0.0) t = max(t, uSkipR / sqrt(max(1.0 - d * d, 0.0025)));
	t = max(t, tFrom);
	if (t >= tEnd) return false;
	float tPrev = t;
	float cPrev = 1.0;
	float cHit = -1.0;
	bool hit = false;
	float gm = 0.0;
	for (int i = 0; i < TERRAIN_STEPS; i++) {
		if (float(i) >= uMarchSteps) break;
		vec3 p = ro + rd * t;
		float r = length(p);
		float c = rayAltitude(r0, d, t, p) - terrainH(p, gm);
		if (c < 0.0) {
			hit = true;
			cHit = c;
			break;
		}
		// the closest sample, the one before it and the one after it (for the parabola after the loop)
		float sc = c / max(t * uPixelAngle, 1e-6);
		if (grabNext) {
			tN = t;
			cN = c;
			grabNext = false;
		}
		if (sc < sMin) {
			sMin = sc;
			tMin = t;
			cM = c;
			tP = tPrev;
			cP = cPrev;
			grabNext = true;
		}
		float mu = dot(rd, p / r);
		float dt = max(max(t * mix(T_MIN_FRAC, T_FAR_FRAC, smoothstep(50.0, 500.0, t)), t * uPixelAngle * 1.5), T_MIN_M);
		// Safe step from the local slope (twice the baked gradient plus a margin, at most the global
		// bound): gentle ground allows steps several times longer, which is what reaches the horizon
		// from a camera lying close to the ground (48 steps at the global bound reach 240 m).
		float slope = clamp(2.0 * gm + T_SLOPE_MIN, T_SLOPE_MIN, T_SLOPE);
		dt = max(dt, T_RELAX * c / (slope + max(-mu, 0.0)));
		float tStart = t;
		tPrev = t;
		cPrev = c;
		if (c < dt * 0.5) {
			// the step is longer than the clearance is safe for: look inside it so a thin crest is not skipped
			for (int j = 1; j < 3; j++) {
				float ts = tStart + dt * float(j) / 3.0;
				if (ts >= tEnd) break;
				vec3 ps = ro + rd * ts;
				float cs = rayAltitude(r0, d, ts, ps) - terrainH(ps, gm);
				if (cs < 0.0) {
					hit = true;
					t = ts;
					cHit = cs;
					break;
				}
				tPrev = ts;
				cPrev = cs;
			}
			if (hit) break;
		}
		t = tStart + dt;
		if (t >= tEnd) {
			t = tEnd;
			vec3 pe = ro + rd * t;
			cHit = rayAltitude(r0, d, t, pe) - terrainH(pe, gm);
			hit = cHit < 0.0;
			break;
		}
	}
	if (!hit) {
		// the closest approach lies between samples (plan 133): where a parabola through the closest
		// sample and its neighbours has its lowest point, read the real clearance once, for a near pass
		// only; below zero, the ray crossed a crest between the samples and main takes it as a hit there
		if (uSilhouetteAA > 0.5 && sMin < 1.5 && cN >= 0.0 && tN > tMin && tMin > tP && cM <= cP && cM <= cN) {
			float x1 = tP - tMin;
			float x3 = tN - tMin;
			float den = x1 * x3 * (x1 - x3);
			if (abs(den) > 1e-6) {
				float pa = (x3 * (cP - cM) - x1 * (cN - cM)) / den;
				float pb = (x1 * x1 * (cN - cM) - x3 * x3 * (cP - cM)) / den;
				if (pa > 0.0) {
					float tv = tMin + clamp(-pb / (2.0 * pa), x1, x3);
					vec3 pv = ro + rd * tv;
					float cv = rayAltitude(r0, d, tv, pv) - terrainH(pv, gm);
					float sv = cv / max(tv * uPixelAngle, 1e-6);
					if (sv < sMin) {
						sMin = sv;
						tMin = tv;
					}
				}
			}
		}
		return false;
	}
	// Illinois (regula falsi): the bracket [tPrev, t] holds one crossing of a smooth height field;
	// 5 evaluations land within millimetres where 10 bisections would be needed.
	float lo = tPrev;
	float hi = t;
	float fLo = cPrev;
	float fHi = cHit;
	int side = 0;
	for (int k = 0; k < 5; k++) {
		float mid = lo + (hi - lo) * fLo / (fLo - fHi);
		vec3 p = ro + rd * mid;
		float fm = rayAltitude(r0, d, mid, p) - terrainH(p, gm);
		if (fm < 0.0) {
			hi = mid;
			fHi = fm;
			if (side == -1) fLo *= 0.5;
			side = -1;
		} else {
			lo = mid;
			fLo = fm;
			if (side == 1) fHi *= 0.5;
			side = 1;
		}
	}
	tOut = hi;
	return true;
}

// Fraction of the sun that reaches a terrain point: a short march of the horizon toward the sun.
float terrainShadow(vec3 pI, vec3 sunI) {
	float vis = 1.0;
	float s = 90.0;
	for (int i = 0; i < TERRAIN_SHADOW_STEPS; i++) {
		vec3 q = pI + sunI * s;
		float gs;
		float c = length(q) - uR - terrainH(q, gs);
		vis = min(vis, clamp(c / (0.12 * s) + 0.05, 0.0, 1.0));
		s *= 2.2;
	}
	return vis;
}
#endif
`;

export const planetFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${atmosphereGLSL}
${siteConstants()}
${waveConstants()}
${waterConstants()}

varying vec2 vNdc;

uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec3 uCamPos;      // camera, render space
uniform vec3 uCamUp;       // unit radial of the camera (inertial)
uniform float uAlt;        // camera altitude above the sphere, m (float64 on the CPU)
uniform float uPixelAngle; // rad per pixel at the screen centre
uniform vec3 uSunDir;      // toward the sun, inertial
uniform vec3 uSunBF;       // toward the sun, body-fixed
uniform mat3 uBodyInv;     // inertial -> body-fixed
uniform vec3 uCamLocal;    // camera minus anchor, body-fixed, m
uniform vec3 uAnchorCell;  // anchor / 1024 m, integers
uniform vec3 uCamToSite;   // camera minus launch site, body-fixed, m
uniform vec3 uSiteEast;
uniform vec3 uSiteNorth;
uniform vec3 uSiteUp;
uniform sampler2D uMap;
uniform float uMapTexel;   // metres per map texel at the equator
uniform vec3 uAmbient;     // sky irradiance at the camera (already times PI)
uniform float uAmbientRefMu;
uniform vec3 uSkyColour;   // mean sky radiance at the camera (ocean reflection)
uniform float uCloudCover;
uniform float uCloudAngle;
uniform float uCloudAlt;
uniform float uCloudTop;
uniform float uCirrusAlt;
uniform float uStarBright;
uniform float uShadowOn;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowBias;
uniform float uShadowTexel;
uniform float uSiteRadius;
uniform float uSiteLamps;
uniform float uTime;           // seconds, wrapped at the wave period
uniform float uPackDepth;      // 1 on the half-resolution rung: alpha carries the fragment depth (plan 050)
uniform float uEdgeOnly;       // 1 in the edge pass of the half rung: only pixels whose half-resolution texels disagree are drawn (plan 056)
uniform sampler2D uEdgeHalf;   // the half-resolution target (rgb radiance, a depth)
uniform vec2 uEdgeFullSize;
uniform vec2 uEdgeHalfSize;
uniform float uEdgeOctaves;    // log2(far + 1)
uniform float uMarchScale;     // march prepass texels per pixel of this draw, relative to the pass's own size (0.5 in the edge pass)
// half-res.ts isEdgePixel
bool halfEdge(vec2 fragCoord) {
	vec2 p = fragCoord / uEdgeFullSize * uEdgeHalfSize - 0.5;
	vec2 base = floor(p);
	vec2 f = p - base;
	ivec2 hi = ivec2(uEdgeHalfSize) - 1;
	ivec2 i0 = clamp(ivec2(base), ivec2(0), hi);
	ivec2 i1 = clamp(ivec2(base) + 1, ivec2(0), hi);
	vec4 t0 = texelFetch(uEdgeHalf, ivec2(i0.x, i0.y), 0);
	vec4 t1 = texelFetch(uEdgeHalf, ivec2(i1.x, i0.y), 0);
	vec4 t2 = texelFetch(uEdgeHalf, ivec2(i0.x, i1.y), 0);
	vec4 t3 = texelFetch(uEdgeHalf, ivec2(i1.x, i1.y), 0);
	float ref = (f.y >= 0.5) ? ((f.x >= 0.5) ? t3.a : t2.a) : ((f.x >= 0.5) ? t1.a : t0.a);
	vec4 d = abs(vec4(t0.a, t1.a, t2.a, t3.a) - ref) * uEdgeOctaves;
	if (max(max(d.x, d.y), max(d.z, d.w)) > ${f(EDGE_DEPTH_OCTAVES)}) return true;
	if (min(min(t0.a, t1.a), min(t2.a, t3.a)) < ${f(SKY_DEPTH)}) return false;
	vec4 c = vec4(t0.b - t0.r, t1.b - t1.r, t2.b - t2.r, t3.b - t3.r) / max(vec4(t0.b + t0.r, t1.b + t1.r, t2.b + t2.r, t3.b + t3.r), vec4(1e-6));
	return max(max(c.x, c.y), max(c.z, c.w)) - min(min(c.x, c.y), min(c.z, c.w)) > ${f(EDGE_CHROMA)};
}
uniform float uWaveAnchor[${WAVES.length}]; // phase of each wave at the anchor, rad  // 0 by day, 1 at night: the mast floodlights are on

const float SEA = ${f(SEA_LEVEL)};
// metres of coast distance per metre of ground: the detail octaves make the coast 3 to 5 times as steep as the map
const float COAST_SLOPE_FACTOR = 4.0;
const float BEACH = ${f(BEACH_WIDTH)};
const float HIGH = ${f(HIGHLAND)};
const float SUN_ANGULAR_RADIUS = 0.0055;
const float SUN_DISC_RADIANCE = 70.0;
const vec3 NIGHT_AMBIENT = vec3(${NIGHT_SKY.map(f).join(', ')});

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Value noise whose lattice cell is (floor(pl / lam) + anchorCell * 1024 / lam): exact for lam = 1024 / 2^k.
float noiseA(vec3 pl, float lam, int salt) {
	vec3 f = pl / lam;
	vec3 fl = floor(f);
	ivec3 c = ivec3(fl) + ivec3(uAnchorCell) * int(1024.0 / lam + 0.5) + ivec3(salt * 131, salt * 71, salt * 17);
	return valueNoiseCell(c, f - fl);
}

${terrainNoiseGLSL}
${terrainZonesGLSL}

${cloudFieldGLSL}
#if AURORA_STEPS > 0
${auroraGLSL}
#endif

${terrainMarchGLSL}

// --- clouds -----------------------------------------------------------------------------------
vec3 rotY(vec3 v, float a) {
	float c = cos(a), s = sin(a);
	return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
float cloudDensityO(vec3 dirBF, bool full, float fp, int octaves) {
	return cloudDensityQ(rotY(dirBF, uCloudAngle) * (uR / 16000.0), full, fp, octaves);
}
float cloudDensity(vec3 dirBF, bool full, float fp) {
	return cloudDensityO(dirBF, full, fp, CLOUD_OCTAVES);
}

// --- light shafts (plan 054, ADR 0070; the twin of shaftDeficit in light-shaft.ts) --------------------
#if SHAFT_STEPS > 0 || CLOUD_SHADOW_MAP
uniform sampler2D uCloudMap; // baked cloud map, equirectangular: r coverage (shafts), g density (ground shadows) (planet.ts bakeCloudMap, light-shaft.ts cloudMapUV)
vec2 cloudMapAt(vec3 rq) {
	return texture(uCloudMap, vec2(atan(rq.z, rq.x) * 0.15915494 + 0.5, asin(clamp(rq.y, -1.0, 1.0)) * 0.31830989 + 0.5)).rg;
}
#endif
#if SHAFT_STEPS > 0
uniform float uShaft; // 0..1, light-shaft.ts shaftStrength: 0 by a high sun, at night and from orbit
struct ShaftLoss {
	vec3 all; // Mie in-scatter (before the boost) the cloud shadows remove from the whole path
	vec3 toA; // ... from the samples in front of the first snapshot distance tcA
	vec3 toB; // ... in front of tcB
};
#if SHAFT_TERRAIN > 0 && TERRAIN
// Share of the sun the ground blocks at sample p (position from the planet centre, altitude h above the sea sphere, sun height sunMu):
// the smallest clearance of the sun ray over the baked heights at SHAFT_TERRAIN points (terrainReach and terrainVisibility in light-shaft.ts).
float terrainShaftOcc(vec3 p, vec3 l, float h, float sunMu) {
	float reach = min(${f(SHAFT_TERRAIN.maxReach)}, (${f(SHAFT_TERRAIN.topHeight)} - h) / max(sunMu, ${f(SHAFT_TERRAIN.minMu)}));
	if (reach <= 0.0) return 0.0;
	float vis = 1.0;
	for (int k = 0; k < SHAFT_TERRAIN; k++) {
		float fk = float(k + 1) / float(SHAFT_TERRAIN);
		float s = reach * fk * fk;
		vec3 q = p + l * s;
		// the baked cube alone: a kilometre-scale shadow needs none of the camera-centred patches (their windows are 4 and 33 km)
		vec4 tq = textureLod(uTerrain, uBodyInv * (q / length(q)), 0.0);
		float c = length(q) - uR - (tq.r + tq.g);
		vis = min(vis, clamp(c / (${f(SHAFT_TERRAIN.penumbra)} * max(sunMu, ${f(SHAFT_TERRAIN.minPenumbraMu)}) * s), 0.0, 1.0));
	}
	return 1.0 - vis;
}
#endif
// A second, denser march along the ray: a sample under the cumulus slab loses the share of its sun that the slab
// blocks where its sun ray crosses it (coverage at the middle of the slab, read from the baked map).
ShaftLoss shaftLoss(vec3 ro, vec3 rd, float t0, float t1, vec3 l, float jitter, float tcA, float tcB) {
	ShaftLoss o;
	o.all = vec3(0.0);
	o.toA = vec3(0.0);
	o.toB = vec3(0.0);
	float len = max(min(t1, t0 + ${f(SHAFT.range)}) - t0, 0.0);
	float mieK = uBetaM / 1.1 * miePhase(dot(rd, l), uMieG);
	float mask = clamp(uCloudCover * 2.0, 0.0, 1.0);
	float midAlt = uCloudAlt + ${f(CLOUD_THICKNESS / 2)};
	vec3 od = vec3(0.0);
	for (int i = 0; i < SHAFT_STEPS; i++) {
		float u = (float(i) + jitter) / float(SHAFT_STEPS);
		float s = t0 + len * u * u;
		float ds = len * 2.0 * u / float(SHAFT_STEPS);
		vec3 p = ro + rd * s;
		float rr = length(p);
		float h = max(rr - uR, 0.0);
		float dM = exp(-h / uHM) * ds;
		od += vec3(exp(-h / uHR) * ds, dM, ozoneDensity(h) * ds);
		vec3 np = p / rr;
		float sunMu = dot(np, l);
		if (sunMu < ${f(SHAFT.minSunMu)}) continue;
		vec3 sd = sunDepth(p, l);
		if (sd.x < 0.0) continue;
		float occ = 0.0;
		if (rr < uCloudTop) { // under the top of the clouds: the slab can block the sun
			float tq = rr < midAlt ? max(raySphere(rr, sunMu, midAlt).y, 0.0) : 0.0;
			vec3 q = p + l * tq;
			vec3 rq = rotY(uBodyInv * (q / length(q)), uCloudAngle);
			float cover = cloudMapAt(rq).r * mask;
			occ = (1.0 - smoothstep(uCloudAlt, uCloudTop, rr)) * ${f(1 - SHAFT.leak)} * (1.0 - exp(-${f(SHAFT.tau)} * cover / max(sunMu, ${f(SHAFT.muMin)})))
				* (1.0 - smoothstep(${f(SHAFT.fadeFrom)}, ${f(SHAFT.fadeTo)}, tq));
		}
#if SHAFT_TERRAIN > 0 && TERRAIN
		if (uTerrainOn > 0.5) occ = 1.0 - (1.0 - occ) * (1.0 - terrainShaftOcc(p, l, h, sunMu));
#endif
		if (occ <= 0.0) continue;
		vec3 loss = extinction(od + sd) * (mieK * dM * occ);
		o.all += loss;
		if (s < tcA) o.toA += loss;
		if (s < tcB) o.toB += loss;
	}
	return o;
}
#endif

// Cirrus: thin streaks stretched along the wind, high above the cumulus.
float cirrusDensity(vec3 dirBF) {
	vec3 p = rotY(dirBF, uCloudAngle * 1.7 + 1.3) * (uR / 26000.0);
	float mask = noiseF(p * vec3(0.18, 0.5, 0.5) + 4.0);
	if (mask < 0.3) return 0.0;
	p += 0.5 * (noiseF3(p * 0.6 + 7.1) - 0.5);
	vec3 q = p * vec3(0.25, 1.0, 1.0);
	float n = fbmF(q, 2);
	float streak = fbmF(q * vec3(2.2, 8.0, 8.0) + 11.0, 2);
	float cover = smoothstep(0.3, 0.62, mask) * smoothstep(0.42, 0.7, n);
	return clamp(cover * (0.2 + 1.0 * streak) * 0.42, 0.0, 1.0);
}

// --- cumulus slab (plan 037, ADR 0059; the twin of cloud-volume.ts) --------------------------------
const float CLOUD_SIGMA = ${f(CLOUD_SIGMA)};
const float CLOUD_THICK = ${f(CLOUD_THICKNESS)};
const float CLOUD_MAX_PATH = ${f(CLOUD_MAX_PATH)};
const float CLOUD_EXTRA_PATH = ${f(CLOUD_EXTRA_PATH)};
const float CLOUD_SUN_BULK = ${f(CLOUD_SUN_BULK)};
const float CLOUD_SUN_MU_MIN = ${f(CLOUD_SUN_MU_MIN)};
float cloudProfile(float h, float cover) {
	float top = 0.4 + 0.6 * clamp(cover, 0.0, 1.0);
	return smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(top * 0.55, top, h));
}
// Dual-lobe phase through three octaves of the multiple-scattering stand-in; tau = optical depth toward the sun.
float cloudMultiScatter(float tau, float c) {
	float sum = 0.0;
	float a = 1.0;
	float b = 1.0;
	float k = 1.0;
	for (int n = 0; n < 3; n++) {
		float ph = ${f(CLOUD_PHASE.weight)} * miePhase(c, ${f(CLOUD_PHASE.forward)} * b) + ${f(1 - CLOUD_PHASE.weight)} * miePhase(c, ${f(CLOUD_PHASE.back)} * b);
		sum += a * ph * exp(-tau * k);
		a *= 0.5;
		b *= 0.5;
		k *= 0.5;
	}
	return sum;
}
float cloudFill(float tau, float h) {
	return ${f(CLOUD_FILL)} * (0.7 + 0.3 * clamp(h, 0.0, 1.0)) * (0.6 + 0.4 * exp(-0.35 * tau));
}
float cloudScatterGain(float tau, float c) {
	return min(4.0 * kPI * cloudMultiScatter(tau, c), ${f(CLOUD_GAIN_CAP)});
}
float cloudBillowShade(float e) {
	return 0.6 + 0.4 * smoothstep(0.2, 0.8, e);
}
float cloudPowder(float localTau, float c) {
	float p = 1.0 - exp(-2.0 * localTau);
	return 1.0 + (p - 1.0) * 0.6 * (0.5 - 0.5 * c);
}
float cloudSunDepth(float h, float cover, float mu) {
	float m = max(mu, CLOUD_SUN_MU_MIN);
	float sum = 0.0;
	for (int i = 1; i <= 3; i++) sum += cloudProfile(h + (1.0 - h) * float(i) / 3.5, cover);
	return CLOUD_SUN_BULK * CLOUD_SIGMA * cover * (CLOUD_THICK * (1.0 - h)) * sum / (3.0 * m);
}
// Billow erosion: up to three octaves of value noise (cells of 210, 70 and 25 m), each faded out when a pixel is wider
// than it, the sum stretched around 0.5 (twin: erosion in cloud-volume.ts). oct is the number of octaves taken.
float cloudErosion(vec3 dirBF, float fp, int oct) {
	vec3 q = rotY(dirBF, uCloudAngle) * (uR / 16000.0);
	float e = ${f(EROSION_WEIGHTS[0])} * mix(0.5, noiseF(q * 75.0 + 5.0), 1.0 - smoothstep(${f(EROSION_FADE[0]![0])}, ${f(EROSION_FADE[0]![1])}, fp));
	float w1 = 1.0 - smoothstep(${f(EROSION_FADE[1]![0])}, ${f(EROSION_FADE[1]![1])}, fp);
	float w2 = 1.0 - smoothstep(${f(EROSION_FADE[2]![0])}, ${f(EROSION_FADE[2]![1])}, fp);
	float n1 = 0.5;
	float n2 = 0.5;
	if (oct > 1 && w1 > 0.001) n1 = mix(0.5, noiseF(q * 220.0 + 17.0), w1);
	if (oct > 2 && w2 > 0.001) n2 = mix(0.5, noiseF(q * 610.0 + 29.0), w2);
	e += ${f(EROSION_WEIGHTS[1])} * n1 + ${f(EROSION_WEIGHTS[2])} * n2;
	return clamp((e - 0.5) * 2.0 + 0.5, 0.0, 1.0);
}
float cloudSlabDensity(float cover, float h, float e) {
	float base = 1.2 * cover * cloudProfile(h + (e - 0.5) * 0.7, cover);
	return clamp(base - (1.0 - e) * 0.75, 0.0, 1.0);
}

// --- stars ------------------------------------------------------------------------------------
vec3 stars(vec3 rd, float px) {
	vec3 col = vec3(0.0);
	for (int layer = 0; layer < 3; layer++) {
		float scale = 55.0 * pow(2.1, float(layer));
		vec3 p = rd * scale;
		vec3 cell = floor(p);
		vec3 h = hash33i(ivec3(cell) + ivec3(layer * 977));
		vec3 pos = cell + 0.2 + 0.6 * h;
		float d = length(p - pos);
		float rad = max(0.5 * px * scale, 0.02);
		float mag = pow(hash13i(ivec3(cell) + ivec3(layer * 31 + 5)), 14.0);
		float w = smoothstep(rad, 0.0, d) * mag * (0.5 + 3.5 * h.x);
		vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), h.y);
		col += tint * w * (layer == 0 ? 6.0 : 3.0);
	}
	// A faint milky band along a tilted great circle.
	vec3 gal = normalize(vec3(0.3, 0.8, 0.5));
	float gd = dot(rd, gal) / 0.16;
	float band = exp(-gd * gd);
	float clumps = fbmF(rd * 5.0 + 11.0, 4);
	col += vec3(0.55, 0.6, 0.8) * band * (0.012 + 0.07 * clumps * clumps);
	return col * uStarBright;
}

// --- ground -----------------------------------------------------------------------------------
float shadowFactor(vec3 posRender) {
	if (uShadowOn < 0.5) return 1.0;
	vec4 sc = uShadowMatrix * vec4(posRender, 1.0);
	sc.xyz /= sc.w;
	if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
	float z = sc.z + uShadowBias;
	float s = 0.0;
	for (int i = -1; i <= 1; i++) {
		for (int j = -1; j <= 1; j++) {
			s += texture(uShadowMap, vec3(sc.xy + vec2(float(i), float(j)) * uShadowTexel, z));
		}
	}
	return s / 9.0;
}

struct Surface {
	vec3 albedo;
	vec3 normal;  // body-fixed
	float spec;   // 0 ground, 1 water
	float waterDepth;
	vec3 lampE;   // irradiance from the site floodlights
};

float distToSeg(vec2 p, vec2 a, vec2 b) {
	vec2 ab = b - a;
	float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
	return length(p - (a + ab * t));
}

// Paved areas of the launch site; returns paving amount in x, writes the colour and a dirt amount.
float sitePaving(vec2 q, inout vec3 colour, out float dirt, float px) {
	float pave = 0.0;
	dirt = 0.0;
	vec3 concrete = vec3(0.34, 0.335, 0.32);
	float dPad = length(q);
	float padEdge = PAD_R - dPad;
	float paving = smoothstep(-px, px, padEdge);
	vec3 c = concrete * (0.9 + 0.2 * noiseF(vec3(q * 0.35, 1.0)));
	// slab joints every 5 m
	vec2 g = abs(fract(q / 5.0 + 0.5) - 0.5) * 5.0;
	c *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.06 + px, min(g.x, g.y)));
	// scorch and soot under the engines
	float scorch = (1.0 - smoothstep(SCORCH_R * 0.4, SCORCH_R * 1.8, dPad)) * (0.6 + 0.4 * noiseF(vec3(q * 0.6, 3.0)));
	c = mix(c, vec3(0.045, 0.04, 0.04), clamp(scorch, 0.0, 0.92));
	// painted ring and cross
	float ring = 1.0 - smoothstep(0.2, 0.2 + px + 0.25, abs(dPad - (PAD_R - 1.4)));
	float cross1 = (1.0 - smoothstep(0.15, 0.4 + px, min(abs(q.x), abs(q.y)))) * step(dPad, PAD_R - 2.4) * step(SCORCH_R * 1.6, dPad);
	c = mix(c, vec3(0.75, 0.74, 0.7), max(ring, cross1 * 0.8));
	colour = mix(colour, c, paving);
	pave = paving;
	dirt = max(dirt, (1.0 - smoothstep(0.0, 6.0, -padEdge)) * (1.0 - paving) * 0.8);

	for (int i = 0; i < ROAD_N; i++) {
		vec4 s = ROAD_SEG[i];
		float d = distToSeg(q, s.xy, s.zw);
		float hw = ROAD_W[i] * 0.5;
		float m = smoothstep(-px, px, hw - d);
		vec3 asphalt = vec3(0.075, 0.075, 0.08) * (0.85 + 0.3 * noiseF(vec3(q * 0.8, 5.0)));
		// dashed centre line
		float along = dot(q - s.xy, normalize(s.zw - s.xy));
		float dash = step(0.5, fract(along / 6.0)) * (1.0 - smoothstep(0.1, 0.2 + px, d));
		asphalt = mix(asphalt, vec3(0.6, 0.55, 0.3), dash * step(7.0, ROAD_W[i]));
		float edgeLine = (1.0 - smoothstep(0.08, 0.16 + px, abs(d - (hw - 0.5)))) * step(7.0, ROAD_W[i]);
		asphalt = mix(asphalt, vec3(0.6), edgeLine * 0.8);
		colour = mix(colour, asphalt, m);
		pave = max(pave, m);
		dirt = max(dirt, (1.0 - smoothstep(0.0, 3.5, d - hw)) * (1.0 - m) * 0.7);
	}
	for (int i = 0; i < APRON_N; i++) {
		vec4 a = APRON_BOX[i];
		vec2 d = abs(q - a.xy) - a.zw;
		float sd = max(d.x, d.y);
		float m = smoothstep(-px, px, -sd);
		vec2 gg = abs(fract((q - a.xy) / 6.0 + 0.5) - 0.5) * 6.0;
		vec3 c2 = vec3(0.4, 0.39, 0.37) * (0.9 + 0.2 * noiseF(vec3(q * 0.3, 7.0)));
		c2 *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.06 + px, min(gg.x, gg.y)));
		colour = mix(colour, c2, m);
		pave = max(pave, m);
		dirt = max(dirt, (1.0 - smoothstep(0.0, 4.0, sd)) * (1.0 - m) * 0.7);
	}
	return pave;
}

// Hill relief used for shading only (physics and the pad stay on the reference sphere): height in
// metres from the octaves at or above lamMin, so far hills shade as ridges and valleys.
float macroRelief(vec3 p, float lamMin, int i0) {
	float h = 0.0;
	for (int i = 0; i < 6; i++) { // the larger octaves are real terrain, kept only on mountains (ADR 0036)
		if (i < i0) continue;
		float lam = 1024.0 / exp2(float(i));
		if (lam < lamMin) break;
		float fade = clamp((lam / lamMin - 1.0) * 1.5, 0.0, 1.0);
		h += (noiseA(p, lam, 60 + i) - 0.5) * 320.0 * pow(lam / 1024.0, 1.5) * fade;
	}
	return h;
}

// Sum of deep-water waves: tangent gradient (rise over run) and height. Components shorter than
// about three pixels fade out so the sea never aliases.
vec3 waveGradient(vec3 p, vec3 n, float footprint, out float crest) {
	vec3 g = vec3(0.0);
	crest = 0.0;
	// a slowly varying gain per component breaks the regular banding of a few plane waves
	float seed = noiseA(p, 256.0, 91);
	float warp = (noiseA(p, 48.0, 92) - 0.5) * 6.0;
	for (int i = 0; i < WAVE_N; i++) {
		float fade = clamp(WAVE_LEN[i] / (footprint * 3.0) - 1.0, 0.0, 1.0);
		if (fade <= 0.0) continue;
		vec3 D = WAVE_DIR[i].x * uSiteEast + WAVE_DIR[i].y * uSiteNorth;
		float ph = WAVE_K[i] * dot(D, p) + uWaveAnchor[i] - WAVE_W[i] * uTime + WAVE_PH[i] + warp * (0.35 + 0.2 * float(i));
		float a = WAVE_A[i] * fade * (0.75 + 0.5 * sin(seed * (5.0 + 2.3 * float(i)) + float(i)));
		g += D * (a * WAVE_K[i] * cos(ph));
		crest += a * sin(ph);
	}
	return g - n * dot(g, n);
}

// Shore waves (plan 038, twin of shore-wave.ts): x is metres from the shoreline into the water.
float swashOffsetG(float t, float H) {
	float a = 0.12 * H / SHORE_SLOPE;
	return a * (sin(SHORE_W * t) + 0.35 * sin(2.0 * SHORE_W * t + 1.1));
}
float surfPhaseG(float x, float t) {
	return 2.0 * SHORE_W * sqrt(max(x, SHORE_XMIN) / SHORE_GS) + SHORE_W * t;
}
// fp: the pixel's footprint, m. A breaker line is a fraction of the spacing of the lines (which
// narrows toward the shore); a pixel near a third of it gets the line's mean, not dashes of it
float surfFoamG(float x, float t, float H, float fp) {
	float xb = H / (SHORE_BREAK * SHORE_SLOPE);
	float c = 0.5 + 0.5 * cos(surfPhaseG(x - swashOffsetG(t, H) * 0.5, t));
	float spacing = 6.2832 * sqrt(SHORE_GS * max(x, SHORE_XMIN)) / SHORE_W;
	// a line is about a sixth of the spacing wide: a pixel wider than half of that gets its mean
	float crest = mix(c * c * c * c, 35.0 / 128.0, smoothstep(spacing * 0.08, spacing * 0.3, fp));
	float breaking = 1.0 - smoothstep(xb * 0.9, xb * 1.6, x);
	float reach = 1.0 - smoothstep(xb * 2.5, xb * 5.0, x);
	return min(1.0, smoothstep(-2.0, 1.0, x) * (0.12 * crest * reach + breaking * (0.25 + 0.75 * crest)));
}

// Ripples of a river or lake surface at the position p (three scales, faded by the pixel footprint).
float rippleAt(vec3 p, float f1, float f2, float f3) {
	return f1 * noiseA(p, 8.0, 21) + 0.5 * f2 * noiseA(p, 2.0, 22) + 0.25 * f3 * noiseA(p, 0.5, 23);
}

// The river field whose level set is the river (plan 025), and its tangent-plane gradient by differences.
float riverField(vec3 p) {
	return noiseA(p, 1024.0, 41) * 0.62 + noiseA(p, 512.0, 42) * 0.3 + noiseA(p, 128.0, 43) * 0.08;
}

Surface surfaceAt(vec3 nBF, vec3 pl, float footprint, vec3 viewBF, float hT, vec3 gT) {
	Surface s;
	vec2 ll = warpedLatLon(nBF, uR); // the biome map is read through the coast warp (core MAP_WARP)
	vec2 uv = vec2(ll.y / (2.0 * kPI) + 0.5, ll.x / kPI + 0.5);
	float lod = max(log2(footprint / uMapTexel), 0.0);
	vec4 m = textureLod(uMap, uv, lod);
	float e = m.r;
	float moist = m.g;
	float temp = m.b;
	float rockMap = m.a;

	// Elevation gradient of the biome map per metre: detail displaces the coast by a fraction of
	// its own wavelength instead of by a fixed elevation, which turned shores into speckle.
	float tw = uMapTexel / (2.0 * kPI * uR) * exp2(lod);
	float ex = textureLod(uMap, uv + vec2(tw, 0.0), lod).r - textureLod(uMap, uv - vec2(tw, 0.0), lod).r;
	float ey = textureLod(uMap, uv + vec2(0.0, 2.0 * tw), lod).r - textureLod(uMap, uv - vec2(0.0, 2.0 * tw), lod).r;
	float texelM = uMapTexel * exp2(lod);
	float gTrue = length(vec2(ex, ey)) * 0.5 / texelM;
	float gPerM = max(gTrue, 0.006 / uMapTexel);

	// Fractal detail: height in metres for relief and shifts of the elevation field for coastlines.
	float hM = 0.0;
	float eDetail = 0.0;
	float colourNoise = 0.0;
	float fine = 0.0;
	// an octave fades in from three pixels a wavelength: at 1.6 (the Nyquist edge) the detail and the
	// bump made from its screen differences shimmered as the camera moved (the owner, 2026-10-21)
	float lamMin = footprint * 3.0;
	for (int i = 0; i < GROUND_OCTAVES; i++) {
		float lam = 1024.0 / exp2(float(i));
		if (lam < lamMin) break;
		float fade = clamp((lam / lamMin - 1.0) * 1.5, 0.0, 1.0);
		float n = noiseA(pl, lam, i) - 0.5;
		eDetail += n * 0.7 * gPerM * lam * fade;
		hM += n * lam * 0.22 * fade;
		if (lam < 64.0) fine += n * fade * (lam < 8.0 ? 1.0 : 0.6);
		if (lam > 6.0 && lam < 200.0) colourNoise += n * fade * 0.7;
	}
	float e2 = e + eDetail;
	// the waterline's antialiasing over the coast's own slope: the detail octaves make it 3 to 5 times
	// the map's, and with the map's alone the edge was sharper than a pixel (a jagged, stepped coast)
	float aa = max(footprint * gPerM * COAST_SLOPE_FACTOR, 0.0004);
	float landW = smoothstep(SEA - aa, SEA + aa, e2);
	float sdCoast = (SEA - e2) / gPerM; // metres into the water (negative on land)
	float depth = clamp((SEA - e2) / 0.18, 0.0, 1.0);
	float depthNear = clamp(sdCoast / 60.0, 0.0, 1.0);

	// Lakes (plan 038, ADR 0072): basins of the core terrain; the ground is flat water level where the level reaches LAKE_TO.
	// the lake gate of every site's zone (ADR 0142), the twin of the height function's
	float lakeLvl = noiseT(nBF * (uR / 1000.0), 1.0 / LAKE_WL, LAKE_SALT) * terrainZones(nBF, uR).z;
	float lakeGradPx = length(vec2(dFdx(lakeLvl), dFdy(lakeLvl)));
	float lakeIn = -1.0e5; // metres inside a lake (negative on land)
	float lakeOnly = 0.0;
	float depthSea = depth;
	if (footprint < 2500.0 && lakeLvl > LAKE_TO - 0.1) {
		float gl = clamp(lakeGradPx / max(footprint, 0.05), 0.3 * LAKE_GRAD, 1.1 * LAKE_GRAD);
		lakeIn = (lakeLvl - LAKE_TO) / gl;
		// the shore is ragged inward only, so it never moves onto ground above the water
		lakeIn -= 7.0 * noiseA(pl, 32.0, 77) * (1.0 - smoothstep(30.0, 160.0, footprint));
		landW *= 1.0 - smoothstep(-footprint, footprint, lakeIn);
		sdCoast = max(sdCoast, lakeIn);
		depth = max(depth, 0.3 * clamp(lakeIn / LAKE_RAMP, 0.0, 1.0));
		depthNear = clamp(sdCoast / 60.0, 0.0, 1.0);
		lakeOnly = smoothstep(0.0, 6.0, lakeIn) * (1.0 - smoothstep(0.0, 0.05, depthSea));
	}

	// Shore waves (plan 038, ADR 0072): the waterline runs up and down the beach with the swell, and the surf lines are
	// spaced in metres from the shore: the coast distance is divided by its own gradient (the fractal coast displacement
	// makes it change 3 to 5 metres per metre), so the bands are parallel to the shoreline and as wide as the model says.
	// The coast distance's own slope is taken as the detail octaves' typical 4, not from screen
	// differences: those step every 2 x 2 pixels, and the wet sand and the waterline drew that as a
	// dotted, stepped outline (the owner, 2026-10-21).
	float sdM = sdCoast / COAST_SLOPE_FACTOR;
	float shoreH = SHORE_H * mix(1.0, LAKE_WAVE_SHARE, lakeOnly);
	float swash = 0.0;
	float nearShore = (1.0 - smoothstep(12.0, 50.0, footprint)) * (1.0 - smoothstep(14.0, 30.0, abs(sdM)));
	if (nearShore > 0.0) {
		swash = swashOffsetG(uTime, shoreH) * 0.5;
		landW = mix(landW, 1.0 - smoothstep(-footprint, footprint, sdM + swash), nearShore);
	}

	vec3 vS = uCamToSite + viewBF;
	float siteDist = length(vS);

	// Hill shading: normal from finite differences of a few octaves, away from the launch site.
	float reliefAmp = smoothstep(500.0, 2500.0, siteDist) * (1.0 - smoothstep(25.0, 160.0, footprint)) * landW * mix(0.45, 1.0, smoothstep(0.45, 0.85, e2 + rockMap * 0.25));
	// crags on real mountains: the large octaves too, stronger where the terrain is high
	float rug = smoothstep(150.0, 1100.0, hT);
	reliefAmp = max(reliefAmp, rug * 1.3 * (1.0 - smoothstep(25.0, 200.0, footprint)));
	int i0 = rug > 0.05 ? 0 : 2;
	vec3 Nr = nBF;
	if (reliefAmp > 0.01) {
		float eps = max(footprint * 1.5, 6.0);
		float lm = max(footprint * 2.5, eps * 3.0);
		vec3 T1 = normalize(cross(nBF, abs(nBF.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
		vec3 T2 = cross(nBF, T1);
		float h0 = macroRelief(pl, lm, i0);
		float h1 = macroRelief(pl + T1 * eps, lm, i0);
		float h2 = macroRelief(pl + T2 * eps, lm, i0);
		Nr = normalize(nBF - reliefAmp * ((h1 - h0) / eps * T1 + (h2 - h0) / eps * T2));
	}

	// slope-based rock needs the bumped normal: build it from the height field's derivatives
	vec3 N = nBF;
	float rugged = mix(0.02, 0.5, smoothstep(0.55, 0.9, e2 + rockMap * 0.25));
	vec3 dpdx = dFdx(pl);
	vec3 dpdy = dFdy(pl);
	// a 2 x 2 block that straddles two surfaces (the terrain's edge on the sea sphere: the coastline)
	// moves far more than a footprint a pixel; its bumps went wild and drew a dark line along every
	// coast (the owner, 2026-10-21): there the normals stay the geometric one
	bool quadOk = max(length(dpdx), length(dpdy)) < 4.0 * footprint;
	float dhx = dFdx(hM * rugged);
	float dhy = dFdy(hM * rugged);
	vec3 r1 = cross(dpdy, N);
	vec3 r2 = cross(N, dpdx);
	float det = dot(dpdx, r1);
	vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
	vec3 gb = abs(det) * N - grad;
	vec3 Nb = quadOk && dot(gb, gb) > 1e-24 ? normalize(gb) : N;
	Nb = normalize(Nb + (Nr - nBF));
	float slope = 1.0 - dot(Nb, nBF);
	float tanS = length(gT);
	// distant slopes are drawn steeper than they are (shading only): a pixel tens of metres wide averages the crags away
	float exag = 1.0 + ${f(SLOPE_EXAGGERATION)} * smoothstep(${f(SLOPE_EXAGGERATION_RANGE[0])}, ${f(SLOPE_EXAGGERATION_RANGE[1])}, footprint);
	Nb = normalize(Nb + (normalize(nBF - gT * exag) - nBF));

	// --- vegetation colours -------------------------------------------------------------------
	float lushness = clamp(0.5 + colourNoise * 0.6, 0.0, 1.0);
	vec3 grass = mix(vec3(0.052, 0.135, 0.028), vec3(0.095, 0.185, 0.042), smoothstep(0.2, 0.6, lushness));
	grass = mix(grass, vec3(0.2, 0.19, 0.06), smoothstep(0.62, 0.95, lushness) * (1.0 - smoothstep(0.4, 0.7, moist)));
	// blades, clumps and gaps, resolved only when a pixel is smaller than a clump
	float fadeMicro = 1.0 - smoothstep(0.35, 3.0, footprint);
	if (fadeMicro > 0.01) {
		float b1 = noiseA(pl, 0.5, 31);
		float b2 = noiseA(pl, 0.125, 32);
		float b3 = noiseA(pl, 0.0625, 33);
		float b4 = noiseA(pl, 0.03125, 34);
		// each fades by its own cell size: blades (3 to 6 cm) only while a pixel is a few
		// centimetres, clumps and gaps (12 to 50 cm) a little further; sampled by wider pixels they were static
		float bladeFade = 1.0 - smoothstep(0.02, 0.12, footprint);
		float clumpFade = 1.0 - smoothstep(0.1, 0.8, footprint);
		float blades = mix(0.5, smoothstep(0.38, 0.78, b3 * 0.6 + b4 * 0.4), bladeFade);
		float gaps = (1.0 - smoothstep(0.25, 0.6, b2 * 0.7 + b1 * 0.3)) * clumpFade;
		vec3 tuft = mix(grass * 0.62, grass * vec3(1.3, 1.34, 1.02), blades);
		tuft *= 0.82 + 0.38 * mix(0.5, b1, clumpFade);
		tuft = mix(tuft, grass * vec3(0.3, 0.33, 0.2), gaps * 0.5);
		grass = mix(grass, tuft, fadeMicro);
	}
	float fineTone = 0.82 + 0.4 * clamp(0.5 + fine, 0.0, 1.0);
	grass *= mix(fineTone, 1.0, fadeMicro);

	// forest: crowns seen from above
	vec3 forest = vec3(0.03, 0.075, 0.026) * (0.8 + 0.5 * clamp(0.5 + colourNoise, 0.0, 1.0));
	float fadeCrown = 1.0 - smoothstep(6.0, 40.0, footprint);
	float wForest = smoothstep(0.55, 0.72, moist) * (1.0 - smoothstep(900.0, 1600.0, hT));
	if (fadeCrown > 0.01 && wForest > 0.01) {
		float c1 = noiseA(pl, 8.0, 51) * 0.6 + noiseA(pl, 4.0, 52) * 0.4;
		float crown = smoothstep(0.34, 0.66, c1);
		float c2 = noiseA(pl, 1.0, 53);
		vec3 crownC = vec3(0.045, 0.105, 0.032) * (0.75 + 0.6 * c2);
		vec3 gapC = vec3(0.012, 0.03, 0.012);
		forest = mix(forest, mix(gapC, crownC, crown), fadeCrown);
	}
	vec3 desert = mix(vec3(0.42, 0.29, 0.15), vec3(0.58, 0.43, 0.25), clamp(0.5 + colourNoise, 0.0, 1.0));
	vec3 rockc = mix(vec3(0.17, 0.15, 0.135), vec3(0.34, 0.31, 0.27), clamp(0.5 + colourNoise * 1.3 + fine * 0.3, 0.0, 1.0));
	vec3 snow = vec3(0.78, 0.8, 0.84);
	vec3 sand = vec3(0.44, 0.38, 0.26) * (0.92 + 0.16 * clamp(0.5 + fine, 0.0, 1.0));

	float wDesert = (1.0 - smoothstep(0.26, 0.4, moist)) * smoothstep(0.35, 0.5, temp);
	// fields: patchwork of tilled plots on low grassland, with hedgerows at the plot boundaries
	float fieldW = (1.0 - wForest) * (1.0 - wDesert) * (1.0 - smoothstep(120.0, 600.0, footprint)) * smoothstep(400.0, 1400.0, siteDist) * (1.0 - smoothstep(0.5, 0.62, e2));
	if (fieldW > 0.01) {
		vec3 cellF = pl / 256.0;
		vec3 fl = floor(cellF);
		vec3 hh = hash33i(ivec3(fl) + ivec3(uAnchorCell) * 4);
		vec3 tint = mix(vec3(0.82, 0.92, 0.68), vec3(1.35, 1.2, 0.62), smoothstep(0.35, 0.9, hh.x)) * (0.8 + 0.4 * hh.y);
		vec3 fr = fract(cellF);
		vec3 dEdge = min(fr, 1.0 - fr) * 256.0;
		float edge = min(dEdge.x, min(dEdge.y, dEdge.z));
		float hedge = 1.0 - smoothstep(0.6, 1.6 + footprint * 0.7, edge);
		grass = mix(grass, grass * tint, fieldW);
		grass = mix(grass, vec3(0.025, 0.06, 0.02), hedge * fieldW * 0.8 * (1.0 - smoothstep(5.0, 30.0, footprint)));
	}
	vec3 veg = mix(grass, forest, wForest);
	veg = mix(veg, desert, wDesert);
	// alpine meadow above the tree line
	vec3 alpine = mix(vec3(0.13, 0.15, 0.07), vec3(0.2, 0.19, 0.11), clamp(0.5 + colourNoise, 0.0, 1.0));
	veg = mix(veg, alpine, smoothstep(800.0, 1500.0, hT));
	float wRock = max(smoothstep(HIGH - 0.06, HIGH + 0.05, e2), smoothstep(0.7, 0.9, rockMap + colourNoise * 0.3));
	wRock = max(wRock, smoothstep(0.06, 0.22, slope * 3.0));
	wRock = max(wRock, smoothstep(0.28, 0.55, tanS));
	wRock = max(wRock, smoothstep(1500.0, 2100.0, hT + 300.0 * colourNoise));
	float snowLine = 2800.0 + 420.0 * colourNoise;
	float wSnow = max(smoothstep(0.22, 0.12, temp), smoothstep(0.9, 0.97, e2));
	wSnow = max(wSnow, smoothstep(snowLine - 150.0, snowLine + 250.0, hT) * (1.0 - smoothstep(0.55, 0.95, tanS)));
	float wBeach = (1.0 - smoothstep(SEA + BEACH * 0.5, SEA + BEACH * 1.6, e2)) * (1.0 - wRock) * (1.0 - smoothstep(300.0, 3000.0, footprint));
	if (lakeIn > -60.0 && lakeIn <= 0.0) wBeach = max(wBeach, (1.0 - smoothstep(1.0, 22.0, -lakeIn)) * (1.0 - wRock) * (1.0 - smoothstep(300.0, 3000.0, footprint)));

	vec3 land = mix(veg, rockc, wRock);
	land = mix(land, sand, wBeach);
	land = mix(land, snow, wSnow * smoothstep(0.0, 1.0, 1.0 - slope * 2.0));
	// wet sand strip along the shore
	land *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 3.0, -(sdM + swash))) * (1.0 - wRock);

	// rivers: thin level-set curves of a low-frequency field on lowland, antialiased by distance
	float riverMask = 0.0;
	vec3 riverFlow3 = vec3(0.0); // unit-or-less flow of the river at this point, body-fixed tangent (plan 038)
	if (landW > 0.5 && siteDist > 900.0 && footprint < 40.0 && e2 < 0.68 && wDesert < 0.5) {
		float rn = noiseA(pl, 1024.0, 41) * 0.62 + noiseA(pl, 512.0, 42) * 0.3 + noiseA(pl, 128.0, 43) * 0.08;
		float rr = abs(rn - 0.5);
		float fw = max(length(vec2(dFdx(rn), dFdy(rn))), 1e-7);
		float dist = rr / fw * footprint;
		float W = 5.0 + 17.0 * noiseA(pl, 1024.0, 44);
		// a river from a pixel wide (fully from 2.5): narrower, its screen-difference distance drew it
		// as dark dotted lines along the coasts (the owner, 2026-10-21)
		float vis = smoothstep(1.0, 2.5, W / footprint) * smoothstep(0.68, 0.55, e2) * (1.0 - smoothstep(60.0, 260.0, hT));
		riverMask = (1.0 - smoothstep(W - footprint, W + footprint, dist)) * vis;
		float bank = (1.0 - smoothstep(W, W * 2.2 + footprint, dist)) * vis;
		land = mix(land, land * vec3(0.55, 0.7, 0.5), bank * 0.7);
		if (riverMask > 0.02) {
			// flow along the level set, signed toward lower ground (twin: flowVector in water-flow.ts)
			vec3 T1b = normalize(cross(nBF, abs(nBF.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
			vec3 T2b = cross(nBF, T1b);
			float eps = 14.0;
			float r1 = riverField(pl + T1b * eps);
			float r2 = riverField(pl + T2b * eps);
			vec3 gR = ((r1 - rn) * T1b + (r2 - rn) * T2b) / eps;
			vec3 tang = cross(nBF, gR);
			float tl = length(tang);
			// elevation gradient of the biome map, smoothed over a few texels so the flow does not flip at texel borders
			float lod2 = max(lod, 2.0);
			float tw2 = uMapTexel / (2.0 * kPI * uR) * exp2(lod2);
			float ex2 = textureLod(uMap, uv + vec2(tw2, 0.0), lod2).r - textureLod(uMap, uv - vec2(tw2, 0.0), lod2).r;
			float ey2 = textureLod(uMap, uv + vec2(0.0, 2.0 * tw2), lod2).r - textureLod(uMap, uv - vec2(0.0, 2.0 * tw2), lod2).r;
			float texel2 = uMapTexel * exp2(lod2);
			vec3 eastV = normalize(cross(vec3(0.0, 1.0, 0.0), nBF));
			vec3 northV = cross(nBF, eastV);
			vec3 gE = eastV * (ex2 / (2.0 * texel2 * max(cos(ll.x), 0.2))) + northV * (ey2 / (2.0 * texel2));
			float downhill = -dot(tang, gE) / max(tl, 1e-9);
			float el = length(gE);
			float along = downhill / sqrt(downhill * downhill + 0.1225 * el * el + 1e-30);
			riverFlow3 = tang / max(tl, 1e-9) * along;
		}
	}

	// Launch site: paved areas painted onto the ground (flush, so nothing intersects the vessel).
	vec3 v = vS;
	float padMask = 0.0;
	vec3 lampE = vec3(0.0);
	if (dot(v, v) < uSiteRadius * uSiteRadius) {
		vec2 q = vec2(dot(v, uSiteEast), -dot(v, uSiteNorth));
		if (uSiteLamps > 0.001) {
			for (int i = 0; i < FLOOD_N; i++) {
				vec3 d = vec3(q.x, 0.0, q.y) - FLOOD_POS[i];
				float d2 = dot(d, d);
				lampE += vec3(1.0, 0.82, 0.58) * (FLOOD_I * (-d.y) / (d2 * sqrt(d2)));
			}
			lampE *= uSiteLamps;
		}
		float dirt;
		vec3 paved = land;
		float pave = sitePaving(q, paved, dirt, max(footprint, 0.05));
		vec3 dirtc = vec3(0.2, 0.15, 0.09) * (0.75 + 0.5 * noiseF(vec3(q * 0.7, 9.0))) * (0.85 + 0.3 * noiseF(vec3(q * 3.1, 19.0)));
		// a trimmed lawn around the site, mown in stripes
		float lawn = 1.0 - smoothstep(60.0, 180.0, length(q));
		float stripeFade = 1.0 - smoothstep(0.6, 5.0, footprint);
		float stripe = smoothstep(-0.25, 0.25, sin(q.x * 0.52 + 0.8 * sin(q.y * 0.02)));
		land = mix(land, land * vec3(1.06, 1.12, 0.95), lawn * 0.5);
		land *= 1.0 + lawn * stripeFade * 0.11 * (stripe - 0.5) * 2.0;
		land = mix(land, dirtc, dirt);
		land = mix(land, paved, pave);
		padMask = max(pave, dirt * 0.5);
		Nb = normalize(mix(Nb, nBF, padMask));
	}

	// Ocean
	vec3 shallow = mix(vec3(0.03, 0.26, 0.24), vec3(0.02, 0.2, 0.2), depthNear);
	vec3 deep = vec3(0.004, 0.035, 0.1);
	vec3 water = mix(shallow, deep, smoothstep(0.0, 0.7, max(depth, depthNear * 0.25)));
	// lake water is greener and murkier than the sea and darkens toward the middle
	water = mix(water, mix(vec3(0.045, 0.17, 0.15), vec3(0.012, 0.075, 0.085), smoothstep(0.0, 90.0, lakeIn)), lakeOnly);
	// breaking foam along the shore, only where a pixel is smaller than the band
	// its 1 m noise fades before a pixel is wider than it: wider pixels sampled it as flicker
	float foamFade = 1.0 - smoothstep(1.5, 12.0, footprint);
	if (foamFade > 0.01 && landW < 0.999) {
		// the 1 m noise only where a pixel resolves it, and the lines' break-up soft: a hard threshold
		// of it cut the breaker lines into rows of white dashes (the owner, 2026-10-21)
		float fine1 = 1.0 - smoothstep(0.25, 1.0, footprint);
		float fn = noiseA(pl, 4.0, 71) * 0.6 + mix(0.5, noiseA(pl, 1.0, 72), fine1) * 0.4;
		float band = 1.0 - smoothstep(1.0, 9.0, sdCoast + (fn - 0.5) * 10.0);
		float lines = smoothstep(0.15, 0.85, fn);
		// The breaker lines follow the map's smooth coast (metres by its gradient, no screen
		// differences) and bend with a 16 m noise. On the fractal coast distance divided by its 2 x 2
		// pixel derivatives they broke into rows of white dashes (the owner, 2026-10-21).
		float sdSurf = (SEA - e) / gPerM;
		float surf = surfFoamG(sdSurf + swash + (noiseA(pl, 16.0, 74) - 0.5) * 3.0, uTime, shoreH, footprint);
		float foam = clamp(max(surf * (0.55 + 0.45 * lines), band * (0.15 + 0.2 * lines)), 0.0, 1.0);
		water = mix(water, vec3(0.8, 0.84, 0.86), foam * foamFade * step(0.0, sdM + 1.0 + swash));
	}
	float crest = 0.0;
	vec3 gWave = vec3(0.0);
	if (landW < 0.999 && footprint < 120.0) {
		gWave = waveGradient(pl, nBF, footprint, crest);
		float calm = 1.0 - 0.8 * lakeOnly; // a lake has no swell
		gWave *= calm;
		crest *= calm;
		// white caps only where a pixel resolves them, and their 1.5 m noise only nearer still: wider
		// pixels sampled them as white specks that flickered with the waves (the owner, 2026-10-21)
		float capFade = 1.0 - smoothstep(1.5, 8.0, footprint);
		float capNoise = (noiseA(pl, 1.5, 73) - 0.5) * 0.55 * (1.0 - smoothstep(0.4, 1.5, footprint));
		float cap = smoothstep(0.85, 1.35, crest / 2.4 + capNoise + length(gWave) * 0.8);
		water = mix(water * (1.0 + 0.08 * crest), vec3(0.8, 0.85, 0.87), cap * capFade * smoothstep(0.1, 0.5, depth + depthNear));
	}
	vec3 riverCol = mix(vec3(0.03, 0.07, 0.06), vec3(0.02, 0.1, 0.1), noiseF(vec3(pl * 0.1)));
	water = mix(water, riverCol, riverMask);
	float lw = landW * (1.0 - riverMask);
	vec3 col = mix(water, land, lw);
	vec3 Nw = Nb;
	float wRip = 0.5;
	if (lw < 1.0 && footprint < 400.0) {
		vec3 wp = pl + vec3(0.0);
		// a ripple fades in from three pixels a wavelength (it was held to 1.6, the Nyquist edge, and
		// its normal from screen differences sparkled)
		float f1 = clamp(8.0 / (footprint * 3.2) - 1.0, 0.0, 1.0);
		float f2 = clamp(2.0 / (footprint * 3.2) - 1.0, 0.0, 1.0);
		float f3 = clamp(0.5 / (footprint * 3.2) - 1.0, 0.0, 1.0);
		float w;
		if (riverMask > 0.02 && dot(riverFlow3, riverFlow3) > 0.0004) {
			// two phases half a cycle apart, each invisible at its own reset (water-flow.ts)
			float pa = fract(uTime / FLOW_CYCLE);
			float pb = fract(uTime / FLOW_CYCLE + 0.5);
			float sh = FLOW_SPEED * FLOW_CYCLE;
			w = (1.0 - abs(1.0 - 2.0 * pa)) * rippleAt(wp - riverFlow3 * (sh * pa), f1, f2, f3)
				+ (1.0 - abs(1.0 - 2.0 * pb)) * rippleAt(wp - riverFlow3 * (sh * pb), f1, f2, f3);
		} else {
			w = rippleAt(wp, f1, f2, f3);
		}
		wRip = w;
		float wdx = dFdx(w), wdy = dFdy(w);
		vec3 rw1 = cross(dpdy, nBF), rw2 = cross(nBF, dpdx);
		float dw = dot(dpdx, rw1);
		vec3 gw = abs(dw) * nBF - sign(dw) * (wdx * rw1 + wdy * rw2) * 1.8;
		Nw = quadOk && dot(gw, gw) > 1e-24 ? normalize(gw) : nBF;
		Nw = normalize(Nw + (normalize(nBF - gWave) - nBF));
	}
	s.normal = normalize(mix(Nw, Nb, lw));
	// the ripples of a river pass over its dark surface (moving brightness along the flow)
	col *= 1.0 + riverMask * (1.0 - lw) * 1.6 * (wRip - 0.4);
	s.albedo = col;
	s.spec = (1.0 - landW) + riverMask * 0.3;
	s.waterDepth = depth;
	s.lampE = lampE;
	return s;
}

/**
 * The shading of one ray (plan 133): the ground at \`tG\` when \`hitG\` (terrain when \`hitT\`, else the
 * sea-level sphere), else the sky; the atmosphere, clouds and aurora in front. \`main\` runs it once,
 * and a second time as ground for the few pixels that a silhouette partly covers.
 */
vec3 shadeRay(vec3 ro, vec3 rd, float r0, float d, float h, bool hitG, bool hitT, float tG, out float depthDist) {
	float R = uR;
	// atmosphere interval
	float jitter = ign(gl_FragCoord.xy);
	vec2 at = raySphere(r0, d, R + uAtmH);
	float t0 = max(at.x, 0.0);
	float t1 = at.y;
	if (hitG) t1 = min(t1, tG);
	bool inAtm = at.y > 0.0 && t1 > t0;

	vec3 base = vec3(0.0);
	depthDist = -1.0; // distance along the ray written to the depth buffer
	if (hitG) {
		vec3 rdBF = uBodyInv * rd;
		vec3 pl = uCamLocal + rdBF * tG;
		vec3 posRel = ro + rd * tG;
		vec3 nI = normalize(posRel);
		vec3 nBF = uBodyInv * nI;
		float hT = 0.0;
		vec3 gT = vec3(0.0);
		vec3 nGeoI = nI;
#if TERRAIN
		if (hitT) {
			vec4 ter = terrainAt(posRel);
			hT = ter.x;
			gT = ter.yzw;
			nGeoI = normalize(nI - gT * uBodyInv);
		}
#endif
		float cosv = max(abs(dot(nGeoI, rd)), 0.03);
		float footprint = max(tG * uPixelAngle / cosv, 0.002);
		Surface sf = surfaceAt(nBF, pl, footprint, rdBF * tG, hT, gT);
		// A ray that grazes the ground sees the rim of a slope edge-on, but its pixel spans the face in
		// front of it as well: the normal leans back to level ground and the rim's self-shadow fades as
		// the incidence goes grazing (plan 133), or the silhouette of every ridge is a dark dashed line.
		float graze = hitT && uSilhouetteAA > 0.5 ? 1.0 - smoothstep(0.03, 0.2, abs(dot(nGeoI, rd))) : 0.0;
		sf.normal = normalize(mix(sf.normal, nBF, graze));

		vec3 Lb = uSunBF;
		float ndl = max(dot(sf.normal, Lb), 0.0);
		float geo = dot(nBF, Lb);
		vec3 sunT = sunTransmittance(posRel, uSunDir);
		vec3 posRender = uCamPos + rd * tG;
		float sh = shadowFactor(posRender);
#if TERRAIN && TERRAIN_SHADOW_STEPS > 0
		// The 8-sample shadow march cannot resolve ridge shadows once a pixel is hundreds of metres wide: it only
		// blackens isolated pixels along crests (plan 039). Beyond a footprint of 40 m it fades out; past 160 m
		// it is not run, which also saves its eight height reads for the far half of the screen.
		if (hitT && geo > -0.05 && footprint < 160.0) {
			float vis = terrainShadow(posRel + nGeoI * 2.0, uSunDir);
			sh *= mix(mix(vis, 1.0, smoothstep(40.0, 160.0, footprint)), 1.0, graze);
		}
#endif
#if CLOUD_SHADOW_MAP
		if (geo > 0.04) {
			// one fetch of the baked density instead of the noise (plan 056): the same sun ray as below
			float sc = raySphere(R, geo, uCloudAlt).y;
			vec3 q = nBF * R + Lb * sc;
			sh *= 1.0 - 0.45 * cloudMapAt(rotY(normalize(q), uCloudAngle)).g;
		}
#elif CLOUD_SHADOWS
		if (geo > 0.04) {
			float sc = raySphere(R, geo, uCloudAlt).y;
			vec3 q = nBF * R + Lb * sc;
			sh *= 1.0 - 0.45 * cloudDensityO(normalize(q), false, 2000.0, CLOUD_SHADOW_OCTAVES);
		}
#endif
		float k = max(0.0, 0.02 + smoothstep(-0.2, 0.4, geo)) / max(0.02 + smoothstep(-0.2, 0.4, uAmbientRefMu), 0.02);
		// a slope sees less of the sky than level ground: half of it when it stands on end (plan 039)
		float skyVis = 0.5 + 0.5 * dot(sf.normal, nBF);
		vec3 amb = uAmbient * k * skyVis + NIGHT_AMBIENT * kPI;
		vec3 lit = sf.albedo / kPI * (uSunIrr * sunT * ndl * sh + amb + sf.lampE);
		if (sf.spec > 0.0) {
			vec3 V = -rdBF;
			vec3 Hh = normalize(Lb + V);
			float nh = max(dot(sf.normal, Hh), 0.0);
			float fres = 0.02 + 0.98 * pow(1.0 - max(dot(sf.normal, V), 0.0), 5.0);
			// the sun's glint, widened by the slopes a pixel averages (Toksvig, from its footprint) with
			// its energy kept: a fixed 900 sparkled on pixel-sized waves
			float sigma2 = (0.012 * footprint) * (0.012 * footprint);
			float gloss = 900.0 / (1.0 + 900.0 * sigma2);
			float glint = pow(nh, gloss) * gloss / (8.0 * kPI) * ndl * sh;
			vec3 refl = uSkyColour * fres * 1.2;
			lit = mix(lit, refl, fres * 0.9) + uSunIrr * sunT * glint * fres * 0.5 * sf.spec;
		}
		base = lit;
		depthDist = tG;
	} else {
		float px = uPixelAngle;
		// the star field is skipped (not just dimmed) when daylight hides it: it is ~15 hash lookups and an fbm per sky pixel
		base = uStarBright > 0.002 ? stars(rd, px) : vec3(0.0);
		float ang = dot(rd, uSunDir) > 0.0 ? length(cross(rd, uSunDir)) : 2.0;
		float disc2 = 1.0 - smoothstep(SUN_ANGULAR_RADIUS * 0.8, SUN_ANGULAR_RADIUS * 1.08, ang);
		float x = clamp(ang / SUN_ANGULAR_RADIUS, 0.0, 1.0);
		float limb = 1.0 - 0.55 * (1.0 - sqrt(1.0 - x * x));
		base += vec3(1.0, 0.96, 0.9) * SUN_DISC_RADIANCE * disc2 * limb;
	}

	// aurora (plan 061, ADR 0093): emission above the air. The stretch of the shell behind the atmosphere is part of the
	// background (the air and the clouds dim it); the stretch in front of it, seen from orbit, is added at the end.
	vec3 auroraNear = vec3(0.0);
#if AURORA_STEPS > 0
	if (uAurora > 0.001) {
		vec3 auroraFar;
		auroraNear = auroraMarch(ro, rd, r0, d, hitG, inAtm ? t0 : 1e30, fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453), auroraFar) * uAurora;
		base += auroraFar * uAurora;
	}
#endif

	// atmosphere and cloud layers (ADR 0037): one march, snapshotted at the layers' distances
	vec3 colour = base;
	float tcA = 1e30;
	float tcB = 1e30;
	float alphaB = 0.0;
	vec3 lightB = vec3(0.0);
#if CLOUDS
	// layer 1 = cumulus, layer 2 = cirrus; a layer the ray misses (or finds clear) stays at 1e30
	vec2 csT = raySphere(r0, d, uCloudTop);
	vec2 csA = raySphere(r0, d, uCloudAlt);
	float cloudTA = 1e30;
	bool hitA = false;
	float alphaA = 0.0;
	vec3 lightA = vec3(0.0);
	if (inAtm && csT.y > 0.0) {
		// the stretch of the ray inside the slab (twin: slabInterval in cloud-volume.ts)
		float a0 = max(csT.x, 0.0);
		float a1 = csT.y;
		if (csA.y > 0.0) {
			if (r0 <= uCloudAlt) a0 = max(csA.y, 0.0);
			else if (csA.x > a0) a1 = min(a1, csA.x);
			else a0 = max(a0, csA.y);
		}
		if (hitG) a1 = min(a1, tG);
		hitA = a1 > a0;
		if (hitA) {
			float len = a1 - a0;
			float marchLen = min(len, CLOUD_MAX_PATH);
			float dt = marchLen / float(CLOUD_STEPS);
			float tm = a0 + marchLen * 0.5;
			vec3 nm = normalize(ro + rd * tm);
			float fp = tm * uPixelAngle / max(abs(dot(nm, rd)), 0.05);
			float cover = smoothstep(0.08, 0.55, cloudDensity(uBodyInv * nm, false, fp));
			float mask = clamp(uCloudCover * 2.0, 0.0, 1.0) * (1.0 - smoothstep(45000.0, 120000.0, tm));
			if (cover * mask < 0.004) {
				hitA = false;
			} else {
				float cj = 0.25 + 0.5 * fract(jitter + 0.381966);
				float cosS = dot(rd, uSunDir);
				vec3 sunTc = sunTransmittance(nm * (uCloudAlt + 0.5 * CLOUD_THICK), uSunDir);
				float trans = 1.0;
				vec3 acc = vec3(0.0);
				float densSum = 0.0;
				for (int i = 0; i < CLOUD_STEPS; i++) {
					float t = a0 + (float(i) + cj) * dt;
					vec3 pp = ro + rd * t;
					float rr = length(pp);
					vec3 np = pp / rr;
					float h = clamp((rr - uCloudAlt) / CLOUD_THICK, 0.0, 1.0);
					float eP = cloudErosion(uBodyInv * np, fp, CLOUD_DETAIL);
					float dn = cloudSlabDensity(cover, h, eP);
					densSum += dn;
					if (dn > 0.002) {
						float tauL = cloudSunDepth(h, cover, dot(np, uSunDir));
						vec3 ps = pp + uSunDir * 450.0;
						float rs = length(ps);
						float hs = clamp((rs - uCloudAlt) / CLOUD_THICK, 0.0, 1.0);
						tauL += cloudSlabDensity(cover, hs, cloudErosion(uBodyInv * (ps / rs), fp, 1)) * CLOUD_SIGMA * 450.0;
						float stepTau = dn * CLOUD_SIGMA * dt;
						vec3 direct = uSunIrr * sunTc * (cloudScatterGain(tauL, cosS) * cloudPowder(stepTau, cosS) + cloudFill(tauL, h));
						vec3 amb = uAmbient * (0.65 + 0.55 * h);
						vec3 Ls = vec3(0.93) / kPI * (direct + amb) * cloudBillowShade(eP) + NIGHT_AMBIENT * 0.6;
						float stepA = 1.0 - exp(-stepTau);
						acc += trans * Ls * stepA;
						trans *= 1.0 - stepA;
					}
				}
				float opacity = 1.0 - trans;
				if (len > marchLen) {
					// the rest of a grazing path: the average density, lit like what was marched
					float eTau = densSum / float(CLOUD_STEPS) * CLOUD_SIGMA * min(len - marchLen, CLOUD_EXTRA_PATH);
					vec3 Lm = acc / max(opacity, 1e-3);
					acc += trans * Lm * (1.0 - exp(-eTau));
					trans *= exp(-eTau);
					opacity = 1.0 - trans;
				}
				alphaA = opacity * mask;
				vec3 lm = acc / max(opacity, 1e-4);
				lightA = lm / (1.0 + lm / ${f(CLOUD_RADIANCE_KNEE)});
				cloudTA = tm;
				if (alphaA < 0.002) {
					hitA = false;
					alphaA = 0.0;
				}
			}
		}
	}
	vec2 csB = raySphere(r0, d, uCirrusAlt);
	float cloudTB = r0 < uCirrusAlt ? csB.y : csB.x;
	bool hitB = inAtm && csB.y > 0.0 && cloudTB > 0.0 && (!hitG || cloudTB < tG);
	vec3 dirBFB = vec3(0.0);
	float densB = 0.0;
	if (hitB) {
		dirBFB = uBodyInv * normalize(ro + rd * cloudTB);
		densB = cirrusDensity(dirBFB);
		alphaB = densB;
		if (alphaB < 0.003) {
			hitB = false;
			alphaB = 0.0;
		}
	}
	// nearest layer first: slot 1 snapshot at tc1, slot 2 at tc2
	bool aFirst = !hitB || (hitA && cloudTA <= cloudTB);
	if (hitA && hitB) {
		tcA = aFirst ? cloudTA : cloudTB;
		tcB = aFirst ? cloudTB : cloudTA;
	} else if (hitA) {
		tcA = cloudTA;
	} else if (hitB) {
		tcA = cloudTB;
	}
#endif
	if (inAtm) {
		float power = h < uAtmH ? 2.0 : 1.0;
		// the air in front of the ground at the middle of each step: its in-scatter is smooth, and the
		// per-pixel jitter drew a fixed grain over the sea and the ground toward the horizon (the owner,
		// 2026-10-21); the sky keeps it against banding
		Scatter sc = marchAtmosphere(ro, rd, t0, t1, uSunDir, hitG ? 0.5 : jitter, tcA, tcB, power);
#if SHAFT_STEPS > 0
		if (uShaft > 0.01 && (uCloudCover > 0.02 || SHAFT_TERRAIN > 0) && dot(rd, uSunDir) > ${f(SHAFT.minCosToSun)}) {
			ShaftLoss sl = shaftLoss(ro, rd, t0, t1, uSunDir, fract(jitter + 0.618034), tcA, tcB);
			float shaftK = uShaft * uMieBoost * uSunIrr * ${f(SHAFT.gain)};
			// segment by segment (the composite below subtracts neighbours, so the snapshots must stay ordered), never more than maxShare of a segment
			vec3 dA = min(sl.toA * shaftK, sc.insA * ${f(SHAFT.maxShare)});
			vec3 dB = min(max(sl.toB - sl.toA, 0.0) * shaftK, (sc.insB - sc.insA) * ${f(SHAFT.maxShare)});
			vec3 dC = min(max(sl.all - sl.toB, 0.0) * shaftK, (sc.inscatter - sc.insB) * ${f(SHAFT.maxShare)});
			sc.insA -= dA;
			sc.insB -= dA + dB;
			sc.inscatter -= dA + dB + dC;
		}
#endif
		if (hitT) {
			// terrain reads through a thinner veil than the model gives; it matches the sky's again at the horizon (terrainVeil in atmosphere-model.ts)
			float vs = mix(${f(TERRAIN_VEIL.near)}, 1.0, smoothstep(${f(TERRAIN_VEIL.fadeFrom)}, ${f(TERRAIN_VEIL.fadeTo)}, tG));
			sc.inscatter *= vs;
			sc.insA *= vs;
			sc.insB *= vs;
		}
		colour = base * sc.transmittance + sc.inscatter;
#if CLOUDS
		if (hitA || hitB) {
			// lit radiance of each hit layer
			if (hitB) {
				vec3 dirI = normalize(ro + rd * cloudTB);
				float muc = dot(dirI, uSunDir);
				vec3 sunTc = sunTransmittance(dirI * uCirrusAlt, uSunDir);
				float hg = miePhase(dot(rd, uSunDir), 0.65) * 4.0 * kPI;
				float phase = 0.7 + 0.3 * clamp(hg, 0.0, 4.0);
				lightB = vec3(0.97) / kPI * (uSunIrr * sunTc * max(muc, 0.0) * phase * 1.35 + uAmbient * 0.7) + NIGHT_AMBIENT * 0.5;
			}
			// slot order: (1) the nearer layer, (2) the farther one
			vec3 l1 = lightA;
			vec3 l2 = lightB;
			float a1 = alphaA;
			float a2 = alphaB;
			if (hitA && hitB) {
				if (!aFirst) {
					l1 = lightB; l2 = lightA;
					a1 = alphaB; a2 = alphaA;
				}
			} else if (hitB) {
				l1 = lightB; a1 = alphaB;
				l2 = vec3(0.0); a2 = 0.0;
			} else {
				l2 = vec3(0.0); a2 = 0.0;
			}
			vec3 S1 = sc.insA;
			vec3 T1 = sc.transA;
			vec3 S2 = sc.insB;
			vec3 T2 = sc.transB;
			colour = S1 + a1 * T1 * l1
				+ (1.0 - a1) * ((S2 - S1) + a2 * T2 * l2
				+ (1.0 - a2) * ((sc.inscatter - S2) + sc.transmittance * base));
		}
#endif
	}

	colour += auroraNear;
	return colour;
}

void main() {
	if (uEdgeOnly > 0.5 && !halfEdge(gl_FragCoord.xy)) discard;
	vec4 vp = uInvProj * vec4(vNdc, 0.0, 1.0);
	vec3 rdView = normalize(vp.xyz / vp.w);
	vec3 rd = normalize(uCamRot * rdView);
	vec3 fwd = uCamRot * vec3(0.0, 0.0, -1.0);

	float R = uR;
	float h = max(uAlt, 0.0);
	float r0 = R + h;
	vec3 ro = uCamUp * r0;
	float d = dot(uCamUp, rd);
	vec3 cr = cross(uCamUp, rd);
	float s2 = dot(cr, cr);
	float disc = R * R - r0 * r0 * s2;
	bool hitP = disc > 0.0 && d < 0.0;
	float tHit = 0.0;
	if (hitP) {
		float q = r0 * (-d) + sqrt(disc);
		tHit = h * (2.0 * R + h) / q;
	}
	// terrain: the first hit of the baked heights before the sea-level sphere (ADR 0036)
	bool hitT = false;
	float tT = 0.0;
	float sT = 1e9;
	float tTMin = 0.0;
#if TERRAIN
	if (uTerrainOn > 0.5) {
		// the march prepass (a quarter of the pixels in each direction) already crossed the empty air
		float tFrom = 0.0;
		if (uMarchOn > 0.5) tFrom = texelFetch(uMarchStart, ivec2(gl_FragCoord.xy * uMarchScale) / MARCH_BLOCK, 0).r;
		if (tFrom < MARCH_NO_HIT * 0.5) hitT = marchTerrain(ro, rd, r0, d, hitP ? tHit : 1e9, tFrom, tT, sT, tTMin);
		// a crest stepped over between two samples (plan 133): the ground is there, not the sea far behind it
		if (!hitT && sT < 0.0 && uSilhouetteAA > 0.5) {
			hitT = true;
			tT = tTMin;
		}
	}
#endif
	bool hitG = hitP || hitT;
	float tG = hitT ? tT : tHit;

	// Silhouette coverage (plan 133, ADR 0211): the coverage of a miss's closest approach is computed, but the
	// second shading of the ground that the blend needs is not in this pass. Every form of it measured +0.3
	// to +1 ms on every pixel on the M5 (journal 133); the loop stays at one pass, a form that measured
	// within 0.2 ms of the pass before plan 133, where a plain call measured +0.5. The blend waits for a
	// resolve pass of its own.
	float cover = 0.0;
	bool edgeT = false;
	float tEdge = 0.0;
	if (uSilhouetteAA > 0.5 && !hitG) {
		float sEdge = 1e9;
#if TERRAIN
		if (sT < sEdge) {
			sEdge = sT;
			tEdge = tTMin;
			edgeT = true;
		}
#endif
		if (d < 0.0) {
			float tc = -r0 * d;
			float sSea = (r0 * sqrt(s2) - R) / max(tc * uPixelAngle, 1e-6);
			if (sSea < sEdge) {
				sEdge = sSea;
				tEdge = tc;
				edgeT = false;
			}
		}
		cover = clamp(0.5 - sEdge, 0.0, 1.0);
	}
	vec3 colour = vec3(0.0);
	float depthDist = -1.0;
	for (int pass = 0; pass < 1; pass++) { // one pass: see above
		bool first = pass == 0;
		float dPass;
		vec3 c = shadeRay(ro, rd, r0, d, h, first ? hitG : true, first ? hitT : edgeT, first ? tG : tEdge, dPass);
		if (first) {
			colour = c;
			depthDist = dPass;
			if (cover <= 0.004) break;
		} else {
			colour = mix(colour, c, cover);
		}
	}

	// A single NaN or infinity would smear through the bloom chain over the whole frame.
	bool bad = any(isnan(colour)) || any(isinf(colour));
#ifdef DEBUG_NAN
	colour = bad ? vec3(1.0, 0.0, 1.0) : min(colour, vec3(200.0));
#else
	colour = bad ? vec3(0.0) : min(colour, vec3(200.0));
#endif
	gl_FragColor = vec4(colour, 1.0);
#ifdef DEBUG_VIEW
	// Development aid (plan 019): set material.defines.DEBUG_VIEW to inspect intermediate values.
	#if DEBUG_VIEW == 1
	gl_FragColor = vec4(rd * 0.5 + 0.5, 1.0);
	#elif DEBUG_VIEW == 2
	gl_FragColor = vec4(hitG ? 1.0 : 0.0, inAtm ? 1.0 : 0.0, fract(tG / 100.0), 1.0);
	#elif DEBUG_VIEW == 3
	gl_FragColor = vec4(base, 1.0);
	#elif DEBUG_VIEW == 5
	Scatter dbg = marchAtmosphere(ro, rd, t0, t1, uSunDir, jitter, 1e30, 1e30, 2.0);
	gl_FragColor = vec4(dbg.inscatter, 1.0);
	#elif DEBUG_VIEW == 6
	vec4 dbgT = hitP ? terrainAt(ro + rd * tHit) : vec4(0.0);
	gl_FragColor = vec4(dbgT.x / 3000.0, length(dbgT.yzw), hitT ? 1.0 : 0.0, 1.0);
	#elif DEBUG_VIEW == 4
	gl_FragColor = vec4(uAlt / 100.0, d * 0.5 + 0.5, disc > 0.0 ? 1.0 : 0.0, 1.0);
	#endif
#endif
#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	float zv = depthDist > 0.0 ? depthDist * dot(rd, fwd) : 1e12;
	gl_FragDepth = depthDist > 0.0 ? log2(1.0 + zv) * logDepthBufFC * 0.5 : 1.0;
#else
	gl_FragDepth = depthDist > 0.0 ? 0.5 : 1.0;
#endif
	gl_FragColor.a = mix(1.0, gl_FragDepth, uPackDepth);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;
