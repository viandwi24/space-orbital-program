/**
 * While plan 261 ports the shaders, the WebGPU renderer draws only what has a node material.
 * three's `WebGPURenderer` cannot draw a GLSL `ShaderMaterial`: it logs an error and draws the
 * mesh with a blank material instead. So each frame the meshes still on GLSL are hidden, drawn
 * around, and shown again, and their names are the list of what is left to port (Debug → Info).
 *
 * `onBeforeCompile` patches (weathering, the moons' part materials) are ignored by the node
 * renderer: those meshes draw, without the patch, and are listed apart.
 *
 * Phase 4: a material with a TSL twin (`tsl/twins.ts`) is swapped for the twin for the draw instead
 * of being hidden (`twinOf`), and swapped back in `restore`.
 */
import type { Material, Object3D } from 'three';

/** A material's twin for the draw: the node material and its per-frame sync, or null for none. */
export type TwinOf = (m: Material, o: Object3D) => { material: Material; sync(): void } | null;

export interface Unported {
	/** GLSL materials hidden for this frame, by name (or their mesh's, or type), sorted. */
	readonly glsl: string[];
	/** Materials drawn without their `onBeforeCompile` patch, by name (or type), sorted. */
	readonly patched: string[];
	/** Shows the hidden meshes again. */
	restore(): void;
}

const materialsOf = (o: Object3D): Material[] => {
	const m = (o as Object3D & { material?: Material | Material[] }).material;
	return m === undefined ? [] : Array.isArray(m) ? m : [m];
};
const nameOf = (m: Material): string => m.name || m.type;
/** three's default `onBeforeCompile` is an empty method on the prototype; an own one is a patch. */
const isPatched = (m: Material): boolean =>
	Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile');

/** Hides every visible mesh under `root` drawn with a GLSL material, until `restore`. */
export function hideUnported(root: Object3D, twinOf?: TwinOf): Unported {
	const hidden: Object3D[] = [];
	const swapped: {
		o: Object3D & { material: Material | Material[] };
		was: Material | Material[];
	}[] = [];
	const glsl = new Set<string>();
	const patched = new Set<string>();
	const visit = (o: Object3D): void => {
		if (!o.visible) return;
		const materials = materialsOf(o);
		const shader = materials.filter((m) => (m as { isShaderMaterial?: boolean }).isShaderMaterial);
		const twinnable = twinOf
			? materials.filter(
					(m) => (m as { isShaderMaterial?: boolean }).isShaderMaterial || isPatched(m)
				)
			: [];
		if (twinOf && twinnable.length > 0 && !Array.isArray((o as { material?: unknown }).material)) {
			const m = materials[0]!;
			const twin = twinOf(m, o);
			if (twin) {
				twin.sync();
				const om = o as Object3D & { material: Material };
				swapped.push({ o: om, was: om.material });
				om.material = twin.material;
				for (const child of o.children) visit(child);
				return;
			}
		}
		if (shader.length > 0) {
			// an unnamed material goes by its mesh's name, then its type
			for (const m of shader) glsl.add(m.name || o.name || m.type);
			o.visible = false;
			hidden.push(o);
			return;
		}
		for (const m of materials) if (isPatched(m)) patched.add(nameOf(m));
		for (const child of o.children) visit(child);
	};
	visit(root);
	return {
		glsl: [...glsl].sort(),
		patched: [...patched].sort(),
		restore() {
			for (const o of hidden) o.visible = true;
			for (const s of swapped) s.o.material = s.was;
		}
	};
}
