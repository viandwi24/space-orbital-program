/**
 * Automatic staging (ADR 0029). `stages[k]` lists the parts the k-th stage command fires
 * (ADR 0016), so stage 0 fires first. A part with `d` decouplers between it and the root (itself
 * excluded) fires in stage `maxDepth - d`: the lowest engines first, each decoupler together
 * with the engines of the stack it uncovers.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';
import { ModuleDecoupler, ModuleEngine } from '@orbital/mod-stock';

/** Engines and decouplers: the parts the Δv model knows how to stage. */
export function isAutoStaged(
	design: Pick<VesselDesign, 'parts'>,
	parts: PartLookup,
	index: number
): boolean {
	const entry = design.parts.find((p) => p.index === index);
	const def = entry && parts.get(entry.part);
	return !!def?.modules?.some((m) => m[0] === ModuleEngine.id || m[0] === ModuleDecoupler.id);
}

export function autoStages(design: VesselDesign, parts: PartLookup): number[][] {
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const isDecoupler = (index: number): boolean => {
		const def = parts.get(byIndex.get(index)!.part);
		return !!def?.modules?.some((m) => m[0] === ModuleDecoupler.id);
	};
	const depth = new Map<number, number>();
	const depthOf = (index: number): number => {
		const known = depth.get(index);
		if (known !== undefined) return known;
		const parent = byIndex.get(index)?.parent;
		const d = parent ? depthOf(parent.index) + (isDecoupler(parent.index) ? 1 : 0) : 0;
		depth.set(index, d);
		return d;
	};
	const staged = design.parts
		.filter((p) => isAutoStaged(design, parts, p.index))
		.map((p) => ({ index: p.index, depth: depthOf(p.index) }));
	if (staged.length === 0) return [];
	const maxDepth = Math.max(...staged.map((s) => s.depth));
	const stages: number[][] = Array.from({ length: maxDepth + 1 }, () => []);
	for (const s of staged) stages[maxDepth - s.depth]!.push(s.index);
	return stages.filter((s) => s.length > 0).map((s) => s.sort((a, b) => a - b));
}

/** Same stage contents, order inside a stage ignored. */
export function sameStages(
	a: readonly (readonly number[])[],
	b: readonly (readonly number[])[]
): boolean {
	if (a.length !== b.length) return false;
	return a.every((s, k) => {
		const t = b[k]!;
		return s.length === t.length && [...s].sort().join() === [...t].sort().join();
	});
}

/** True when any module of the part reacts to a stage (engine, decoupler, landing legs). */
export function isStageable(
	def: { modules?: readonly (readonly [string, ...unknown[]])[] } | undefined,
	modules: { get(id: string): { onStage?: unknown } | undefined }
): boolean {
	return !!def?.modules?.some((m) => modules.get(m[0])?.onStage !== undefined);
}

/** Next stage when a part is nudged one step up (later) or down (earlier); null is the unstaged tray below stage 0. */
export function nudgeStage(
	current: number | null,
	stageCount: number,
	direction: 1 | -1
): number | null {
	if (current === null) return direction === 1 ? 0 : null;
	if (direction === 1) return current + 1 > stageCount ? stageCount : current + 1;
	return current === 0 ? null : current - 1;
}
