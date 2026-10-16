/**
 * The light a burning engine throws on the ground (plan 033, ADR 0047): one additive disc per lit
 * engine group lying on the ground below the nozzle. A scene light would make every lit material
 * pay for it in every pass; a disc costs a draw call and only while an engine is near the ground.
 */
import {
	AdditiveBlending,
	CircleGeometry,
	Color,
	Mesh,
	Object3D,
	Quaternion,
	ShaderMaterial,
	Vector3
} from 'three';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
	vUv = position.xy;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	#include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uGain;
varying vec2 vUv;
void main() {
	#include <logdepthbuf_fragment>
	float d = length(vUv);
	float glow = pow(max(1.0 - d, 0.0), 2.2);
	gl_FragColor = vec4(uColor * uGain * glow, glow * min(uGain, 1.0));
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export interface GroundGlowItem {
	/** Centre of the disc in render space. */
	position: { x: number; y: number; z: number };
	/** Unit normal of the ground (render space). */
	up: { x: number; y: number; z: number };
	radius: number;
	intensity: number;
}

/** A small pool of discs; unused ones are hidden. */
export class GroundGlow {
	readonly root = new Object3D();
	private readonly geometry = new CircleGeometry(1, 32);
	private readonly meshes: Mesh[] = [];
	private readonly materials: ShaderMaterial[] = [];
	private readonly q = new Quaternion();
	private readonly z = new Vector3(0, 0, 1);

	constructor(readonly capacity = 4) {
		this.root.name = 'ground-glow';
		for (let i = 0; i < capacity; i++) {
			const material = new ShaderMaterial({
				vertexShader: VERT,
				fragmentShader: FRAG,
				uniforms: { uColor: { value: new Color(1, 0.62, 0.3) }, uGain: { value: 0 } },
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
				polygonOffset: true,
				polygonOffsetFactor: -2,
				polygonOffsetUnits: -2
			});
			const mesh = new Mesh(this.geometry, material);
			mesh.frustumCulled = false;
			mesh.renderOrder = 7;
			mesh.visible = false;
			this.materials.push(material);
			this.meshes.push(mesh);
			this.root.add(mesh);
		}
	}

	/** Shows the first `capacity` items, hides the rest. */
	update(items: readonly GroundGlowItem[]): void {
		for (let i = 0; i < this.capacity; i++) {
			const item = items[i];
			const mesh = this.meshes[i]!;
			if (!item || item.intensity <= 0.002 || item.radius <= 0) {
				mesh.visible = false;
				continue;
			}
			mesh.visible = true;
			mesh.position.set(item.position.x, item.position.y, item.position.z);
			this.q.setFromUnitVectors(this.z, new Vector3(item.up.x, item.up.y, item.up.z));
			mesh.quaternion.copy(this.q);
			mesh.scale.setScalar(item.radius);
			this.materials[i]!.uniforms.uGain!.value = 2.4 * item.intensity;
		}
	}

	get visibleCount(): number {
		return this.meshes.filter((m) => m.visible).length;
	}

	dispose(): void {
		this.geometry.dispose();
		for (const m of this.materials) m.dispose();
	}
}
