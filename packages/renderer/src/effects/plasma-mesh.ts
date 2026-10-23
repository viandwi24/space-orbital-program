/** Re-entry plasma: a glowing bubble around the windward end and a streak behind (plan 020). */
import type { Vec3 } from '@orbital/core';
import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	DoubleSide,
	Mesh,
	Object3D,
	DynamicDrawUsage,
	Quaternion,
	ShaderMaterial,
	Uint16BufferAttribute,
	Vector3
} from 'three';
import {
	SHELL_RINGS,
	SHELL_SEGMENTS,
	shellIndices,
	shellLength,
	writeShell,
	type ShellRing
} from './plasma-shape.ts';
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
	/**
	 * The shock layer as rings from the nose back (`shellRings`), the axial coordinate of the
	 * windward end they are measured from, and where that point is in render space (on the stack's
	 * axis). Without it the shell is a ball sized by `radius`.
	 */
	shell?: { rings: readonly ShellRing[]; front: number; origin: Vec3 };
	time: number;
	/** Shock-layer colour (`ionisationColour`); the old orange when absent. */
	tint?: readonly [number, number, number];
	/** The three layers' colours (plan 399, `plasmaColour`); each the tint when absent. */
	skin?: readonly [number, number, number];
	shock?: readonly [number, number, number];
	trail?: readonly [number, number, number];
	/** 0..1 condensation and vapour cone (`condensationOpacity`), drawn on the same shell. */
	condensation?: number;
	/** 0 Low, 1 Medium, 2 High: streaks and the bow shock from High. */
	detail?: 0 | 1 | 2;
}

export class PlasmaEffect {
	readonly root = new Object3D();
	private readonly shellGeometry = new BufferGeometry();
	private readonly shellPositions = new Float32Array(SHELL_RINGS * (SHELL_SEGMENTS + 1) * 3);
	private readonly shellNormals = new Float32Array(SHELL_RINGS * (SHELL_SEGMENTS + 1) * 3);
	private readonly wakeGeometry: BufferGeometry;
	private readonly shell: Mesh;
	private readonly wake: Mesh;
	private readonly shellMaterial: ShaderMaterial;
	private readonly wakeMaterial: ShaderMaterial;
	private readonly q = new Quaternion();

