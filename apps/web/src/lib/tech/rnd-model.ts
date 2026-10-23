/**
 * The R&D screen's model (plan 105, ADR 0154 point 5): the world's tech nodes in tier columns,
 * each Unlocked, Can research, or Locked with the reason the sim would give.
 */
import {
	isResearched,
	researchProblem,
	type TechBodies,
	type Snapshot,
	type TechNodeDefinition
} from '@orbital/core';

export type NodeState = 'unlocked' | 'available' | 'locked';

export interface NodeView {
	id: string;
	label: string;
	cost: number;
	state: NodeState;
	/** Why it cannot be researched now (Locked only). */
	reason: string | null;
	/** Titles of the parts it unlocks. */
	unlocks: string[];
	description: string;
}

export interface TierColumn {
	tier: number;
	nodes: NodeView[];
}

/** Tier columns from the world's snapshot (no snapshot yet: nothing researched, no science). */
export function techColumns(
	nodes: readonly TechNodeDefinition[],
	snapshot: Pick<Snapshot, 'tech' | 'milestones' | 'economy'> | null,
	partTitle: (id: string) => string,
	bodies?: TechBodies
): TierColumn[] {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const researched = snapshot?.tech?.researched ?? [];
	const milestones = (snapshot?.milestones ?? []).map((m) => m.id);
	const science = snapshot?.economy?.science ?? 0;
	const tiers = new Map<number, NodeView[]>();
	for (const n of [...nodes].sort((a, b) => a.cost - b.cost || a.label.localeCompare(b.label))) {
		const done = isResearched(n, researched);
		const reason = done ? undefined : researchProblem(n, byId, researched, milestones, science, bodies);
		const view: NodeView = {
			id: n.id,
			label: n.label,
			cost: n.cost,
			state: done ? 'unlocked' : reason === undefined ? 'available' : 'locked',
			reason: reason ?? null,
			unlocks: (n.unlocks ?? []).map(partTitle),
			description: n.description ?? ''
		};
		tiers.set(n.tier, [...(tiers.get(n.tier) ?? []), view]);
	}
	return [...tiers.entries()]
		.sort(([a], [b]) => a - b)
		.map(([tier, list]) => ({ tier, nodes: list }));
}

export const STATE_LABEL: Record<NodeState, string> = {
	unlocked: 'Unlocked',
	available: 'Can research',
	locked: 'Locked'
};
