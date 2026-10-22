import {
	GALACTIC_CENTRE,
	GALACTIC_POLE,
	MILKY_WAY_RADIANCE,
	SKY_FLOOR_RADIANCE,
	STAR_CELL_MARGIN,
	STAR_FLUX0,
	STAR_LAYERS,
	STAR_SIGMA_BRIGHT_MAG,
	STAR_SIGMA_EXTRA_PX,
	STAR_SIGMA_FROM_MAG,
	STAR_SIGMA_MIN_PX,
	STAR_TINTS,
	STAR_TINT_STOPS
} from '../sky-model.ts';
import { hashNoiseGLSL } from './atmosphere.glsl.ts';

/**
 * The night sky in GLSL (plan 364, ADR 0306), the twin of `tsl/starfield.ts`:
 * - `skyMapGLSL`: the octahedral lookup of the baked Milky Way (`uSkyMap`, `uSkyTexel`) and the
 *   catalogue stars, energy-normalised Gaussians that never twinkle (`sky-model.ts`);
 * - `skyBakeFragment`: the bake of the Milky Way, dust lanes, nebulae and haze into the map.
 * Needs the hash noise (`hashNoiseGLSL`) before it.
 */
const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
const v3 = (v: readonly number[]): string => `vec3(${v.map(f).join(', ')})`;

const galE = (() => {
	const [a, b] = [GALACTIC_POLE, GALACTIC_CENTRE];
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
})();

/** The star's colour by a uniform t (`STAR_TINTS`, `STAR_TINT_STOPS`). */
const tintGLSL = (() => {
	let s = `vec3 starTint(float t) {\n\tvec3 c = ${v3(STAR_TINTS[0]!)};\n`;
	for (let i = 1; i < STAR_TINTS.length; i++) {
		const a = STAR_TINT_STOPS[i]!;
		s += `\tc = mix(c, ${v3(STAR_TINTS[i]!)}, smoothstep(${f(a - 0.04)}, ${f(a + 0.04)}, t));\n`;
	}
	return `${s}\treturn c;\n}`;
})();

const layerGLSL = STAR_LAYERS.map((L, i) => {
	const cellAngle = Math.PI / 2 / L.cells;
	const margin = STAR_CELL_MARGIN * cellAngle;
	const span = Math.pow(10, -0.5 * (L.magFaint - L.magBright));
	return `
	{
		vec2 g = (st * 0.5 + 0.5) * ${f(L.cells)};
		ivec2 cell = ivec2(min(floor(g), vec2(${f(L.cells - 1)})));
		vec3 h = hash33i(ivec3(cell, face * 64 + ${L.salt}));
		if (h.z < ${f(L.chance)}) {
			vec2 sp = (vec2(cell) + ${f(STAR_CELL_MARGIN)} + ${f(1 - 2 * STAR_CELL_MARGIN)} * h.xy) * ${f(2 / L.cells)} - 1.0;
			float d = length(rd - skyFaceDirection(face, sp));
			vec3 k = hash33i(ivec3(cell, face * 64 + ${L.salt + 1}));
			float mag = ${f(L.magFaint)} + 2.0 * log2(${f(span)} + ${f(1 - span)} * k.x) * 0.30103;
			float sig = px * starSigmaPx(mag);
			float flux = ${f(STAR_FLUX0)} * exp2(-1.3287712 * mag);
			float w = flux * exp(-d * d / (2.0 * sig * sig)) / (6.2831853 * sig * sig);
			col += starTint(k.y) * w * smoothstep(${f(margin)}, ${f(margin * 0.6)}, d);
		}
	}`;
}).join('');

export const skyMapGLSL = /* glsl */ `
// --- the sky (plan 364) -------------------------------------------------------------------------
uniform sampler2D uSkyMap;
uniform float uSkyTexel; // mean angle of a texel of the map, rad

vec2 octEncode(vec3 d) {
	d /= abs(d.x) + abs(d.y) + abs(d.z);
	vec2 e = d.xy;
	if (d.z < 0.0) e = (1.0 - abs(d.yx)) * vec2(e.x >= 0.0 ? 1.0 : -1.0, e.y >= 0.0 ? 1.0 : -1.0);
	return e * 0.5 + 0.5;
}

// the equi-angular cube face of a direction: face 0..5 = +x, -x, +y, -y, +z, -z, and its coordinates in [-1, 1]
int skyFace(vec3 d, out vec2 st) {
	vec3 a = abs(d);
	int face;
	vec2 ab;
	if (a.x >= a.y && a.x >= a.z) { face = d.x > 0.0 ? 0 : 1; ab = d.yz / a.x; }
	else if (a.y >= a.z) { face = d.y > 0.0 ? 2 : 3; ab = vec2(d.z, d.x) / a.y; }
	else { face = d.z > 0.0 ? 4 : 5; ab = d.xy / a.z; }
	st = atan(ab) * 1.27323954;
	return face;
}
vec3 skyFaceDirection(int face, vec2 st) {
	vec2 ab = tan(st * 0.78539816);
	float s = (face == 0 || face == 2 || face == 4) ? 1.0 : -1.0;
	vec3 v = face < 2 ? vec3(s, ab.x, ab.y) : face < 4 ? vec3(ab.y, s, ab.x) : vec3(ab.x, ab.y, s);
	return normalize(v);
}
float starSigmaPx(float mag) {
	return ${f(STAR_SIGMA_MIN_PX)} + ${f(STAR_SIGMA_EXTRA_PX)} * clamp((${f(STAR_SIGMA_FROM_MAG)} - mag) / ${f(STAR_SIGMA_FROM_MAG - STAR_SIGMA_BRIGHT_MAG)}, 0.0, 1.0);
}
${tintGLSL}
// the catalogue: per layer, the pixel's own cell holds at most one star well inside it
vec3 catalogueStars(vec3 rd, float px) {
	vec2 st;
	int face = skyFace(rd, st);
	vec3 col = vec3(0.0);${layerGLSL}
	return col;
}
// the Milky Way and nebulae from the bake, at the level of the pixel's angle, plus the catalogue stars
vec3 skyRadiance(vec3 rd, float px) {
	float lod = max(log2(px / uSkyTexel), 0.0);
	return textureLod(uSkyMap, octEncode(rd), lod).rgb + catalogueStars(rd, px);
}
`;

