import { hashNoiseGLSL } from './atmosphere.glsl.ts';
import { terrainNoiseGLSL } from './terrain.glsl.ts';

/**
 * The cumulus coverage field of ADR 0037 as GLSL, shared by the planet pass (per pixel, rotated by the
 * clouds' drift) and the cloud-map bake that the light shafts read (plan 054, ADR 0070). Needs the hash
 * noise (`hashNoiseGLSL`), `OCT_ROT` (`terrainNoiseGLSL`) and `uniform float uCloudCover`.
 */
export const cloudFieldGLSL = /* glsl */ `
float fbmF(vec3 p, int octaves) {
	float sum = 0.0;
	float amp = 1.0;
	float norm = 0.0;
	for (int i = 0; i < 6; i++) {
		if (i >= octaves) break;
		sum += amp * noiseF(p + float(i) * 7.31);
		norm += amp;
		amp *= 0.5;
		p = OCT_ROT * p * 2.03;
	}
	return sum / norm;
}

// Cumulus: billowy puffs with defined edges, at the point p = (drifted body-fixed direction) * (radius / 16000 m).
// full adds the fine detail; ground shadows and the light shafts use the cheap form.
float cloudDensityQ(vec3 p, bool full, float fp, int octaves) {
	p += 0.7 * (noiseF3(p * 0.45 + 3.7) - 0.5);
	float n = fbmF(p, octaves);
	// detail fades with the footprint of a pixel on the shell (grazing views would alias) and is skipped when faded out
	float puff = 0.5;
	float puffW = 1.0 - smoothstep(500.0, 1500.0, fp);
	if (puffW > 0.001) puff = mix(0.5, smoothstep(0.3, 0.7, fbmF(p * 11.0 + 21.0, 2)), puffW);
	float t0 = mix(0.66, 0.40, uCloudCover);
	float body = smoothstep(t0, t0 + mix(0.2, 0.28, smoothstep(300.0, 3000.0, fp)), n + (puff - 0.5) * 0.3);
	float dens = body * (0.55 + 0.75 * puff);
	float billowW = 1.0 - smoothstep(120.0, 450.0, fp);
	if (full && billowW > 0.001) {
		float billow = mix(0.5, smoothstep(0.28, 0.72, fbmF(p * 48.0 + 5.0, 2)), billowW);
		dens *= 0.65 + 0.65 * billow;
	}
	return clamp(dens - 0.06 * (1.0 - body), 0.0, 1.0);
}
`;

/**
 * The bake: one fullscreen pass writes, equirectangular (`cloudMapUV` in light-shaft.ts is the lookup), the coverage the light
 * shafts read (red) and the cloud density the ground's cloud shadows read on the presets that do not evaluate the noise (green, plan 056).
 */
export const cloudMapFragment = /* glsl */ `
varying vec2 vUv;
uniform float uR;
uniform float uCloudCover;
${hashNoiseGLSL}
${terrainNoiseGLSL}
${cloudFieldGLSL}
void main() {
	float lon = (vUv.x - 0.5) * 6.28318530718;
	float lat = (vUv.y - 0.5) * 3.14159265359;
	vec3 dir = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
	float d = cloudDensityQ(dir * (uR / 16000.0), false, 2000.0, CLOUD_MAP_OCTAVES);
	gl_FragColor = vec4(smoothstep(0.08, 0.55, d), d, 0.0, 1.0);
}
`;
