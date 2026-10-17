/**
 * Steam venting from the launch site's tanks (plan 038, ADR 0073): one instanced mesh of camera-facing
 * soft quads whose position, size and opacity come from `steamPuff(index, time)`, so nothing about a
 * puff is stored. The quad is turned toward the camera in the vertex shader (no per-frame camera
 * work on the CPU); the planet's log depth, tone mapping and colour space chunks are included like
 * every other custom material.
 */
import {
	Color,
	InstancedBufferAttribute,
	InstancedMesh,
	Matrix4,
	PlaneGeometry,
	ShaderMaterial,
	Vector3
} from 'three';
import { STEAM_PUFFS, steamPuff } from './site-animation.ts';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aAlpha;
attribute float aSeed;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
	vUv = position.xy * 2.0;
	vAlpha = aAlpha;
	vSeed = aSeed;
	// the instance's centre and size, then a quad that faces the camera in view space
	vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
	float size = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
	vec4 mv = vec4(centre.xyz + vec3(position.xy * size * 2.0, 0.0), 1.0);
	gl_Position = projectionMatrix * mv;
	#include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uTint;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
float h21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
void main() {
	#include <logdepthbuf_fragment>
	float r = length(vUv);
	if (r > 1.0) discard;
	// a soft disc, ragged at the rim by a few lumps that are different for every puff
	float a = atan(vUv.y, vUv.x);
	float lumps = 0.78 + 0.22 * sin(a * 3.0 + vSeed * 17.0) * sin(a * 5.0 - vSeed * 9.0 + 1.3);
	float soft = pow(clamp(1.0 - r / lumps, 0.0, 1.0), 1.4);
	float grain = 0.88 + 0.24 * h21(floor(vUv * 9.0) + vSeed);
	gl_FragColor = vec4(uTint * (0.92 + 0.08 * grain), soft * vAlpha * grain);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export class SiteSteam {
	readonly mesh: InstancedMesh;
	private readonly alpha: InstancedBufferAttribute;
	private readonly material: ShaderMaterial;
	private readonly matrix = new Matrix4();
	private readonly position = new Vector3();

	constructor(private readonly vents: readonly { x: number; y: number; z: number }[]) {
		const count = vents.length * STEAM_PUFFS;
		const geometry = new PlaneGeometry(1, 1);
		this.material = new ShaderMaterial({
			vertexShader: VERT,
			fragmentShader: FRAG,
			uniforms: { uTint: { value: new Color(0.9, 0.92, 0.95) } },
			transparent: true,
			depthWrite: false
		});
		this.mesh = new InstancedMesh(geometry, this.material, count);
		this.mesh.name = 'site-steam';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.renderOrder = 6;
		this.alpha = new InstancedBufferAttribute(new Float32Array(count), 1);
		const seed = new InstancedBufferAttribute(new Float32Array(count), 1);
		for (let i = 0; i < count; i++) seed.setX(i, ((i * 0.6180339887) % 1) + 0.05);
		geometry.setAttribute('aAlpha', this.alpha);
		geometry.setAttribute('aSeed', seed);
	}

	/**
	 * Puts every puff at its place for time `t` (seconds, wrapped consistently by the caller) and
	 * lights it: `tint` is the linear colour of steam in the light of the moment, `visibility` (0 to 1)
	 * is how strongly the vents show (they die down when the vessel leaves).
	 */
	update(t: number, visibility: number, tint: readonly [number, number, number]): void {
		(this.material.uniforms.uTint!.value as Color).setRGB(tint[0], tint[1], tint[2]);
		let i = 0;
		let any = false;
		for (const vent of this.vents) {
			for (let k = 0; k < STEAM_PUFFS; k++, i++) {
				const p = steamPuff(k, t + vent.x * 0.37, visibility);
				this.position.set(vent.x + p.x, vent.y + p.y, vent.z + p.z);
				this.matrix.makeScale(p.size, p.size, p.size).setPosition(this.position);
				this.mesh.setMatrixAt(i, this.matrix);
				this.alpha.setX(i, p.alpha);
				if (p.alpha > 0.002) any = true;
			}
		}
		this.mesh.instanceMatrix.needsUpdate = true;
		this.alpha.needsUpdate = true;
		this.mesh.visible = any;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.material.dispose();
	}
}
