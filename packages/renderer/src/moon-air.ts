/**
 * Air on a later body (plan 071, ADR 0121 point 2): the analytic atmosphere of ADR 0027 for a body
 * the planet pass does not draw. Two pieces share the body's atmosphere uniforms: aerial
 * perspective on the moon pass's ground (transmittance and in-scatter between the camera and the
 * fragment) and a sky shell at the top of the air, drawn from inside (the sky from the surface)
 * and outside (the lit limb from orbit). Everything is body-fixed, metres from the body's centre.
 */
import { AdditiveBlending, BackSide, Mesh, ShaderMaterial, SphereGeometry, Uniform } from 'three';
import type { Vector3 } from 'three';
import { atmosphereGLSL } from './shaders/atmosphere.glsl.ts';
import type { AtmosphereUniforms } from './planet.ts';

/** View samples of the march: fewer than the planet pass's, a later body is seen smaller. */
export const MOON_AIR_SAMPLES = 6;

/** The camera and the sun, body-fixed, for every ground fragment of the moon pass (the air and the sea read them). */
export const moonViewCommon = /* glsl */ `
uniform vec3 uCamBody;
uniform vec3 uAirSun;
`;

/**
 * The sea of a hills body (ADR 0121 point 3): Fresnel reflection of the sky and the sun's glint on
 * the water the colour chunk found (\`hillsWater\`), with small waves on the patches in patch-local
 * metres (float32 stays exact). Body-fixed vectors throughout.
 */
export const moonSeaFragmentCommon = /* glsl */ `
uniform float uSeaTime;
vec3 seaNormal(vec3 n, vec2 metres, vec3 e, vec3 f) {
	vec2 g = vec2(0.0);
	g += 0.045 * vec2(0.031, 0.017) * cos(dot(metres, vec2(0.031, 0.017)) * 6.2832 + uSeaTime * 1.3);
	g += 0.035 * vec2(-0.023, 0.041) * cos(dot(metres, vec2(-0.023, 0.041)) * 6.2832 + uSeaTime * 1.7);
	g += 0.02 * vec2(0.091, -0.067) * cos(dot(metres, vec2(0.091, -0.067)) * 6.2832 + uSeaTime * 2.9);
	return normalize(n - 6.2832 * (g.x * e + g.y * f));
}
vec3 moonSea(vec3 colour, vec3 p, vec3 n, float water, vec3 sky, vec3 sun) {
	if (water <= 0.0) return colour;
	vec3 v = normalize(uCamBody - p);
	float nv = max(dot(n, v), 0.0);
	float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
	vec3 r = reflect(-uAirSun, n);
	float glint = pow(max(dot(r, v), 0.0), 700.0) * step(0.0, dot(n, uAirSun));
	return colour + water * (fres * sky * 0.35 + glint * sun * 3.0);
}
`;

/** For the moon pass's Lambert fragment: the march, the camera, and `moonAir(colour, position)`. */
export const moonAirFragmentCommon = /* glsl */ `
#define VIEW_SAMPLES ${MOON_AIR_SAMPLES}
${atmosphereGLSL}
vec3 moonAir(vec3 colour, vec3 p) {
	vec3 ro = uCamBody;
	vec3 seg = p - ro;
	float tg = length(seg);
	if (tg <= 0.0) return colour;
	vec3 rd = seg / tg;
	float r0 = length(ro);
	vec2 at = raySphere(r0, dot(ro, rd) / r0, uR + uAtmH);
	float t0 = max(at.x, 0.0);
	float t1 = min(at.y, tg);
	if (at.y <= 0.0 || t1 <= t0) return colour;
	Scatter sc = marchAtmosphere(ro, rd, t0, t1, uAirSun, 0.5, 1e30, 1e30, r0 < uR + uAtmH ? 2.0 : 1.0);
	return colour * sc.transmittance + sc.inscatter;
}
`;

/** The shell's material: the sky's in-scatter along each view ray, added over what is behind. */
export function skyShellMaterial(
	air: AtmosphereUniforms,
	camera: Uniform<Vector3>,
	sun: Uniform<Vector3>,
	radius: Uniform<number>
): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: { ...air, uCamBody: camera, uSunBody: sun, uRadius: radius },
		vertexShader: /* glsl */ `
			#include <common>
			#include <logdepthbuf_pars_vertex>
			varying vec3 vBody;
			void main() {
				vBody = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				#include <logdepthbuf_vertex>
			}
		`,
		fragmentShader: /* glsl */ `
			#define VIEW_SAMPLES ${MOON_AIR_SAMPLES}
			#include <common>
			#include <logdepthbuf_pars_fragment>
			${atmosphereGLSL}
			uniform vec3 uCamBody;
			uniform vec3 uSunBody;
			uniform float uRadius;
			varying vec3 vBody;
			void main() {
				#include <logdepthbuf_fragment>
				vec3 ro = uCamBody;
				vec3 rd = normalize(vBody - ro);
				float r0 = length(ro);
				float mu = dot(ro, rd) / r0;
				vec2 at = raySphere(r0, mu, uR + uAtmH);
				// the ground's own aerial perspective covers rays that reach it
				vec2 ground = raySphere(r0, mu, uRadius);
				float t0 = max(at.x, 0.0);
				float t1 = ground.y > 0.0 && ground.x > 0.0 ? min(at.y, ground.x) : at.y;
				if (at.y <= 0.0 || t1 <= t0) discard;
				Scatter sc = marchAtmosphere(ro, rd, t0, t1, uSunBody, 0.5, 1e30, 1e30, r0 < uR + uAtmH ? 2.0 : 1.0);
				gl_FragColor = vec4(sc.inscatter, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`,
		side: BackSide,
		blending: AdditiveBlending,
		transparent: true,
		depthWrite: false
	});
}

/** The sky shell of a body with air: a sphere at the top of its atmosphere, body-fixed. */
export function skyShell(material: ShaderMaterial, top: number): Mesh {
	const mesh = new Mesh(new SphereGeometry(top, 96, 48), material);
	mesh.name = 'sky-shell';
	mesh.frustumCulled = false;
	mesh.renderOrder = -2;
	return mesh;
}
