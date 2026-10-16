/**
 * GLSL shared by the planet pass and the environment-light sky: single-scattering Rayleigh + Mie
 * march (the twin of `atmosphere-model.ts`, ADR 0027) and the hash noise. Positions are relative
 * to the planet centre in the inertial frame. Expects `VIEW_SAMPLES` and `LIGHT_SAMPLES` defines.
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
vec2 sunDepth(vec3 p, vec3 l) {
	float r = length(p);
	float mu = dot(p, l) / r;
	if (mu < 0.0) {
		float disc = r * r * (mu * mu - 1.0) + uR * uR;
		if (disc >= 0.0) return vec2(-1.0);
	}
	float len = raySphere(r, mu, uR + uAtmH).y;
	vec2 od = vec2(0.0);
	for (int i = 0; i < LIGHT_SAMPLES; i++) {
		float u = (float(i) + 0.5) / float(LIGHT_SAMPLES);
		float s = len * u * u;
		float ds = len * 2.0 * u / float(LIGHT_SAMPLES);
		float h = max(length(p + l * s) - uR, 0.0);
		od += vec2(exp(-h / uHR), exp(-h / uHM)) * ds;
	}
	return od;
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
	vec3 insCloud; // inscatter up to the cloud distance tc
	vec3 transCloud;
};

// March t0..t1 along rd from ro. tc is a distance at which to snapshot the state (cloud layer), or < 0.
Scatter marchAtmosphere(vec3 ro, vec3 rd, float t0, float t1, vec3 l, float jitter, float tc, float power) {
	Scatter o;
	o.inscatter = vec3(0.0);
	o.insCloud = vec3(0.0);
	o.transCloud = vec3(1.0);
	float len = max(t1 - t0, 0.0);
	float cosv = dot(rd, l);
	float pr = rayleighPhase(cosv);
	float pm = miePhase(cosv, uMieG);
	vec2 od = vec2(0.0);
	bool snap = false;
	for (int i = 0; i < VIEW_SAMPLES; i++) {
		float u = (float(i) + jitter) / float(VIEW_SAMPLES);
		float s = t0 + len * pow(u, power);
		float ds = len * power * pow(max(u, 1e-4), power - 1.0) / float(VIEW_SAMPLES);
		if (tc >= 0.0 && !snap && s >= tc) {
			snap = true;
			o.insCloud = o.inscatter * uSunIrr * uSkyBoost;
			o.transCloud = extinction(od);
		}
		vec3 p = ro + rd * s;
		float h = max(length(p) - uR, 0.0);
		float dR = exp(-h / uHR) * ds;
		float dM = exp(-h / uHM) * ds;
		od += vec2(dR, dM);
		vec2 sd = sunDepth(p, l);
		if (sd.x < 0.0) continue;
		vec3 att = extinction(od + sd);
		o.inscatter += att * (uBetaR * dR * pr + vec3(uBetaM / 1.1 * dM * pm));
	}
	o.inscatter *= uSunIrr * uSkyBoost;
	o.transmittance = extinction(od);
	if (tc >= 0.0 && !snap) {
		o.insCloud = o.inscatter;
		o.transCloud = o.transmittance;
	}
	return o;
}

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
// Plain float-position noise (clouds, stars, ocean): fine where precision of the position is not critical.
float noiseF(vec3 p) {
	vec3 fl = floor(p);
	return valueNoiseCell(ivec3(fl), p - fl);
}
`;
