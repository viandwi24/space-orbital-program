/**
 * The aurora (plan 061, ADR 0093): the GLSL twin of `aurora-model.ts`. A few jittered steps through the shell of
 * emission 80 to 320 km above the surface sum `profile(height) * footprint(magnetic coordinates, time)`; the planet
 * pass adds the result to the sky behind the atmosphere (and in front of the ground when seen from orbit). Included
 * only when the preset has `auroraSteps`; the pass skips the call when `uAurora` is 0.
 */
import { AURORA } from '../aurora-model.ts';

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
const vec3 = (c: readonly number[]): string => `vec3(${f(c[0]!)}, ${f(c[1]!)}, ${f(c[2]!)})`;

const lobes = AURORA.lobes
	.map(
		(l) =>
			`	{ float sg = h < ${f(l.peak)} ? ${f(l.below)} : ${f(l.above)}; float x = (h - ${f(l.peak)}) / sg; e += ${vec3(l.colour.map((c) => (c * l.share * 2) / (Math.sqrt(2 * Math.PI) * (l.below + l.above))))} * exp(-0.5 * x * x); }`
	)
	.join('\n');

const rate = (turns: number): string => f((2 * Math.PI * turns) / AURORA.period);

export const auroraGLSL = /* glsl */ `
// --- aurora (plan 061; the twin of aurora-model.ts) ------------------------------------------------------------------
uniform float uAurora;     // 0..1 strength: 0 skips the march (day, low latitude, no aurora on this body)
uniform vec3 uAuroraAxis;  // magnetic axis, body-fixed
uniform vec3 uAuroraMid;   // toward magnetic midnight, body-fixed, perpendicular to the axis
uniform vec3 uAuroraSide;  // cross(axis, mid)
uniform float uAuroraTime; // seconds, wrapped at the period

vec3 auroraProfile(float h) {
	vec3 e = vec3(0.0);
${lobes}
	return e;
}

float auroraFootprint(float colat, float psi, float t, float filt) {
	float warp = ${f(AURORA.foldAmplitude[0])} * sin(3.0 * psi + ${rate(AURORA.turns.foldA)} * t)
		+ ${f(AURORA.foldAmplitude[1])} * sin(7.0 * psi - ${rate(AURORA.turns.foldB)} * t + 1.3)
		+ ${f(AURORA.foldAmplitude[2])} * sin(13.0 * psi + ${rate(AURORA.turns.foldC)} * t + 2.1);
	float cw = colat - warp;
	float k = 0.5 + 0.5 * cos(psi);
	float width = mix(${f(AURORA.widthDay)}, ${f(AURORA.widthNight)}, k);
	float wide = sqrt(width * width + filt * filt);
	float x = (cw - mix(${f(AURORA.colatDay)}, ${f(AURORA.colatNight)}, k)) / wide;
	float band = exp(-x * x) * width / wide;
	float sf = filt / ${f(AURORA.streakFilter)};
	float streak = 0.65 + 0.35 / (1.0 + sf * sf) * sin(23.0 * psi - ${rate(AURORA.turns.rays)} * t + 4.0 * cw * ${f(1 / (Math.PI / 180))});
	float gaps = 0.25 + 0.75 * smoothstep(-0.4, 0.5, sin(2.0 * psi + 0.7) * sin(5.0 * psi - ${rate(2)} * t));
	return clamp(band * streak * gaps, 0.0, 1.0);
}

// Emission along the ray between its two stretches of the shell; 'far' is what lies beyond splitDist (behind the atmosphere).
vec3 auroraMarch(vec3 ro, vec3 rd, float r0, float d, bool hitG, float splitDist, float jitter, out vec3 farPart) {
	farPart = vec3(0.0);
	vec2 sT = raySphere(r0, d, uR + ${f(AURORA.shellTop)});
	if (sT.y <= 0.0) return vec3(0.0);
	vec2 sB = raySphere(r0, d, uR + ${f(AURORA.shellBase)});
	float a0 = max(sT.x, 0.0);
	float a1 = sT.y;
	float b0 = 0.0;
	float b1 = 0.0;
	if (sB.y > 0.0) {
		if (sB.x > 0.0) {
			// outside the hollow, the ray dips into it
			b0 = sB.y;
			b1 = a1;
			a1 = sB.x;
			if (hitG) b1 = b0;
		} else {
			// inside the hollow
			if (hitG) return vec3(0.0);
			a0 = max(a0, sB.y);
		}
	}
	float len1 = max(a1 - a0, 0.0);
	float total = len1 + max(b1 - b0, 0.0);
	if (total <= 0.0) return vec3(0.0);
	vec3 near = vec3(0.0);
	float ds = total / float(AURORA_STEPS);
	float filt = ds * ${f(AURORA.filterShare)} / (uR + ${f(AURORA.lobes[0].peak)});
	for (int i = 0; i < AURORA_STEPS; i++) {
		float s = (float(i) + jitter) * ds;
		s = s < len1 ? a0 + s : b0 + (s - len1);
		vec3 p = ro + rd * s;
		float r = length(p);
		vec3 n = p / r;
		float night = smoothstep(${f(AURORA.nightNone)}, ${f(AURORA.nightFull)}, dot(n, uSunDir));
		if (night <= 0.0) continue;
		vec3 nb = uBodyInv * n;
		float ca = clamp(dot(nb, uAuroraAxis), -1.0, 1.0);
		vec3 pp = nb - ca * uAuroraAxis;
		float psi = atan(dot(pp, uAuroraSide), dot(pp, uAuroraMid));
		float fp = auroraFootprint(acos(ca), psi, uAuroraTime, filt);
		vec3 e = auroraProfile(r - uR) * (fp * night * ds * ${f(AURORA.gain)});
		if (s < splitDist) near += e; else farPart += e;
	}
	return near;
}
`;
