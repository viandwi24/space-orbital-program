/**
 * The planet pass (ADR 0027): one screen-covering triangle; the fragment shader intersects the
 * view ray with the exact planet sphere and the atmosphere, shades ground / ocean / clouds / stars
 * / sun, and writes a logarithmic depth value so meshes and lines sort against it.
 */
import { APRONS, PAD_RADIUS, ROADS, SCORCH_RADIUS } from '../site.ts';
import { BEACH_WIDTH, HIGHLAND, SEA_LEVEL } from '../planet-map.ts';
import { atmosphereGLSL } from './atmosphere.glsl.ts';

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

const siteConstants = (): string => /* glsl */ `
const float PAD_R = ${f(PAD_RADIUS)};
const float SCORCH_R = ${f(SCORCH_RADIUS)};
const int ROAD_N = ${ROADS.length};
const vec4 ROAD_SEG[${ROADS.length}] = vec4[](${ROADS.map((r) => `vec4(${f(r.ax)}, ${f(r.az)}, ${f(r.bx)}, ${f(r.bz)})`).join(', ')});
const float ROAD_W[${ROADS.length}] = float[](${ROADS.map((r) => f(r.width)).join(', ')});
const int APRON_N = ${APRONS.length};
const vec4 APRON_BOX[${APRONS.length}] = vec4[](${APRONS.map((a) => `vec4(${f(a.x)}, ${f(a.z)}, ${f(a.hx)}, ${f(a.hz)})`).join(', ')});
`;

export const planetVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
	vNdc = position.xy;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const planetFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${atmosphereGLSL}
${siteConstants()}

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
uniform float uStarBright;
uniform float uShadowOn;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowBias;
uniform float uShadowTexel;
uniform float uSiteRadius;

const float SEA = ${f(SEA_LEVEL)};
const float BEACH = ${f(BEACH_WIDTH)};
const float HIGH = ${f(HIGHLAND)};
const float SUN_ANGULAR_RADIUS = 0.0055;
const float SUN_DISC_RADIANCE = 70.0;
const vec3 NIGHT_AMBIENT = vec3(0.0035, 0.0048, 0.0095);

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Value noise whose lattice cell is (floor(pl / lam) + anchorCell * 1024 / lam): exact for lam = 1024 / 2^k.
float noiseA(vec3 pl, float lam, int salt) {
	vec3 f = pl / lam;
	vec3 fl = floor(f);
	ivec3 c = ivec3(fl) + ivec3(uAnchorCell) * int(1024.0 / lam + 0.5) + ivec3(salt * 131, salt * 71, salt * 17);
	return valueNoiseCell(c, f - fl);
}

float fbmF(vec3 p, int octaves) {
	float sum = 0.0;
	float amp = 1.0;
	float norm = 0.0;
	for (int i = 0; i < 6; i++) {
		if (i >= octaves) break;
		sum += amp * noiseF(p + float(i) * 7.31);
		norm += amp;
		amp *= 0.5;
		p *= 2.03;
	}
	return sum / norm;
}

