/**
 * Automatic staging (ADR 0029). `stages[k]` lists the parts the k-th stage command fires
 * (ADR 0016), so stage 0 fires first. A part with `d` separators between it and the root (itself
 * excluded) fires in stage `maxDepth - d`: the lowest engines first, each decoupler together
 * with the engines of the stack it uncovers. Radial separators (boosters) do not count in `d` and
 * fire one stage after the engines of their level.
 */
import {
	describeModule,
	type ModuleDefinition,
	type PartDefinition,
	type PartLookup,
	type VesselDesign
} from '@orbital/core';

/** What staging needs to know about the content: parts, and their modules' descriptors (ADR 0033). */
export interface StagingContent {
	parts: PartLookup;
	modules: { get(id: string): ModuleDefinition | undefined };
}

/** Whether a part holds an engine and whether it holds a separator, by module descriptor. */
function stagingRoles(
	def: PartDefinition | undefined,
	modules: StagingContent['modules']
): { engine: boolean; separator: boolean } {
	const roles = { engine: false, separator: false };
	for (const [id, config] of def?.modules ?? []) {
		const module = modules.get(id);
		const info = module && describeModule(module, config);
		if (info?.engine) roles.engine = true;
		if (info?.separator) roles.separator = true;
	}
	return roles;
}

/** Engines and separators: the parts the Δv model knows how to stage. */
export function isAutoStaged(
	design: Pick<VesselDesign, 'parts'>,
	content: StagingContent,
	index: number
): boolean {
	const entry = design.parts.find((p) => p.index === index);
	const roles = stagingRoles(entry && content.parts.get(entry.part), content.modules);
	return roles.engine || roles.separator;
}

export function autoStages(design: VesselDesign, content: StagingContent): number[][] {
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const isDecoupler = (index: number): boolean =>
		stagingRoles(content.parts.get(byIndex.get(index)!.part), content.modules).separator;
	// A separator hung on the side of its parent (a booster's decoupler) does not put its subtree
	// one stage deeper: the booster burns with the stage it is attached to (ADR 0034).
	const isRadial = (index: number): boolean => byIndex.get(index)?.parent?.radial !== undefined;
	const depth = new Map<number, number>();
	const depthOf = (index: number): number => {
		const known = depth.get(index);
		if (known !== undefined) return known;
		const parent = byIndex.get(index)?.parent;
		const d = parent
			? depthOf(parent.index) + (isDecoupler(parent.index) && !isRadial(parent.index) ? 1 : 0)
			: 0;
		depth.set(index, d);
		return d;
	};
	const staged = design.parts
		.filter((p) => isAutoStaged(design, content, p.index))
		.map((p) => ({ index: p.index, depth: depthOf(p.index), radial: isRadial(p.index) }));
	if (staged.length === 0) return [];
	const maxDepth = Math.max(...staged.map((s) => s.depth));
	// Within one level the engines and the stack decoupler fire first, the radial separators
	// after them (the boosters burn out, then leave); then the next level.
	const rank = (s: (typeof staged)[number]): number =>
		(maxDepth - s.depth) * 2 + (s.radial && isDecoupler(s.index) ? 1 : 0);
	const ranks = [...new Set(staged.map(rank))].sort((a, b) => a - b);
	return ranks.map((r) =>
		staged
			.filter((s) => rank(s) === r)
			.map((s) => s.index)
			.sort((a, b) => a - b)
	);
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
