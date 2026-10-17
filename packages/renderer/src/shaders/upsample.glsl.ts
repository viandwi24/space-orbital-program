/**
 * Depth-aware upsample of the half-resolution planet pass (plan 050, ADR 0061). Drawn in the scene in the
 * planet pass's place: reads the float target (rgb = radiance, a = the fragment depth the planet pass
 * wrote) and writes the colour and the depth at full resolution. `upsampleWeights` in `half-res.ts` is
 * the tested twin of the weights.
 */
import { UPSAMPLE_TOLERANCE_OCTAVES } from '../half-res.ts';

export const upsampleVertex = /* glsl */ `
void main() {
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const upsampleFragment = /* glsl */ `
#include <common>
uniform sampler2D uHalf;
uniform vec2 uFullSize;   // scene target, px
uniform vec2 uHalfSize;   // planet target, px
uniform float uOctaves;   // log2(far + 1): converts a depth difference to octaves of distance

const float TOLERANCE = ${UPSAMPLE_TOLERANCE_OCTAVES.toFixed(3)};

void main() {
	vec2 p = gl_FragCoord.xy / uFullSize * uHalfSize - 0.5;
	vec2 base = floor(p);
	vec2 f = p - base;
	ivec2 hi = ivec2(uHalfSize) - 1;
	ivec2 i0 = clamp(ivec2(base), ivec2(0), hi);
	ivec2 i1 = clamp(ivec2(base) + 1, ivec2(0), hi);
	vec4 t0 = texelFetch(uHalf, ivec2(i0.x, i0.y), 0);
	vec4 t1 = texelFetch(uHalf, ivec2(i1.x, i0.y), 0);
	vec4 t2 = texelFetch(uHalf, ivec2(i0.x, i1.y), 0);
	vec4 t3 = texelFetch(uHalf, ivec2(i1.x, i1.y), 0);
	vec4 b = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
	float ref = (f.y >= 0.5) ? ((f.x >= 0.5) ? t3.a : t2.a) : ((f.x >= 0.5) ? t1.a : t0.a);
	vec4 d = (vec4(t0.a, t1.a, t2.a, t3.a) - ref) * uOctaves / TOLERANCE;
	vec4 w = b * exp(-d * d);
	w /= w.x + w.y + w.z + w.w;
	gl_FragColor = vec4(t0.rgb * w.x + t1.rgb * w.y + t2.rgb * w.z + t3.rgb * w.w, 1.0);
	gl_FragDepth = dot(vec4(t0.a, t1.a, t2.a, t3.a), w);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;
