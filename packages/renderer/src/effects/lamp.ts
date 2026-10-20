/**
 * The lit lens of a lamp part (plan 242, ADR 0239): a small emissive disc at `lamp.pos` that glows in
 * the module's colour while the lamp is on, and the reading the scene turns into a spot light.
 */
import type { PartVisual } from '@orbital/core';
import { CylinderGeometry, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { LampReading } from '../parts/types.ts';

type LampSpec = NonNullable<PartVisual['lamp']>;

export const LAMP_DEFAULT_ANGLE = 25;
export const LAMP_DEFAULT_RANGE = 80;
/** A blinking lamp is on for this share of each second. */
export const BLINK_PERIOD = 1;

/** The module's `colour` (a `#rrggbb` string) as 0xRRGGBB; white for anything else. */
export function colourNumber(value: unknown): number {
	if (typeof value !== 'string') return 0xffffff;
	const m = /^#([0-9a-f]{6})$/i.exec(value);
	return m ? parseInt(m[1]!, 16) : 0xffffff;
}

/** Whether a blinking lamp is lit at `time` seconds: on for the first half of each period. */
export const blinkOn = (time: number): boolean => time % BLINK_PERIOD < BLINK_PERIOD / 2;

export class LampEffect {
	/** Sits at the lens, looking along +Y; the lens disc is its child. */
	readonly object = new Object3D();
	private readonly lens: Mesh;
	private readonly material = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
	private current: LampReading | null = null;

	constructor(
		private readonly spec: LampSpec,
		geometry: CylinderGeometry
	) {
		this.object.name = 'lamp';
		this.object.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
		const dir = new Vector3(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
		this.object.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
		this.lens = new Mesh(geometry, this.material);
		this.lens.visible = false;
		this.object.add(this.lens);
	}

	/** Applies the module snapshot at `time`; the lens glows only while the reading is lit. */
	update(module: Record<string, unknown> | undefined, time: number): void {
		const lit = module?.on === true && (module.blink !== true || blinkOn(time));
		const brightness =
			typeof module?.brightness === 'number' ? Math.min(1, Math.max(0, module.brightness)) : 1;
		if (!lit || brightness <= 0) {
			this.current = null;
			this.lens.visible = false;
			return;
		}
		const colour = colourNumber(module?.colour);
		this.material.color.setHex(colour).multiplyScalar(0.4 + 0.6 * brightness);
		this.lens.visible = true;
		this.current = {
			on: true,
			colour,
			intensity: brightness,
			angle: ((this.spec.angle ?? LAMP_DEFAULT_ANGLE) * Math.PI) / 180,
			range: this.spec.range ?? LAMP_DEFAULT_RANGE
		};
	}

	read(): LampReading | null {
		return this.current;
	}

	dispose(): void {
		this.material.dispose();
	}
}

/** The lens disc, shared by every lamp: 0.08 m across, facing +Y. */
export const createLensGeometry = (): CylinderGeometry =>
	new CylinderGeometry(0.04, 0.04, 0.01, 12);
