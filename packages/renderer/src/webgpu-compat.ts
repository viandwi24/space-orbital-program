/**
 * While plan 261 ports the shaders, the WebGPU renderer draws only what has a node material.
 * three's `WebGPURenderer` cannot draw a GLSL `ShaderMaterial`: it logs an error and draws the
 * mesh with a blank material instead. So each frame the meshes still on GLSL are hidden, drawn
 * around, and shown again, and their names are the list of what is left to port (Debug → Info).
 *
 * `onBeforeCompile` patches (weathering, the moons' part materials) are ignored by the node
 * renderer: those meshes draw, without the patch, and are listed apart.
 */
import type { Material, Object3D } from 'three';

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
export function hideUnported(root: Object3D): Unported {
	const hidden: Object3D[] = [];
	const glsl = new Set<string>();
	const patched = new Set<string>();
	const visit = (o: Object3D): void => {
		if (!o.visible) return;
		const materials = materialsOf(o);
		const shader = materials.filter((m) => (m as { isShaderMaterial?: boolean }).isShaderMaterial);
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
		}
	};
}
