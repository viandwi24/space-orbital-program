import { SUN_DEPTH_H, SUN_DEPTH_MU, SUN_DEPTH_SCALE } from '../sun-depth-table.ts';

/** Integer-hash value noise (pcg3d) shared by the planet pass and the terrain bake. */
export const hashNoiseGLSL = /* glsl */ `
// --- hash noise ---------------------------------------------------------------------------------
uvec3 pcg3d(uvec3 v) {
	v = v * 1664525u + 1013904223u;
	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	v ^= v >> 16u;
	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	return v;
}
float hash13i(ivec3 c) { return float(pcg3d(uvec3(c)).x) * (1.0 / 4294967295.0); }
vec3 hash33i(ivec3 c) { return vec3(pcg3d(uvec3(c))) * (1.0 / 4294967295.0); }

float valueNoiseCell(ivec3 c, vec3 f) {
	f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float a = mix(hash13i(c), hash13i(c + ivec3(1, 0, 0)), f.x);
	float b = mix(hash13i(c + ivec3(0, 1, 0)), hash13i(c + ivec3(1, 1, 0)), f.x);
	float cc = mix(hash13i(c + ivec3(0, 0, 1)), hash13i(c + ivec3(1, 0, 1)), f.x);
	float d = mix(hash13i(c + ivec3(0, 1, 1)), hash13i(c + ivec3(1, 1, 1)), f.x);
	return mix(mix(a, b, f.y), mix(cc, d, f.y), f.z);
}
// Three values per lattice fetch: one pcg3d hash gives a whole vec3, so a vector warp costs one noise, not three.
vec3 noiseF3(vec3 p) {
	vec3 fl = floor(p);
	vec3 f = p - fl;
	f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	ivec3 c = ivec3(fl);
	vec3 a = mix(hash33i(c), hash33i(c + ivec3(1, 0, 0)), f.x);
	vec3 b = mix(hash33i(c + ivec3(0, 1, 0)), hash33i(c + ivec3(1, 1, 0)), f.x);
	vec3 cc = mix(hash33i(c + ivec3(0, 0, 1)), hash33i(c + ivec3(1, 0, 1)), f.x);
	vec3 d = mix(hash33i(c + ivec3(0, 1, 1)), hash33i(c + ivec3(1, 1, 1)), f.x);
	return mix(mix(a, b, f.y), mix(cc, d, f.y), f.z);
}
// Plain float-position noise (clouds, stars, ocean): fine where precision of the position is not critical.
float noiseF(vec3 p) {
	vec3 fl = floor(p);
	return valueNoiseCell(ivec3(fl), p - fl);
}
`;

/**
 * GLSL shared by the planet pass and the environment-light sky: single-scattering Rayleigh + Mie
 * march (the twin of `atmosphere-model.ts`, ADR 0027) and the hash noise. Positions are relative
 * to the planet centre in the inertial frame. Expects the `VIEW_SAMPLES` define (the light path is a table lookup since plan 039).
 */
