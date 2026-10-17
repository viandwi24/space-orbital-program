/** Engine plume meshes: two nested shader cones and a glow sprite at the nozzle (plan 020). */
import type { PartVisual } from '@orbital/core';
import {
	AdditiveBlending,
	BufferGeometry,
	Color,
	DoubleSide,
	Float32BufferAttribute,
	Mesh,
	Object3D,
	PlaneGeometry,
	ShaderMaterial,
	Vector3
} from 'three';
import {
	DEFAULT_EXIT_PRESSURE,
	RAMP_START,
	diamondPeriod,
	plumeShape,
	stepEngineRamp,
	type EngineRamp,
	type PlumeInput,
	type PlumeShape
} from './plume.ts';
import { PLUME_FRAG, PLUME_VERT, SPRITE_FRAG, SPRITE_VERT } from './shaders.ts';

export type PlumeSpec = NonNullable<PartVisual['plume']>;

/** Unit plume surface: `position.y` is the parameter along the plume, x/z the unit circle. */
export function createPlumeGeometry(radial: number, rings = 24): BufferGeometry {
	const positions: number[] = [];
	const indices: number[] = [];
	for (let i = 0; i <= rings; i++) {
		const t = i / rings;
		for (let j = 0; j <= radial; j++) {
			const a = (j / radial) * Math.PI * 2;
			positions.push(Math.cos(a), t, Math.sin(a));
		}
	}
	for (let i = 0; i < rings; i++) {
		for (let j = 0; j < radial; j++) {
			const a = i * (radial + 1) + j;
			const b = a + radial + 1;
			indices.push(a, b, a + 1, a + 1, b, b + 1);
		}
	}
	const g = new BufferGeometry();
	g.setAttribute('position', new Float32BufferAttribute(positions, 3));
	g.setIndex(indices);
	return g;
}

export const createSpriteGeometry = (): BufferGeometry => new PlaneGeometry(1, 1);

const layerMaterial = (
	core: Color,
	colour: Color,
	radiusScale: number,
	lengthScale: number
): ShaderMaterial =>
	new ShaderMaterial({
		vertexShader: PLUME_VERT,
		fragmentShader: PLUME_FRAG,
		uniforms: {
			uLength: { value: 1 },
			uExitR: { value: 0.4 },
			uMaxR: { value: 0.5 },
			uRadiusScale: { value: radiusScale },
			uLengthScale: { value: lengthScale },
			uTime: { value: 0 },
			uGain: { value: 0 },
			uVacuum: { value: 0 },
			uDiamonds: { value: 0 },
			uPeriod: { value: 2.6 },
			uColor: { value: colour },
			uCore: { value: core }
		},
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide
	});

export class PlumeEffect {
	readonly root = new Object3D();
	private readonly outer: ShaderMaterial;
	private readonly inner: ShaderMaterial;
	private readonly sprite: ShaderMaterial;
	private readonly meshes: Mesh[] = [];
	shape: PlumeShape | null = null;
	private ramp: EngineRamp = RAMP_START;
	private rampTime: number | null = null;
	/** Bells of the engine (1 without `nozzles`). */
	private readonly bells: number;

	constructor(
		readonly spec: PlumeSpec,
		geometry: BufferGeometry,
		spriteGeometry: BufferGeometry
	) {
		this.root.name = 'plume';
		this.root.position.set(spec.nozzle[0], spec.nozzle[1], spec.nozzle[2]);
		const base = new Color(spec.color ?? '#ff8a2a');
		this.outer = layerMaterial(new Color(1, 0.85, 0.55), base, 1.4, 1);
		this.inner = layerMaterial(new Color(1, 0.98, 0.9), new Color(1, 0.78, 0.4), 0.58, 0.72);
		this.sprite = new ShaderMaterial({
			vertexShader: SPRITE_VERT,
			fragmentShader: SPRITE_FRAG,
			uniforms: {
				uSize: { value: 1 },
				uGain: { value: 0 },
				uColor: { value: new Color(1, 0.72, 0.38) }
			},
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending
		});
		// One set of meshes per bell (ADR 0081); they share the materials, so a cluster costs
		// draw calls and no extra uniforms. `root` sits at the thrust centre.
		const bells = spec.nozzles ?? [spec.nozzle];
		this.bells = bells.length;
		for (const bell of bells) {
			const holder = new Object3D();
			holder.name = 'bell';
			holder.position.set(
				bell[0] - spec.nozzle[0],
				bell[1] - spec.nozzle[1],
				bell[2] - spec.nozzle[2]
			);
			for (const [g, m] of [
				[geometry, this.outer],
				[geometry, this.inner],
				[spriteGeometry, this.sprite]
			] as const) {
				const mesh = new Mesh(g, m);
				mesh.frustumCulled = false;
				mesh.castShadow = false;
				mesh.receiveShadow = false;
				mesh.renderOrder = 10;
				holder.add(mesh);
				this.meshes.push(mesh);
			}
			this.root.add(holder);
		}
		this.root.visible = false;
	}

	/** Engine state and ambient pressure in, uniforms out. */
	update(
		state: { throttle: number; ignited: boolean; flameout: boolean },
		pressure: number,
		time: number
	): void {
		// The first call shows the engine as it is (a vessel entering view is not "igniting").
		const dt = this.rampTime === null ? 0 : Math.max(0, time - this.rampTime);
		if (this.rampTime === null) {
			const lit = state.ignited && !state.flameout;
			this.ramp = { level: lit ? state.throttle : 0, flash: 0, lit };
		} else this.ramp = stepEngineRamp(this.ramp, state, dt);
		this.rampTime = time;
		const input: PlumeInput = {
			throttle: this.ramp.level,
			ignited: this.ramp.level > 0,
			flameout: false,
			ambientPressure: pressure,
			exitPressure: this.spec.exitPressure ?? DEFAULT_EXIT_PRESSURE,
			baseLength: this.spec.length,
			exitRadius: this.spec.exitRadius
		};
		const shape = plumeShape(input);
		this.shape = shape;
		this.root.visible = shape.visible;
		if (!shape.visible) return;
		for (const m of [this.outer, this.inner]) {
			const u = m.uniforms;
			u.uLength!.value = shape.length;
			u.uExitR!.value = shape.exitRadius;
			u.uMaxR!.value = shape.maxRadius;
			u.uTime!.value = time;
			u.uVacuum!.value = shape.vacuum;
			u.uDiamonds!.value = shape.diamonds;
			u.uPeriod!.value = diamondPeriod(this.spec.exitRadius);
		}
		// Ignition flash: a brief extra glow and a wider sprite.
		const boost = 1 + 0.9 * this.ramp.flash;
		// The flames of a cluster's bells overlap near the exit: each is dimmer, so four of them add
		// up to about twice one engine's, which is what their thrust is (ADR 0081).
		const spread = Math.sqrt(this.bells);
		this.outer.uniforms.uGain!.value = (1.6 * shape.brightness * boost) / spread;
		this.inner.uniforms.uGain!.value = (4.2 * shape.brightness * boost) / spread;
		this.sprite.uniforms.uSize!.value =
			Math.max(0.7 / spread, shape.maxRadius * (2.6 - 1.5 * shape.vacuum)) *
			(1 + 0.35 * this.ramp.flash);
		this.sprite.uniforms.uGain!.value =
			((1.8 - 0.9 * shape.vacuum) * shape.brightness * boost) / spread;
	}

	/** Position of the nozzle exit in the part frame. */
	get nozzle(): Vector3 {
		return this.root.position;
	}

	dispose(): void {
		this.outer.dispose();
		this.inner.dispose();
		this.sprite.dispose();
	}
}
