/**
 * Vessel lights in the scene (plan 242, ADR 0239). A lit lamp always glows on its own part (an
 * emissive lens); real light comes from a small pool of spot lights without shadows. The pool is
 * the light budget: of all the lit lamps in the scene the nearest to the eye within reach get a
 * light, the rest keep only their glow.
 */
import { Object3D, SpotLight, Vector3, type Camera, type Scene } from 'three';

/** How many lamps throw light at once. */
export const LAMP_BUDGET = 2;
/** A lamp farther than this from the eye (m) throws no light, whatever its range. */
export const LAMP_CULL_DISTANCE = 600;
/** Candela scale of a lamp at full brightness. */
const LAMP_POWER = 4_000;

/** What a lit lamp asks of the scene. */
export interface LampLight {
	/** World position of the lens, m. */
	position: readonly [number, number, number];
	/** Unit direction of the beam. */
	direction: readonly [number, number, number];
	/** Colour as 0xRRGGBB. */
	colour: number;
	/** 0..1 */
	intensity: number;
	/** Half-angle of the cone, radians. */
	angle: number;
	/** Reach, m. */
	range: number;
}

/**
 * The lamps that get a light: of those within `LAMP_CULL_DISTANCE` of `eye` and within three
 * ranges, the nearest `budget`, nearest first. Pure.
 */
export function chooseLamps<T extends Pick<LampLight, 'position' | 'range' | 'intensity'>>(
	lamps: readonly T[],
	eye: readonly [number, number, number],
	budget = LAMP_BUDGET
): T[] {
	return lamps
		.filter((l) => l.intensity > 0)
		.map((l) => ({
			l,
			d: Math.hypot(l.position[0] - eye[0], l.position[1] - eye[1], l.position[2] - eye[2])
		}))
		.filter(({ l, d }) => d <= LAMP_CULL_DISTANCE && d <= l.range * 3)
		.sort((a, b) => a.d - b.d)
		.slice(0, Math.max(0, budget))
		.map(({ l }) => l);
}

/**
 * A fixed set of spot lights that follow the chosen lamps; unused ones stay in the scene at zero
 * intensity. They are never hidden: the number of visible lights is part of every lit material's
 * shader, so a light that showed or hid rebuilt them all (1-2 s on WebGL, up to 6 s on WebGPU when a
 * lamp went on; owner, 2026-10-22).
 */
export class LampPool {
	readonly lights: SpotLight[] = [];
	private readonly targets: Object3D[] = [];
	private readonly eye = new Vector3();

	constructor(
		private readonly scene: Scene,
		readonly budget = LAMP_BUDGET
	) {
		for (let i = 0; i < budget; i++) {
			const light = new SpotLight(0xffffff, 0, 0, Math.PI / 6, 0.5, 2);
			light.castShadow = false;
			const target = new Object3D();
			light.target = target;
			scene.add(light, target);
			this.lights.push(light);
			this.targets.push(target);
		}
	}

	/** Gives the nearest lamps a light each; returns how many are lit. */
	update(lamps: readonly LampLight[], camera: Camera): number {
		const e = camera.getWorldPosition(this.eye);
		const chosen = chooseLamps(lamps, [e.x, e.y, e.z], this.budget);
		for (const [i, light] of this.lights.entries()) {
			const lamp = chosen[i];
			if (!lamp) {
				light.intensity = 0;
				continue;
			}
			light.position.set(...lamp.position);
			this.targets[i]!.position.set(
				lamp.position[0] + lamp.direction[0],
				lamp.position[1] + lamp.direction[1],
				lamp.position[2] + lamp.direction[2]
			);
			light.color.set(lamp.colour);
			light.intensity = LAMP_POWER * lamp.intensity;
			light.angle = lamp.angle;
			light.distance = lamp.range;
		}
		return chosen.length;
	}

	dispose(): void {
		for (const l of this.lights) l.removeFromParent();
		for (const t of this.targets) t.removeFromParent();
		this.lights.length = 0;
		this.targets.length = 0;
	}
}
