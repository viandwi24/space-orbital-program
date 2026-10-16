/**
 * Sub-assemblies (ADR 0041): a saved subtree is a design with one root and no stages. Its inner
 * links (including radial ones and their angles) are kept; the root's link to its old parent is
 * dropped, because that link belongs to the place it is attached at next.
 */
import type { VesselDesign } from '@orbital/core';
import { extract, reindex, rootOf, type Doc } from './state';

/** The subtree under `index` of `state` as a stand-alone assembly named `name`, indices from 0; null when `index` does not exist. */
export function assemblyFromSubtree(
	state: Pick<Doc, 'design' | 'loose'>,
	index: number,
	name: string
): VesselDesign | null {
	const out = extract(state, index);
	if (!out) return null;
	const flat = reindex({ ...out.assembly, name }, 0);
	// A group tag that no longer has a partner inside the assembly would bind the copy to nothing.
	const count = new Map<number, number>();
	for (const p of flat.parts)
		if (p.symmetry !== undefined) count.set(p.symmetry, (count.get(p.symmetry) ?? 0) + 1);
	const kept = [...count].filter(([, n]) => n > 1).map(([g]) => g);
	const renumber = new Map(kept.map((g, i) => [g, i]));
	return {
		...flat,
		formatVersion: 2,
		parts: flat.parts.map((p) => {
			const { symmetry, ...rest } = p;
			return symmetry !== undefined && renumber.has(symmetry)
				? { ...rest, symmetry: renumber.get(symmetry)! }
				: rest;
		})
	};
}

/** True when `assembly` is a usable sub-assembly: exactly one root, no stages. */
export function isAssembly(assembly: VesselDesign): boolean {
	return (
		assembly.parts.filter((p) => p.parent === null).length === 1 && assembly.stages.length === 0
	);
}

export { rootOf };