export const atmosphereGLSL = /* glsl */ `
uniform float uR;
uniform float uAtmH;
uniform vec3 uBetaR;
uniform float uBetaM;
uniform float uHR;
uniform float uHM;
uniform float uMieG;
uniform float uSunIrr;
uniform float uSkyBoost;
uniform float uMieBoost;
uniform sampler2D uSunDepthLUT; // optical depth to the top of the atmosphere, see sun-depth-table.ts

const float kPI = 3.14159265359;

// Near and far roots of a ray from radius r0 with cosine mu (against the radial) and a sphere rs; (-1,-1) if missed.
vec2 raySphere(float r0, float mu, float rs) {
	float b = r0 * mu;
	float disc = b * b - r0 * r0 + rs * rs;
	if (disc < 0.0) return vec2(-1.0);
	float s = sqrt(disc);
	return vec2(-b - s, -b + s);
}

// Rayleigh and Mie column density from p toward direction l to the top of the atmosphere; x < 0 when the planet blocks it.
// One fetch of the baked table (plan 039); the grazing ray under which the planet blocks the sun is the table's own edge.
vec2 sunDepth(vec3 p, vec3 l) {
	float r = length(p);
	float mu = dot(p, l) / r;
	float rho = uR / r;
	float muH = -sqrt(max(1.0 - rho * rho, 0.0));
	if (mu < muH) return vec2(-1.0);
	float m = clamp((mu - muH) / (1.0 - muH), 0.0, 1.0);
	float hn = clamp((r - uR) / uAtmH, 0.0, 1.0);
	vec2 uv = (vec2(sqrt(m), sqrt(hn)) * vec2(${SUN_DEPTH_MU - 1}.0, ${SUN_DEPTH_H - 1}.0) + 0.5) / vec2(${SUN_DEPTH_MU}.0, ${SUN_DEPTH_H}.0);
	return texture(uSunDepthLUT, uv).xy * ${SUN_DEPTH_SCALE}.0;
}

vec3 extinction(vec2 od) {
	return exp(-(uBetaR * od.x + vec3(uBetaM * 1.1 * od.y)));
}

// Transmittance of sunlight to a point (black when blocked).
vec3 sunTransmittance(vec3 p, vec3 l) {
	vec2 od = sunDepth(p, l);
	return od.x < 0.0 ? vec3(0.0) : extinction(od);
}

float rayleighPhase(float c) { return (3.0 / (16.0 * kPI)) * (1.0 + c * c); }
float miePhase(float c, float g) {
	return (1.0 / (4.0 * kPI)) * ((1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5));
}

struct Scatter {
	vec3 inscatter; // radiance added along the whole segment
	vec3 transmittance; // of the whole segment
	vec3 insA; // inscatter up to the first snapshot distance tcA (a cloud layer)
	vec3 transA;
	vec3 insB; // and up to the second, tcB >= tcA
	vec3 transB;
};

// March t0..t1 along rd from ro. tcA <= tcB are distances at which to snapshot the state (cloud layers); 1e30 for none (the snapshot is then the whole path).
Scatter marchAtmosphere(vec3 ro, vec3 rd, float t0, float t1, vec3 l, float jitter, float tcA, float tcB, float power) {
	Scatter o;
	o.inscatter = vec3(0.0);
	o.insA = vec3(0.0);
	o.transA = vec3(1.0);
	o.insB = vec3(0.0);
	o.transB = vec3(1.0);
	float len = max(t1 - t0, 0.0);
	float cosv = dot(rd, l);
	float pr = rayleighPhase(cosv);
	float pm = miePhase(cosv, uMieG);
	vec2 od = vec2(0.0);
	vec3 insR = vec3(0.0);
	vec3 insM = vec3(0.0);
	bool snapA = false;
	bool snapB = false;
	for (int i = 0; i < VIEW_SAMPLES; i++) {
		float u = (float(i) + jitter) / float(VIEW_SAMPLES);
		float s = t0 + len * pow(u, power);
		float ds = len * power * pow(max(u, 1e-4), power - 1.0) / float(VIEW_SAMPLES);
		if (!snapA && s >= tcA) {
			snapA = true;
			o.insA = (insR * uSkyBoost + insM * uMieBoost) * uSunIrr;
			o.transA = extinction(od);
		}
		if (!snapB && s >= tcB) {
			snapB = true;
			o.insB = (insR * uSkyBoost + insM * uMieBoost) * uSunIrr;
			o.transB = extinction(od);
		}
		vec3 p = ro + rd * s;
		float h = max(length(p) - uR, 0.0);
		float dR = exp(-h / uHR) * ds;
		float dM = exp(-h / uHM) * ds;
		od += vec2(dR, dM);
		vec2 sd = sunDepth(p, l);
		if (sd.x < 0.0) continue;
		vec3 att = extinction(od + sd);
		insR += att * uBetaR * dR * pr;
		insM += att * (uBetaM / 1.1 * dM * pm);
	}
	o.inscatter = (insR * uSkyBoost + insM * uMieBoost) * uSunIrr;
	o.transmittance = extinction(od);
	if (!snapA) {
		o.insA = o.inscatter;
		o.transA = o.transmittance;
	}
	if (!snapB) {
		o.insB = o.inscatter;
		o.transB = o.transmittance;
	}
	return o;
}
${hashNoiseGLSL}
`;
