/**
 * The tech tree in the sim (plan 105, ADR 0154): research with science, the researched set saved
 * with the world, and the locked-part refusal at launch.
 */
import {
	SCIENCE_RULES,
	lockedParts,
	nodeOfParts,
	researchProblem,
	type CommandResult,
	type SaveTech,
	type Snapshot,
	type VesselDesign
} from '@orbital/core';
import type { SimCore } from './core.ts';
import { record, ruleOf } from './economy.ts';

export const freshTech = (saved?: SaveTech): SaveTech => ({
	researched: [...(saved?.researched ?? [])]
});

const treeOn = (core: SimCore): boolean => ruleOf(core, SCIENCE_RULES.techTree) === true;

/** `research` (ADR 0154 point 2). */
export function research(core: SimCore, id: string): CommandResult {
	if (!treeOn(core)) return { ok: false, reason: 'this world has no tech tree' };
	const node = core.registries.techNodes.get(id);
	if (!node) return { ok: false, reason: `unknown tech node "${id}"` };
	const nodes = new Map(core.registries.techNodes.list().map((n) => [n.id, n]));
	const problem = researchProblem(
		node,
		nodes,
		core.tech.researched,
		core.milestones.records.map((r) => r.id),
		core.economy.balances.science
	);
	if (problem) return { ok: false, reason: problem };
	if (node.cost > 0) record(core, 'science', -node.cost, 'tech.research', node.id);
	core.tech.researched.push(node.id);
	return { ok: true };
}

/** Why `design` cannot launch with the tree on, or undefined (ADR 0154 point 4). */
export function lockRefusal(core: SimCore, design: VesselDesign): string | undefined {
	if (!treeOn(core)) return undefined;
	const nodeOf = nodeOfParts(core.registries.techNodes.list(), core.registries.parts.list());
	const locked = lockedParts(
		design.parts.map((p) => p.part),
		nodeOf,
		core.tech.researched
	);
	if (locked.length === 0) return undefined;
	const { part, node } = locked[0]!;
	const title = core.registries.parts.get(part)?.title ?? part;
	return `"${title}" is locked: research "${node.label}" first`;
}

export const saveTech = (core: SimCore): SaveTech | undefined =>
	core.tech.researched.length > 0 ? freshTech(core.tech) : undefined;

export function techSnapshot(core: SimCore): Snapshot['tech'] {
	const enabled = treeOn(core);
	if (!enabled && core.tech.researched.length === 0) return undefined;
	return { enabled, researched: [...core.tech.researched] };
}