export const skyBakeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** The Milky Way as `skyMilkyWay` (shared text: the TSL twin follows it line by line). */
export const skyBakeFragment = /* glsl */ `
varying vec2 vUv;
${hashNoiseGLSL}
vec3 octDecode(vec2 uv) {
	vec2 f = uv * 2.0 - 1.0;
	vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
	float t = max(-n.z, 0.0);
	n.x += n.x >= 0.0 ? -t : t;
	n.y += n.y >= 0.0 ? -t : t;
	return normalize(n);
}
float skyFbm(vec3 p, int octaves) {
	float s = 0.0;
	float a = 0.5;
	float n = 0.0;
	for (int i = 0; i < 8; i++) {
		if (i >= octaves) break;
		s += a * noiseF(p);
		n += a;
		a *= 0.5;
		p = p * 2.07 + vec3(17.3, 5.1, 11.7);
	}
	return s / n;
}
vec3 skyMilkyWay(vec3 d) {
	const vec3 G = ${v3(GALACTIC_POLE)};
	const vec3 C = ${v3(GALACTIC_CENTRE)};
	const vec3 E = ${v3(galE)};
	float b = asin(clamp(dot(d, G), -1.0, 1.0));
	float l = atan(dot(d, E), dot(d, C));
	// the band wanders a little off its great circle
	float bb = b + (skyFbm(d * 2.2 + 3.0, 3) - 0.5) * 0.12;
	float width = 0.075 + 0.07 * (0.5 + 0.5 * cos(l));
	float disk = exp(-bb * bb / (width * width));
	float halo = exp(-bb * bb / 0.1225);
	float bulge = exp(-(l * l) / 0.1764 - (bb * bb) / 0.0256);
	float clouds = skyFbm(d * 7.0 + 1.3, 6);
	clouds = clouds * clouds * 2.2;
	float fine = skyFbm(d * 38.0 + 7.0, 4);
	// dark dust lanes hugging the plane, and patches of dust beside it
	float r = 1.0 - abs(2.0 * skyFbm(d * 11.0 + 5.0, 5) - 1.0);
	float off = (bb - 0.012 * sin(2.0 * l)) / (0.45 * width);
	float lane = smoothstep(0.55, 0.95, r) * exp(-off * off);
	float patches = smoothstep(0.5, 0.8, skyFbm(d * 4.0 + 9.0, 4)) * exp(-bb * bb / (1.6 * width * width));
	float dust = clamp(lane * 0.85 + patches * 0.5, 0.0, 0.92);
	float light = (disk * (0.25 + clouds) * (0.75 + 0.5 * fine) + bulge * (0.6 + 0.6 * clouds) + halo * 0.09) * (1.0 - dust);
	vec3 col = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.84, 0.66), clamp(bulge * 1.4 + 0.15, 0.0, 1.0)) * light;
	// nebulae: hydrogen pink near the plane, a fainter oxygen teal wider out
	float n1 = smoothstep(0.62, 0.86, skyFbm(d * 3.3 + 21.0, 5)) * exp(-bb * bb / 0.09);
	float n2 = smoothstep(0.66, 0.9, skyFbm(d * 2.6 + 43.0, 5)) * exp(-bb * bb / 0.25);
	col += vec3(1.0, 0.32, 0.45) * n1 * 0.22 + vec3(0.25, 0.62, 0.78) * n2 * 0.12;
	// the haze of unresolved stars, grainy along the band
	float grain = pow(noiseF(d * 90.0), 6.0) * (disk + bulge * 0.5);
	col += vec3(0.9, 0.92, 1.0) * grain * 0.9;
	return col * ${f(MILKY_WAY_RADIANCE)} + vec3(${f(SKY_FLOOR_RADIANCE)});
}
void main() {
	gl_FragColor = vec4(skyMilkyWay(octDecode(vUv)), 1.0);
}
`;
