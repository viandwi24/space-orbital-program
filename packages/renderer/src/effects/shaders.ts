/**
 * GLSL for the effects (plan 020). All output linear HDR with premultiplied-by-alpha additive or
 * normal blending set on the material, and include the log depth, tone mapping and colour space
 * chunks like the planet pass (ADR 0027).
 */

export const PLUME_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uLength;
uniform float uExitR;
uniform float uMaxR;
uniform float uRadiusScale;
uniform float uLengthScale;
varying float vT;
varying vec3 vN;
varying vec3 vView;
varying float vAng;
void main() {
	float t = position.y;
	float widen = smoothstep(0.0, 0.5, t);
	float r = mix(uExitR, uMaxR, widen) * pow(max(1.0 - t, 0.0), 0.55) * uRadiusScale;
	vec3 local = vec3(position.x * r, -t * uLength * uLengthScale, position.z * r);
	vec4 mv = modelViewMatrix * vec4(local, 1.0);
	vN = normalize(normalMatrix * vec3(position.x, 0.35, position.z));
	vView = normalize(-mv.xyz);
	vT = t;
	vAng = atan(position.z, position.x);
	gl_Position = projectionMatrix * mv;
	#include <logdepthbuf_vertex>
}
`;

export const PLUME_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uGain;
uniform float uVacuum;
uniform float uDiamonds;
uniform float uPeriod;
uniform float uLength;
uniform vec3 uColor;
uniform vec3 uCore;
varying float vT;
varying vec3 vN;
varying vec3 vView;
varying float vAng;
void main() {
	#include <logdepthbuf_fragment>
	float facing = clamp(abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
	float edge = pow(facing, mix(1.5, 3.2, uVacuum));
	float along = pow(max(1.0 - vT, 0.0), mix(1.3, 2.2, uVacuum));
	float flick = 0.84 + 0.16 * sin(vT * 38.0 - uTime * 55.0 + vAng * 2.0) * sin(vAng * 3.0 + uTime * 23.0 + vT * 9.0);
	float dia = 1.0 + uDiamonds * 1.1 * pow(max(0.0, sin(vT * uLength * 6.2831853 / uPeriod)), 3.0) * (1.0 - vT);
	vec3 col = mix(uCore, uColor, smoothstep(0.0, 0.45, vT));
	col = mix(col, uColor * vec3(0.55, 0.32, 0.2), smoothstep(0.45, 1.0, vT));
	col = mix(col, col * vec3(0.72, 0.86, 1.3), uVacuum);
	float a = clamp(edge * along * flick * dia, 0.0, 1.0);
	float gain = uGain * (1.0 + 4.0 * edge * edge * along);
	gl_FragColor = vec4(col * gain, a);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/** One camera-facing quad at the object origin (engine glow at the nozzle). */
export const SPRITE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uSize;
varying vec2 vUv;
void main() {
	vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
	mv.xy += position.xy * uSize;
	vUv = position.xy * 2.0;
	gl_Position = projectionMatrix * mv;
	#include <logdepthbuf_vertex>
}
`;

