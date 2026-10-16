/** Re-entry plasma: a glowing bubble around the windward end and a streak behind (plan 020). */
import type { Vec3 } from '@orbital/core';
import {
	AdditiveBlending,
	BufferGeometry,
	Color,
	DoubleSide,
	Mesh,
	Object3D,
	Quaternion,
	ShaderMaterial,
	SphereGeometry,
	Vector3
} from 'three';
import { createPlumeGeometry } from './plume-mesh.ts';
import { PLUME_FRAG, PLUME_VERT, SHELL_FRAG, SHELL_VERT } from './shaders.ts';

export interface PlasmaFrame {
	/** 0..1 from `plasmaIntensity`. */
	intensity: number;
	/** Unit direction of travel relative to the air (render axes). */
	forward: Vec3;
	/** Windward end of the vessel in render space. */
	front: Vec3;
	/** Length of the vessel along `forward`, m. */
	extent: number;
	/** Lateral radius of the vessel, m. */
	radius: number;
	time: number;
	/** Shock-layer colour (`ionisationColour`); the old orange when absent. */
	tint?: readonly [number, number, number];
}

export class PlasmaEffect {
	readonly root = new Object3D();
	private readonly shellGeometry = new SphereGeometry(1, 24, 16);
	private readonly wakeGeometry: BufferGeometry;
	private readonly shell: Mesh;
	private readonly wake: Mesh;
	private readonly shellMaterial: ShaderMaterial;
	private readonly wakeMaterial: ShaderMaterial;
	private readonly q = new Quaternion();

	constructor() {
		this.root.name = 'plasma';
		this.wakeGeometry = createPlumeGeometry(20, 16);
		this.shellMaterial = new ShaderMaterial({
			vertexShader: SHELL_VERT,
			fragmentShader: SHELL_FRAG,
			uniforms: {
				uForward: { value: new Vector3(0, 1, 0) },
				uIntensity: { value: 0 },
				uTime: { value: 0 },
				uTint: { value: new Color(1, 0.35, 0.1) }
			},
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			side: DoubleSide
		});
		this.wakeMaterial = new ShaderMaterial({
			vertexShader: PLUME_VERT,
			fragmentShader: PLUME_FRAG,
			uniforms: {
				uLength: { value: 1 },
				uExitR: { value: 1 },
				uMaxR: { value: 1 },
				uRadiusScale: { value: 1 },
				uLengthScale: { value: 1 },
				uTime: { value: 0 },
				uGain: { value: 0 },
				uVacuum: { value: 0 },
				uDiamonds: { value: 0 },
				uColor: { value: new Color(1, 0.35, 0.12) },
				uCore: { value: new Color(1, 0.8, 0.6) }
			},
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			side: DoubleSide
		});
		this.shell = new Mesh(this.shellGeometry, this.shellMaterial);
		this.wake = new Mesh(this.wakeGeometry, this.wakeMaterial);
		for (const m of [this.shell, this.wake]) {
			m.frustumCulled = false;
			m.renderOrder = 11;
			this.root.add(m);
		}
		this.root.visible = false;
	}

	update(f: PlasmaFrame): void {
		this.root.visible = f.intensity > 0.02;
		if (!this.root.visible) return;
		const fwd = new Vector3(f.forward.x, f.forward.y, f.forward.z).normalize();
		const rw = Math.max(1.6, f.radius * 2.1) * (0.75 + 0.5 * f.intensity);
		this.shell.position.set(
			f.front.x - fwd.x * rw * 0.45,
			f.front.y - fwd.y * rw * 0.45,
			f.front.z - fwd.z * rw * 0.45
		);
		this.shell.scale.setScalar(rw);
		const u = this.shellMaterial.uniforms;
		(u.uForward!.value as Vector3).copy(fwd);
		u.uIntensity!.value = f.intensity;
		u.uTime!.value = f.time;
		const tint = f.tint ?? [1, 0.35, 0.1];
		(u.uTint!.value as Color).setRGB(tint[0], tint[1], tint[2]);

		// Wake: the plume surface points along local -Y, so turn -Y onto -forward.
		this.q.setFromUnitVectors(new Vector3(0, -1, 0), fwd.clone().negate());
		this.wake.quaternion.copy(this.q);
		this.wake.position.set(f.front.x, f.front.y, f.front.z);
		const w = this.wakeMaterial.uniforms;
		w.uLength!.value = f.extent + 4 + 12 * f.intensity;
		w.uExitR!.value = Math.max(0.5, f.radius * 0.7);
		w.uMaxR!.value = Math.max(0.8, f.radius * 1.1) * (0.6 + 0.5 * f.intensity);
		w.uTime!.value = f.time;
		w.uGain!.value = 0.8 * f.intensity;
		(w.uColor!.value as Color).setRGB(tint[0], tint[1] * 0.9, tint[2] * 1.1);
	}

	dispose(): void {
		this.shellGeometry.dispose();
		this.wakeGeometry.dispose();
		this.shellMaterial.dispose();
		this.wakeMaterial.dispose();
	}
}
