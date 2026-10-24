/**
 * Which lights a material sees (plan 414, ADR 0374). In three's node materials every light of the scene
 * is in every lit material's light loop, so the few pooled lamps (vessel lamps, plume cluster lights)
 * cost the whole ground, grass and site the same as the vessel they light. A material with a
 * `lightsNode` sees only the lights in it. On WebGPU a classic material is converted to its node twin
 * by copying its properties (`NodeLibrary.fromMaterial`), so setting `lightsNode` on the classic
 * material is enough, and WebGL ignores it. The set is fixed at load: no program key changes in play.
 */
import type { Material } from 'three';

/** Gives every material `lights` as its light set; returns how many it changed. */
export function restrictLights(materials: Iterable<Material>, lights: unknown): number {
	let n = 0;
	for (const m of new Set(materials)) {
		(m as unknown as { lightsNode: unknown }).lightsNode = lights;
		n++;
	}
	return n;
}

/** The lights a restricted material sees, if it is. */
export const lightSetOf = (m: Material): unknown =>
	(m as unknown as { lightsNode?: unknown }).lightsNode ?? null;
