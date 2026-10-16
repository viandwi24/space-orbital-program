/** Sky and ground seen from the vessel, for the image-based light cube (no sun disc, no clouds). */
import { atmosphereGLSL } from './atmosphere.glsl.ts';

export const skyEnvVertex = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyEnvFragment = /* glsl */ `
${atmosphereGLSL}
varying vec3 vDir;
uniform vec3 uUp;
uniform float uAlt;
uniform vec3 uSunDir;
uniform vec3 uGroundAlbedo;
uniform vec3 uNight;

void main() {
	vec3 rd = normalize(vDir);
	float R = uR;
	float h = max(uAlt, 0.0);
	float r0 = R + h;
	vec3 ro = uUp * r0;
	float d = dot(uUp, rd);
	vec3 cr = cross(uUp, rd);
	float disc = R * R - r0 * r0 * dot(cr, cr);
	bool hitP = disc > 0.0 && d < 0.0;
	float tHit = 0.0;
	if (hitP) tHit = h * (2.0 * R + h) / (r0 * (-d) + sqrt(disc));
	vec2 at = raySphere(r0, d, R + uAtmH);
	float t0 = max(at.x, 0.0);
	float t1 = hitP ? min(at.y, tHit) : at.y;
	vec3 base = vec3(0.0);
	if (hitP) {
		vec3 p = ro + rd * tHit;
		vec3 n = normalize(p);
		float ndl = max(dot(n, uSunDir), 0.0);
		base = uGroundAlbedo / kPI * (uSunIrr * sunTransmittance(p, uSunDir) * ndl + uNight * kPI);
	}
	vec3 colour = base;
	if (at.y > 0.0 && t1 > t0) {
		Scatter sc = marchAtmosphere(ro, rd, t0, t1, uSunDir, 0.5, -1.0, h < uAtmH ? 2.0 : 1.0);
		colour = base * sc.transmittance + sc.inscatter;
	}
	gl_FragColor = vec4(colour + uNight, 1.0);
}
`;