export const SPRITE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uGain;
varying vec2 vUv;
void main() {
	#include <logdepthbuf_fragment>
	float d = length(vUv);
	float glow = exp(-d * d * 3.2) + 0.5 * pow(max(1.0 - d, 0.0), 4.0);
	float a = clamp(glow, 0.0, 1.0) * step(d, 1.0);
	gl_FragColor = vec4(uColor * uGain * glow, a);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/** Instanced camera-facing quads for smoke (normal blending) and fireballs (additive). */
export const FIELD_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos;
attribute float iSize;
attribute vec4 iColor;
attribute float iSeed;
uniform vec3 uSunWorld;
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
varying float vDepth;
varying vec3 vSun;
void main() {
	vec4 mv = viewMatrix * vec4(iPos, 1.0);
	vDepth = -mv.z;
	vSun = normalize(mat3(viewMatrix) * uSunWorld);
	mv.xy += position.xy * iSize;
	vUv = position.xy * 2.0;
	vColor = iColor;
	vSeed = iSeed;
	gl_Position = projectionMatrix * mv;
	#include <logdepthbuf_vertex>
}
`;

const NOISE = /* glsl */ `
float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/**
 * Smoke puff (ADR 0047): a lumpy sphere impostor lit by the sun. Two noise octaves lump the outline
 * and the surface normal; the normal is lit with wrap lighting (the shaded side is not black, it
 * is the sky), the backlit rim glows when the sun is behind the puff (forward scattering), and
 * the thick middle is darker than the edge. `iColor.rgb` is the diffuse radiance of white smoke in
 * the current light times the tint (already HDR), `iColor.a` the opacity.
 */
export const SMOKE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
varying float vDepth;
varying vec3 vSun;
${NOISE}
void main() {
	#include <logdepthbuf_fragment>
	float d = length(vUv);
	vec2 q = vUv * 2.2 + vSeed * 31.0;
	mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
	float n = vnoise(q) * 0.6 + vnoise(rot * q * 2.3 + 7.0) * 0.4;
	float shape = smoothstep(1.0, 0.2, d + (n - 0.5) * 0.8);
	// A bumpy sphere normal in view space.
	vec2 bump = vec2(vnoise(q + 3.1), vnoise(q + 9.7)) - 0.5;
	vec3 nrm = normalize(vec3(vUv + bump * 0.7, sqrt(max(1.0 - d * d, 0.05))));
	float lit = dot(nrm, vSun);
	float wrap = smoothstep(-0.55, 0.9, lit);
	float shade = mix(0.5, 1.25, wrap);
	// Silver lining: sun behind the puff lights the thin edge.
	float rim = pow(1.0 - clamp(nrm.z, 0.0, 1.0), 2.0) * max(-vSun.z, 0.0) * 0.9;
	// Thick middle is darker (self shadow), edge lighter.
	float thick = mix(0.82, 1.0, smoothstep(0.1, 0.9, d));
	float near = smoothstep(1.0, 9.0, vDepth);
	gl_FragColor = vec4(vColor.rgb * (shade * thick + rim), shape * vColor.a * near);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/** Fireball / flash: additive, hot core with a noisy rim. `iColor.rgb` HDR emission, `a` unused as alpha scale. */
export const FIRE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
${NOISE}
void main() {
	#include <logdepthbuf_fragment>
	float d = length(vUv);
	float n = vnoise(vUv * 3.0 + vSeed * 13.0) * 0.65 + vnoise(vUv * 7.0 - vSeed * 5.0) * 0.35;
	float body = smoothstep(1.0, 0.1, d + (n - 0.5) * 0.55);
	float core = pow(max(1.0 - d, 0.0), 2.0);
	vec3 col = vColor.rgb * (0.35 + 1.4 * core);
	gl_FragColor = vec4(col * body, body * vColor.a);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/** Plasma bubble around the windward end of the vessel. */
export const SHELL_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldN;
varying vec3 vN;
varying vec3 vView;
varying float vAxial;
void main() {
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	vWorldN = normalize(mat3(modelMatrix) * normal);
	vN = normalize(normalMatrix * normal);
	vView = normalize(-mv.xyz);
	vAxial = position.y;
	gl_Position = projectionMatrix * mv;
	#include <logdepthbuf_vertex>
}
`;

export const SHELL_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uForward;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uTint;
uniform float uLength;
uniform float uTip;
varying vec3 vWorldN;
varying vec3 vN;
varying vec3 vView;
varying float vAxial;
void main() {
	#include <logdepthbuf_fragment>
	float facing = clamp(abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
	float rim = pow(1.0 - facing, 1.4);
	float windward = smoothstep(-0.25, 0.8, dot(normalize(vWorldN), uForward));
	float flick = 0.88 + 0.12 * sin(uTime * 41.0 + vWorldN.x * 7.0 + vWorldN.y * 5.0);
	// The shell thins out towards the tail so its aft rings do not float as separate patches.
	float depth = clamp((uTip - vAxial) / max(uLength, 1e-3), 0.0, 1.0);
	float tail = 1.0 - smoothstep(0.3, 0.8, depth);
	vec3 hot = mix(uTint, mix(uTint, vec3(1.0), 0.3), smoothstep(0.55, 1.0, uIntensity));
	float a = uIntensity * windward * (0.1 + 0.5 * rim) * flick * tail;
	gl_FragColor = vec4(hot * (0.7 + 1.2 * uIntensity), clamp(a, 0.0, 1.0));
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/**
 * Exhaust trail ribbon (plan 040, ADR 0080). Two vertices per point; the vertex shader turns the
 * pair to face the camera (across the direction of travel), the fragment shader makes a soft,
 * lumpy white band lit like the smoke. `aAlong` is 0 at the nozzle end and 1 at the old end.
 */
export const TRAIL_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aCentre;
attribute vec3 aTan;
attribute float aSide;
attribute float aWidth;
attribute float aAlpha;
attribute float aAlong;
varying float vSide;
varying float vAlpha;
varying float vAlong;
varying float vWidth;
void main() {
	vec3 toCam = cameraPosition - aCentre;
	vec3 side = cross(aTan, toCam);
	float l = length(side);
	side = l > 1e-5 ? side / l : vec3(1.0, 0.0, 0.0);
	vec3 p = aCentre + side * (aSide * aWidth * 0.5);
	vSide = aSide;
	vAlpha = aAlpha;
	vAlong = aAlong;
	vWidth = aWidth;
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
	#include <logdepthbuf_vertex>
}
`;

export const TRAIL_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uLight;
varying float vSide;
varying float vAlpha;
varying float vAlong;
varying float vWidth;
${NOISE}
void main() {
	#include <logdepthbuf_fragment>
	float d = abs(vSide);
	// Lumpy outline: noise along the trail and across it, coarser as the ribbon widens.
	float n = vnoise(vec2(vAlong * 90.0, vSide * 1.7 + 3.0)) * 0.6 + vnoise(vec2(vAlong * 260.0 + 7.0, vSide * 3.1)) * 0.4;
	float edge = smoothstep(1.0, 0.15, d + (n - 0.5) * 0.7);
	float core = mix(0.85, 1.0, smoothstep(0.9, 0.0, d));
	// Young exhaust is warm; it cools to white smoke within the first few percent of the trail.
	vec3 warm = vec3(1.0, 0.62, 0.34);
	vec3 col = uLight * mix(warm, vec3(0.95, 0.96, 0.98), smoothstep(0.0, 0.06, vAlong));
	gl_FragColor = vec4(col * core, edge * vAlpha * 0.6);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;
