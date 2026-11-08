/**
 * Procedural surface wear and wind for the launch-site materials (plan 025). Both are patches of
 * three's `MeshStandardMaterial` through `onBeforeCompile`, so lighting, shadows, fog and the
 * logarithmic depth buffer stay three's own:
 *
 * - `weatherMaterial`: rain streaks, dirt near the ground, mottling, grain, optional rust, and a
 *   roughness variation, all from the object-space position (site metres).
 * - `windMaterial`: bends instanced foliage and grass with height, phase from the instance origin.
 */
import type { MeshStandardMaterial } from 'three';

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];

/** Seconds, shared by every wind material (updated by `LaunchSite.place`). */
export const siteTime = { value: 0 };

const NOISE = /* glsl */ `
float wxHash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wxNoise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(wxHash(i), wxHash(i + vec3(1, 0, 0)), f.x), mix(wxHash(i + vec3(0, 1, 0)), wxHash(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(wxHash(i + vec3(0, 0, 1)), wxHash(i + vec3(1, 0, 1)), f.x), mix(wxHash(i + vec3(0, 1, 1)), wxHash(i + vec3(1, 1, 1)), f.x), f.y),
		f.z);
}
`;

/**
 * The fine octaves of the wear (grain, the 0.9 m mottle, the 0.3 m streak modulation) fade out with the
 * view-space distance: fully in up to `near` m, gone from `far` m, where a texel of them is under a pixel
 * and their noise only costs (plan 418: 1.8 ms on one wall mesh at the pad). Beyond `far` the shaders do
 * not evaluate them. Shared by the GLSL patch and the TSL twin (`tsl/twins.ts`).
 */
export const WEATHER_FADE = { near: 30, far: 60 } as const;

/** What a faded octave settles at: the mean of the value noise, and of the streak modulation 0.35 + 0.65 n. */
export const WEATHER_MEAN = { noise: 0.5, streakMod: 0.675 } as const;

/** 1 up to `WEATHER_FADE.near` m of view depth, 0 from `far` m, a smoothstep between (the shaders' `fine`). */
export function weatherFine(depth: number): number {
	const t = Math.min(
		1,
		Math.max(0, (depth - WEATHER_FADE.near) / (WEATHER_FADE.far - WEATHER_FADE.near))
	);
	return 1 - t * t * (3 - 2 * t);
}

export interface WeatherOptions {
	/** Rust-brown stains (steel structure) in addition to grime. */
	rust?: boolean;
	/** 0..1: how strongly the surface is stained. */
	amount?: number;
}

export function weatherMaterial(
	material: MeshStandardMaterial,
	options: WeatherOptions = {}
): void {
	const amount = options.amount ?? 1;
	const key = `weather-${options.rust ? 'r' : 'p'}-${amount}`;
	// the WebGPU renderer's twin rebuilds the patch from these (plan 261, tsl/twins.ts)
	material.userData.weather = { rust: options.rust === true, amount };
	material.customProgramCacheKey = () => key;
	material.onBeforeCompile = (shader: Shader) => {
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vSitePos;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSitePos = position;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\nvarying vec3 vSitePos;\n${NOISE}`)
			.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
{
	vec3 sp = vSitePos;
	// the fine octaves fade out with the view depth and are not evaluated beyond it (plan 418)
	float fine = 1.0 - smoothstep(${WEATHER_FADE.near.toFixed(1)}, ${WEATHER_FADE.far.toFixed(1)}, vViewPosition.z);
	float oct2 = 0.5;
	float grain = 0.5;
	if (fine > 0.0) {
		oct2 = mix(0.5, wxNoise(sp * 0.9), fine);
		grain = mix(0.5, wxNoise(sp * 7.0), fine);
	}
	float mottle = wxNoise(sp * 0.18) * 0.6 + oct2 * 0.4;
	// rain runs down from edges: stretched in y, thin in x and z
	float streak = wxNoise(vec3(sp.x * 2.6 + sp.z * 2.2, sp.y * 0.16, sp.z * 0.7 - sp.x * 0.5));
	float streakMask = 0.0;
	if (streak > 0.58) {
		float streakMod = ${WEATHER_MEAN.streakMod};
		if (fine > 0.0) streakMod = mix(${WEATHER_MEAN.streakMod}, 0.35 + 0.65 * wxNoise(sp * 0.3 + 11.0), fine);
		streakMask = smoothstep(0.58, 0.88, streak) * streakMod;
	}
	float low = 1.0 - smoothstep(0.0, 3.5, sp.y);
	float k = ${amount.toFixed(3)};
	vec3 base = diffuseColor.rgb;
	base *= 0.88 + 0.22 * mottle;
	base *= 0.95 + 0.1 * grain;
	base = mix(base, base * vec3(0.55, 0.52, 0.48), streakMask * 0.55 * k);
	base = mix(base, base * vec3(0.5, 0.45, 0.38), low * (0.4 + 0.4 * wxNoise(sp * 1.7)) * k);
#ifdef WEATHER_RUST
	float rust = smoothstep(0.66, 0.86, wxNoise(sp * 0.95 + 3.0)) * (0.4 + 0.6 * streak);
	base = mix(base, vec3(0.2, 0.085, 0.04) * (0.8 + 0.4 * grain), rust * 0.6 * k);
#endif
	diffuseColor.rgb = base;
}`
			)
			.replace(
				'#include <roughnessmap_fragment>',
				`#include <roughnessmap_fragment>\nfloat rFine = 1.0 - smoothstep(${WEATHER_FADE.near.toFixed(1)}, ${WEATHER_FADE.far.toFixed(1)}, vViewPosition.z);\nfloat rVary = 0.0;\nif (rFine > 0.0) rVary = 0.2 * (wxNoise(vSitePos * 2.3) - 0.5) * rFine;\nroughnessFactor = clamp(roughnessFactor + rVary + 0.12 * (1.0 - smoothstep(0.0, 2.0, vSitePos.y)), 0.05, 1.0);`
			);
		if (options.rust) shader.fragmentShader = `#define WEATHER_RUST\n${shader.fragmentShader}`;
	};
	material.needsUpdate = true;
}

