/**
 * The march prepass (plan 039, ADR 0053): one fragment per block of `MARCH_BLOCK` x `MARCH_BLOCK`
 * pixels of the planet pass runs a cone-widened sphere trace of the terrain along the block's centre
 * ray and writes how far the whole block's rays are certain to be clear of the ground (`coneStart` in
 * `terrain-model.ts` is the tested twin, minus the look inside long steps). The planet pass starts
 * each pixel's own march there, so the far, expensive part of every ray is crossed once per block.
 */
import { atmosphereGLSL } from './atmosphere.glsl.ts';
import { terrainMarchGLSL } from './planet.glsl.ts';

export const marchVertex = /* glsl */ `
void main() {
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const marchFragment = /* glsl */ `
${atmosphereGLSL}
uniform mat3 uBodyInv;
uniform float uPixelAngle;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec3 uCamUp;
uniform float uAlt;        // camera altitude above the sphere, m
uniform vec2 uFullSize;    // size of the planet pass's target, px
uniform float uConeAngle;  // half angle of a block's cone, rad
${terrainMarchGLSL}

float coneStart(vec3 ro, vec3 rd, float r0, float d, float tLimit) {
	vec2 shell = raySphere(r0, d, uR + T_MAX);
	if (shell.y <= 0.0) return MARCH_NO_HIT;
	float t = max(shell.x, 0.0);
	float tEnd = min(shell.y, tLimit);
	if (uSkipR > 0.0) t = max(t, uSkipR / sqrt(max(1.0 - d * d, 0.0025)));
	if (t >= tEnd) return MARCH_NO_HIT;
	float tPrev = t;
	float gm = 0.0;
	for (int i = 0; i < TERRAIN_PRE_STEPS; i++) {
		vec3 p = ro + rd * t;
		float r = length(p);
		float c = rayAltitude(r0, d, t, p) - terrainH(p, gm);
		float slope = clamp(2.0 * gm + T_SLOPE_MIN, T_SLOPE_MIN, T_SLOPE);
		// sideways the ground may rise at the global bound, whatever the local gradient says at the centre ray
		float widen = uConeAngle * (1.0 + T_SLOPE);
		float cone = c - t * widen;
		if (cone < 0.0) return tPrev;
		float mu = dot(rd, p / r);
		float dt = max(max(t * mix(T_MIN_FRAC, T_FAR_FRAC, smoothstep(50.0, 500.0, t)), t * uPixelAngle * 1.5), T_MIN_M);
		dt = max(dt, T_RELAX * cone / (slope + max(-mu, 0.0)));
		if (cone < dt * 0.5) {
			// a step long against the clearance: look inside it so a thin crest in the block's cone is not skipped
			for (int j = 1; j < 3; j++) {
				float ts = t + dt * float(j) / 3.0;
				if (ts >= tEnd) break;
				vec3 ps = ro + rd * ts;
				float cs = rayAltitude(r0, d, ts, ps) - terrainH(ps, gm);
				if (cs - ts * uConeAngle * (1.0 + T_SLOPE) < 0.0) return t;
			}
		}
		tPrev = t;
		t += dt;
		if (t >= tEnd) {
			t = tEnd;
			vec3 pe = ro + rd * t;
			float ce = rayAltitude(r0, d, t, pe) - terrainH(pe, gm);
			if (ce - t * uConeAngle * (1.0 + T_SLOPE) < 0.0) return tPrev;
			return MARCH_NO_HIT;
		}
	}
	return tPrev;
}

void main() {
	// the centre of this block, in pixels of the planet pass's target
	vec2 pixel = (floor(gl_FragCoord.xy) + 0.5) * float(MARCH_BLOCK);
	vec4 vp = uInvProj * vec4(pixel / uFullSize * 2.0 - 1.0, 0.0, 1.0);
	vec3 rd = normalize(uCamRot * normalize(vp.xyz / vp.w));
	float R = uR;
	float h = max(uAlt, 0.0);
	float r0 = R + h;
	vec3 ro = uCamUp * r0;
	float d = dot(uCamUp, rd);
	vec3 cr = cross(uCamUp, rd);
	float disc = R * R - r0 * r0 * dot(cr, cr);
	float tHit = 1e9;
	if (disc > 0.0 && d < 0.0) tHit = h * (2.0 * R + h) / (r0 * (-d) + sqrt(disc));
	gl_FragColor = vec4(coneStart(ro, rd, r0, d, tHit), 0.0, 0.0, 1.0);
}
`;