	constructor() {
		this.root.name = 'plasma';
		const pos = new BufferAttribute(this.shellPositions, 3);
		pos.setUsage(DynamicDrawUsage);
		const nor = new BufferAttribute(this.shellNormals, 3);
		nor.setUsage(DynamicDrawUsage);
		this.shellGeometry.setAttribute('position', pos);
		this.shellGeometry.setAttribute('normal', nor);
		this.shellGeometry.setIndex(new Uint16BufferAttribute(shellIndices(), 1));
		this.wakeGeometry = createPlumeGeometry(20, 16);
		this.shellMaterial = new ShaderMaterial({
			vertexShader: SHELL_VERT,
			fragmentShader: SHELL_FRAG,
			uniforms: {
				uForward: { value: new Vector3(0, 1, 0) },
				uIntensity: { value: 0 },
				uTime: { value: 0 },
				uTint: { value: new Color(1, 0.35, 0.1) },
				uSkin: { value: new Color(1, 0.35, 0.1) },
				uShock: { value: new Color(1, 0.35, 0.1) },
				uTrail: { value: new Color(1, 0.35, 0.1) },
				uCondense: { value: 0 },
				uDetail: { value: 2 },
				// Axial coordinate of the shell tip and its length: the shell fades towards the tail.
				uTip: { value: 1 },
				uLength: { value: 1e9 }
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
				uPeriod: { value: 2.6 },
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
		const condensation = f.condensation ?? 0;
		this.root.visible = f.intensity > 0.02 || condensation > 0.02;
		if (!this.root.visible) return;
		const fwd = new Vector3(f.forward.x, f.forward.y, f.forward.z).normalize();
		const rw = Math.max(1.6, f.radius * 2.1) * (0.75 + 0.5 * f.intensity);
		if (f.shell) {
			// The shell is built in a frame with +Y along the airflow, origin at the windward end.
			writeShell(f.shell.rings, f.shell.front, this.shellPositions, this.shellNormals);
			this.shellGeometry.getAttribute('position').needsUpdate = true;
			this.shellGeometry.getAttribute('normal').needsUpdate = true;
			this.shell.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), fwd);
			this.shell.position.set(f.shell.origin.x, f.shell.origin.y, f.shell.origin.z);
			this.shell.scale.setScalar(1);
			this.shellMaterial.uniforms.uTip!.value = f.shell.rings[0]!.s - f.shell.front;
			this.shellMaterial.uniforms.uLength!.value = shellLength(f.shell.rings);
		} else {
			// No part data: a ball ahead of the windward end, as before the silhouette (plan 033).
			this.shell.quaternion.identity();
			this.shell.position.set(
				f.front.x - fwd.x * rw * 0.45,
				f.front.y - fwd.y * rw * 0.45,
				f.front.z - fwd.z * rw * 0.45
			);
			this.shell.scale.setScalar(rw);
			this.shellMaterial.uniforms.uLength!.value = 1e9;
			this.fallbackBall();
		}
		const u = this.shellMaterial.uniforms;
		(u.uForward!.value as Vector3).copy(fwd);
		u.uIntensity!.value = f.intensity;
		u.uTime!.value = f.time;
		const tint = f.tint ?? [1, 0.35, 0.1];
		(u.uTint!.value as Color).setRGB(tint[0], tint[1], tint[2]);
		const skin = f.skin ?? tint;
		const shock = f.shock ?? tint;
		const trail = f.trail ?? tint;
		(u.uSkin!.value as Color).setRGB(skin[0], skin[1], skin[2]);
		(u.uShock!.value as Color).setRGB(shock[0], shock[1], shock[2]);
		(u.uTrail!.value as Color).setRGB(trail[0], trail[1], trail[2]);
		u.uCondense!.value = condensation;
		u.uDetail!.value = f.detail ?? 2;

		// Wake: the plume surface points along local -Y, so turn -Y onto -forward.
		this.q.setFromUnitVectors(new Vector3(0, -1, 0), fwd.clone().negate());
		this.wake.quaternion.copy(this.q);
		// The wake starts inside the stack, behind the shell, so its bright opening is not seen as a tube.
		const back = f.shell ? f.extent * 0.45 : 0;
		this.wake.position.set(
			f.front.x - fwd.x * back,
			f.front.y - fwd.y * back,
			f.front.z - fwd.z * back
		);
		const w = this.wakeMaterial.uniforms;
		w.uLength!.value = f.extent + back + 4 + 12 * f.intensity;
		w.uExitR!.value = Math.max(0.5, f.radius * (f.shell ? 0.4 : 0.7));
		w.uMaxR!.value = Math.max(0.8, f.radius * 1.1) * (0.6 + 0.5 * f.intensity);
		w.uTime!.value = f.time;
		w.uGain!.value = (f.shell ? 0.35 : 0.8) * f.intensity;
		(w.uColor!.value as Color).setRGB(trail[0], trail[1] * 0.9, trail[2] * 1.1);
	}

	/** Fills the shell buffers with a unit sphere (rings from the +Y pole down) for the no-parts case. */
	private fallbackBall(): void {
		const rings: ShellRing[] = [];
		for (let i = 0; i < SHELL_RINGS; i++) {
			const a = (i / (SHELL_RINGS - 1)) * Math.PI;
			rings.push({ s: Math.cos(a), r: Math.sin(a) });
		}
		writeShell(rings, 0, this.shellPositions, this.shellNormals);
		this.shellGeometry.getAttribute('position').needsUpdate = true;
		this.shellGeometry.getAttribute('normal').needsUpdate = true;
	}

	dispose(): void {
		this.shellGeometry.dispose();
		this.wakeGeometry.dispose();
		this.shellMaterial.dispose();
		this.wakeMaterial.dispose();
	}
}