// --- clouds -----------------------------------------------------------------------------------
vec3 rotY(vec3 v, float a) {
	float c = cos(a), s = sin(a);
	return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
float cloudDensity(vec3 dirBF) {
	vec3 p = rotY(dirBF, uCloudAngle) * (uR / 16000.0);
	p += 0.7 * (vec3(noiseF(p * 0.45 + 3.7), noiseF(p * 0.45 + 9.1), noiseF(p * 0.45 + 1.3)) - 0.5);
	float n = fbmF(p, CLOUD_OCTAVES);
	float t0 = mix(0.66, 0.40, uCloudCover);
	float body = smoothstep(t0, t0 + 0.24, n);
	float detail = fbmF(p * 5.3 + 21.0, 3);
	return clamp(body * (0.62 + 0.75 * detail) - 0.08 * (1.0 - body), 0.0, 1.0);
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

Surface surfaceAt(vec3 nBF, vec3 pl, float footprint, vec3 viewBF) {
	Surface s;
	float lat = asin(clamp(nBF.y, -1.0, 1.0));
	float lon = atan(-nBF.z, nBF.x);
	vec2 uv = vec2(lon / (2.0 * kPI) + 0.5, lat / kPI + 0.5);
	float lod = max(log2(footprint / uMapTexel), 0.0);
	vec4 m = textureLod(uMap, uv, lod);
	float e = m.r;
	float moist = m.g;
	float temp = m.b;
	float rockMap = m.a;

	// Fractal detail: height in metres for relief and shifts of the elevation field for coastlines.
	float hM = 0.0;
	float eDetail = 0.0;
	float colourNoise = 0.0;
	float fine = 0.0;
	float lamMin = footprint * 1.6;
	for (int i = 0; i < GROUND_OCTAVES; i++) {
		float lam = 1024.0 / exp2(float(i));
		if (lam < lamMin) break;
		float fade = clamp((lam / lamMin - 1.0) * 1.5, 0.0, 1.0);
		float n = noiseA(pl, lam, i) - 0.5;
		eDetail += n * 0.16 * pow(0.58, float(i)) * fade;
		hM += n * lam * 0.22 * fade;
		if (lam < 64.0) fine += n * fade * (lam < 8.0 ? 1.0 : 0.6);
		if (lam > 6.0 && lam < 200.0) colourNoise += n * fade * 0.7;
	}
	float e2 = e + eDetail;
	// coast roughness is meaningful only near the shore: wide features follow the map
	float landW = smoothstep(SEA - 0.004, SEA + 0.004, e2);
	float depth = clamp((SEA - e2) / 0.18, 0.0, 1.0);

	// slope-based rock needs the bumped normal: build it from the height field's derivatives
	vec3 N = nBF;
	float rugged = mix(0.02, 0.5, smoothstep(0.55, 0.9, e2 + rockMap * 0.25));
	vec3 dpdx = dFdx(pl);
	vec3 dpdy = dFdy(pl);
	float dhx = dFdx(hM * rugged);
	float dhy = dFdy(hM * rugged);
	vec3 r1 = cross(dpdy, N);
	vec3 r2 = cross(N, dpdx);
	float det = dot(dpdx, r1);
	vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
	vec3 gb = abs(det) * N - grad;
	vec3 Nb = dot(gb, gb) > 1e-24 ? normalize(gb) : N;
	float slope = 1.0 - dot(Nb, nBF);

	vec3 grass = mix(vec3(0.085, 0.16, 0.04), vec3(0.13, 0.215, 0.055), clamp(0.5 + colourNoise * 0.45, 0.0, 1.0));
	grass *= 0.8 + 0.45 * clamp(0.5 + fine, 0.0, 1.0);
	vec3 forest = vec3(0.035, 0.085, 0.03) * (0.8 + 0.5 * clamp(0.5 + colourNoise, 0.0, 1.0));
	vec3 desert = mix(vec3(0.42, 0.29, 0.15), vec3(0.58, 0.43, 0.25), clamp(0.5 + colourNoise, 0.0, 1.0));
	vec3 rockc = mix(vec3(0.17, 0.15, 0.135), vec3(0.34, 0.31, 0.27), clamp(0.5 + colourNoise * 1.3 + fine * 0.3, 0.0, 1.0));
	vec3 snow = vec3(0.78, 0.8, 0.84);
	vec3 sand = vec3(0.44, 0.38, 0.26) * (0.92 + 0.16 * clamp(0.5 + fine, 0.0, 1.0));

	float wForest = smoothstep(0.55, 0.72, moist);
	float wDesert = (1.0 - smoothstep(0.26, 0.4, moist)) * smoothstep(0.35, 0.5, temp);
	vec3 veg = mix(grass, forest, wForest);
	veg = mix(veg, desert, wDesert);
	float wRock = max(smoothstep(HIGH - 0.06, HIGH + 0.05, e2), smoothstep(0.7, 0.9, rockMap + colourNoise * 0.3));
	wRock = max(wRock, smoothstep(0.06, 0.22, slope * 3.0));
	float wSnow = max(smoothstep(0.22, 0.12, temp), smoothstep(0.9, 0.97, e2));
	float wBeach = (1.0 - smoothstep(SEA + BEACH * 0.5, SEA + BEACH * 1.6, e2)) * (1.0 - wRock) * (1.0 - smoothstep(300.0, 3000.0, footprint));

	vec3 land = mix(veg, rockc, wRock);
	land = mix(land, sand, wBeach);
	land = mix(land, snow, wSnow * smoothstep(0.0, 1.0, 1.0 - slope * 2.0));
	float spec = 0.0;

	// Launch site: paved areas painted onto the ground (flush, so nothing intersects the vessel).
	vec3 v = uCamToSite + viewBF;
	float padMask = 0.0;
	if (dot(v, v) < uSiteRadius * uSiteRadius) {
		vec2 q = vec2(dot(v, uSiteEast), -dot(v, uSiteNorth));
		float dirt;
		vec3 paved = land;
		float pave = sitePaving(q, paved, dirt, max(footprint, 0.05));
		vec3 dirtc = vec3(0.22, 0.165, 0.1) * (0.8 + 0.4 * noiseF(vec3(q * 0.7, 9.0)));
		land = mix(land, dirtc, dirt);
		land = mix(land, paved, pave);
		// a trimmed lawn around the site
		float lawn = 1.0 - smoothstep(60.0, 180.0, length(q));
		land = mix(land, land * vec3(1.05, 1.1, 0.95), lawn * (1.0 - pave) * 0.5);
		padMask = max(pave, dirt * 0.5);
		Nb = normalize(mix(Nb, nBF, padMask));
	}

	// Ocean
	vec3 shallow = vec3(0.02, 0.2, 0.2);
	vec3 deep = vec3(0.004, 0.035, 0.1);
	vec3 water = mix(shallow, deep, smoothstep(0.0, 0.7, depth));
	vec3 col = mix(water, land, landW);
	vec3 Nw = Nb;
	if (landW < 1.0 && footprint < 400.0) {
		vec3 wp = pl + vec3(0.0);
		float f1 = clamp(8.0 / (footprint * 1.6) - 1.0, 0.0, 1.0);
		float f2 = clamp(2.0 / (footprint * 1.6) - 1.0, 0.0, 1.0);
		float f3 = clamp(0.5 / (footprint * 1.6) - 1.0, 0.0, 1.0);
		float w = f1 * noiseA(wp, 8.0, 21) + 0.5 * f2 * noiseA(wp, 2.0, 22) + 0.25 * f3 * noiseA(wp, 0.5, 23);
		float wdx = dFdx(w), wdy = dFdy(w);
		vec3 rw1 = cross(dpdy, nBF), rw2 = cross(nBF, dpdx);
		float dw = dot(dpdx, rw1);
		vec3 gw = abs(dw) * nBF - sign(dw) * (wdx * rw1 + wdy * rw2) * 1.8;
		Nw = dot(gw, gw) > 1e-24 ? normalize(gw) : nBF;
	}
	s.normal = normalize(mix(Nw, Nb, landW));
	s.albedo = col;
	s.spec = 1.0 - landW;
	s.waterDepth = depth;
	return s;
}

void main() {
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

	// atmosphere interval
	float jitter = ign(gl_FragCoord.xy);
	vec2 at = raySphere(r0, d, R + uAtmH);
	float t0 = max(at.x, 0.0);
	float t1 = at.y;
	if (hitP) t1 = min(t1, tHit);
	bool inAtm = at.y > 0.0 && t1 > t0;

	vec3 base = vec3(0.0);
	float depthDist = -1.0; // distance along the ray written to the depth buffer
	if (hitP) {
		vec3 rdBF = uBodyInv * rd;
		vec3 pl = uCamLocal + rdBF * tHit;
		vec3 posRel = ro + rd * tHit;
		vec3 nI = normalize(posRel);
		vec3 nBF = uBodyInv * nI;
		float cosv = max(abs(dot(nI, rd)), 0.03);
		float footprint = max(tHit * uPixelAngle / cosv, 0.002);
		Surface sf = surfaceAt(nBF, pl, footprint, rdBF * tHit);

		vec3 Lb = uSunBF;
		float ndl = max(dot(sf.normal, Lb), 0.0);
		float geo = dot(nBF, Lb);
		vec3 sunT = sunTransmittance(posRel, uSunDir);
		vec3 posRender = uCamPos + rd * tHit;
		float sh = shadowFactor(posRender);
#if CLOUD_SHADOWS
		if (geo > 0.04) {
			float sc = raySphere(R, geo, uCloudAlt).y;
			vec3 q = nBF * R + Lb * sc;
			sh *= 1.0 - 0.45 * cloudDensity(normalize(q));
		}
#endif
		float k = max(0.0, 0.02 + smoothstep(-0.2, 0.4, geo)) / max(0.02 + smoothstep(-0.2, 0.4, uAmbientRefMu), 0.02);
		vec3 amb = uAmbient * k + NIGHT_AMBIENT * kPI;
		vec3 lit = sf.albedo / kPI * (uSunIrr * sunT * ndl * sh + amb);
		if (sf.spec > 0.0) {
			vec3 V = -rdBF;
			vec3 Hh = normalize(Lb + V);
			float nh = max(dot(sf.normal, Hh), 0.0);
			float fres = 0.02 + 0.98 * pow(1.0 - max(dot(sf.normal, V), 0.0), 5.0);
			float glint = pow(nh, 900.0) * 900.0 / (8.0 * kPI) * ndl * sh;
			vec3 refl = uSkyColour * fres * 1.2;
			lit = mix(lit, refl, fres * 0.9) + uSunIrr * sunT * glint * fres * 0.5 * sf.spec;
		}
		base = lit;
		depthDist = tHit;
	} else {
		float px = uPixelAngle;
		base = stars(rd, px);
		float ang = dot(rd, uSunDir) > 0.0 ? length(cross(rd, uSunDir)) : 2.0;
		float disc2 = 1.0 - smoothstep(SUN_ANGULAR_RADIUS * 0.8, SUN_ANGULAR_RADIUS * 1.08, ang);
		float x = clamp(ang / SUN_ANGULAR_RADIUS, 0.0, 1.0);
		float limb = 1.0 - 0.55 * (1.0 - sqrt(1.0 - x * x));
		base += vec3(1.0, 0.96, 0.9) * SUN_DISC_RADIANCE * disc2 * limb;
	}

	// atmosphere
	vec3 colour = base;
	float tc = -1.0;
#if CLOUDS
	vec2 cs = raySphere(r0, d, uCloudAlt);
	float cloudT = r0 < uCloudAlt ? cs.y : cs.x;
	bool cloudHit = cs.y > 0.0 && cloudT > 0.0 && (!hitP || cloudT < tHit);
	if (cloudHit) tc = cloudT;
#endif
	if (inAtm) {
		float power = h < uAtmH ? 2.0 : 1.0;
		Scatter sc = marchAtmosphere(ro, rd, t0, t1, uSunDir, jitter, tc, power);
		colour = base * sc.transmittance + sc.inscatter;
#if CLOUDS
		if (cloudHit) {
			vec3 pc = ro + rd * cloudT;
			vec3 dirI = normalize(pc);
			vec3 dirBF = uBodyInv * dirI;
			float dens = cloudDensity(dirBF);
			float cosc = max(abs(dot(dirI, rd)), 0.12);
			float alpha = clamp(dens * (0.75 + 0.5 / cosc * 0.25), 0.0, 1.0) * clamp(uCloudCover * 2.0, 0.0, 1.0);
			if (alpha > 0.002) {
				float muc = dot(dirI, uSunDir);
				vec3 sunTc = sunTransmittance(pc, uSunDir);
				vec3 tang = normalize(uSunDir - dirI * muc + 1e-5);
				float d2 = cloudDensity(normalize(dirBF + (uBodyInv * tang) * 0.018));
				float shade = clamp(1.0 - (d2 - dens) * 1.6, 0.3, 1.0);
				float hg = miePhase(dot(rd, uSunDir), 0.55) * 4.0 * kPI;
				float phase = 0.55 + 0.45 * clamp(hg, 0.0, 4.0);
				vec3 cl = vec3(0.92) / kPI * (uSunIrr * sunTc * max(muc, 0.0) * shade * phase * 1.25 + uAmbient * (0.55 + 0.45 * shade)) + NIGHT_AMBIENT * 0.6;
				colour = sc.insCloud + alpha * sc.transCloud * cl + (1.0 - alpha) * (sc.inscatter - sc.insCloud + sc.transmittance * base);
			}
		}
#endif
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
	gl_FragColor = vec4(hitP ? 1.0 : 0.0, inAtm ? 1.0 : 0.0, fract(tHit / 100.0), 1.0);
	#elif DEBUG_VIEW == 3
	gl_FragColor = vec4(base, 1.0);
	#elif DEBUG_VIEW == 5
	Scatter dbg = marchAtmosphere(ro, rd, t0, t1, uSunDir, jitter, -1.0, 2.0);
	gl_FragColor = vec4(dbg.inscatter, 1.0);
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
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;
