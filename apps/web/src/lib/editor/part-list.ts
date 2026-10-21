/**
 * The vessel's parts as a list for the Hangar (plan 316): a tree from the root, each part under
 * the one it hangs on, with what a shell holds. Pure.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';

export interface PartRow {
	index: number;
	title: string;
	/** How deep in the tree: the root is 0. */
	depth: number;
	/** For a fairing, bay or petal set: how many parts it holds. */
	holds?: number;
	/** The shell this part sits inside, if any. */
	inside?: number;
}

export function partRows(
	design: VesselDesign,
	parts: PartLookup,
	shells: ReadonlyMap<number, readonly number[]> = new Map()
): PartRow[] {
	const children = new Map<number, number[]>();
	const root = design.parts.find((p) => p.parent === null);
	for (const p of design.parts) {
		if (!p.parent) continue;
		const list = children.get(p.parent.index) ?? [];
		list.push(p.index);
		children.set(p.parent.index, list);
	}
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const insideOf = new Map<number, number>();
	for (const [shell, held] of shells) for (const i of held) insideOf.set(i, shell);
	const out: PartRow[] = [];
	const seen = new Set<number>();
	const visit = (index: number, depth: number): void => {
		if (seen.has(index)) return;
		seen.add(index);
		const p = byIndex.get(index);
		if (!p) return;
		const held = shells.get(index);
		const shell = insideOf.get(index);
		out.push({
			index,
			title: parts.get(p.part)?.title ?? p.part,
			depth,
			...(held ? { holds: held.length } : {}),
			...(shell !== undefined ? { inside: shell } : {})
		});
		for (const c of children.get(index) ?? []) visit(c, depth + 1);
	};
	if (root) visit(root.index, 0);
	return out;
}