export interface WindOptions {
	/** Full height of the mesh (local units) the bend is normalised to. */
	height: number;
	/** Peak sideways displacement of the top, as a fraction of `height`. */
	strength: number;
	/** Leaf mottling on the albedo (trees and shrubs): bright and dark speckle at leaf scale. */
	leaves?: boolean;
	/** Instances shrink to nothing between these distances from the camera, m (grass level of detail). */
	fade?: [number, number];
}

export function windMaterial(material: MeshStandardMaterial, options: WindOptions): void {
	const key = `wind-${options.height}-${options.strength}-${options.fade?.join('-') ?? 'x'}-${options.leaves ? 'l' : 'p'}`;
	material.userData.wind = { ...options };
	const fadeCode = options.fade
		? `	transformed *= 1.0 - smoothstep(${options.fade[0].toFixed(1)}, ${options.fade[1].toFixed(1)}, distance((modelMatrix * vec4(iOrigin, 1.0)).xyz, cameraPosition));\n`
		: '';
	material.customProgramCacheKey = () => key;
	material.onBeforeCompile = (shader: Shader) => {
		shader.uniforms.uSiteTime = siteTime;
		if (options.leaves) {
			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vLeafPos;')
				.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeafPos = position;');
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', `#include <common>\nvarying vec3 vLeafPos;\n${NOISE}`)
				.replace(
					'#include <color_fragment>',
					/* glsl */ `#include <color_fragment>
{
	float lf = wxNoise(vLeafPos * 5.5) * 0.55 + wxNoise(vLeafPos * 13.0) * 0.45;
	float sp = smoothstep(0.62, 0.8, wxNoise(vLeafPos * 21.0));
	diffuseColor.rgb *= (0.62 + 0.8 * lf) * (1.0 + 0.35 * sp);
}`
				);
		}
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nuniform float uSiteTime;')
			.replace(
				'#include <begin_vertex>',
				/* glsl */ `#include <begin_vertex>
{
#ifdef USE_INSTANCING
	vec3 iOrigin = vec3(instanceMatrix[3]);
#else
	vec3 iOrigin = vec3(0.0);
#endif
	float hh = clamp(position.y / ${options.height.toFixed(3)}, 0.0, 1.0);
	float phase = iOrigin.x * 0.23 + iOrigin.z * 0.19;
	float gust = sin(uSiteTime * 1.1 + phase) * 0.6 + sin(uSiteTime * 2.7 + phase * 1.7) * 0.25 + 0.35;
	float bend = hh * hh * ${(options.height * options.strength).toFixed(4)} * gust;
	transformed.x += bend;
	transformed.z += bend * 0.45 * sin(uSiteTime * 0.7 + phase);
${fadeCode}}`
			);
	};
	material.needsUpdate = true;
}
