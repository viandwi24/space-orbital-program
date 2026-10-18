/**
 * The tech tree (plan 105, ADRs 0099 and 0154): nodes that cost science, in tiers gated by
 * milestones, and which parts stay locked until their node is researched. Pure.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';

export interface TechNodeDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	tier: number;
	/** Science to research it. */
	cost: number;
	/** Nodes researched first. */
	requires?: string[];
	/** A milestone the world must have recorded (`orbit:stock.home`, ADR 0147). */
	milestone?: string;
	/** Parts it unlocks (a part can also name its node with `techNode`). */
	unlocks?: string[];
	description?: string;
}

const id = z
	.string()
	.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case');

export const techNodeDefinitionSchema = z.object({
	id,
	label: z.string().min(1),
	tier: z.int().min(0).max(20),
	cost: z.number().finite().min(0),
	requires: z.array(id).optional(),
	milestone: z.string().min(1).optional(),
	unlocks: z.array(id).optional(),
	description: z.string().optional()
});

/** `SimSave.tech` (optional in format 5, ADR 0154 point 3). */
export interface SaveTech {
	researched: string[];
}
export const saveTechSchema = z.object({ researched: z.array(id) });

/** A node of cost 0 with no requirement and no milestone counts as researched (the basics). */
export const isFreeNode = (
	n: Pick<TechNodeDefinition, 'cost' | 'requires' | 'milestone'>
): boolean => n.cost === 0 && (n.requires?.length ?? 0) === 0 && n.milestone === undefined;

export const isResearched = (
	n: Pick<TechNodeDefinition, 'id' | 'cost' | 'requires' | 'milestone'>,
	researched: ReadonlySet<string> | readonly string[]
): boolean =>
	isFreeNode(n) ||
	(Array.isArray(researched)
		? researched.includes(n.id)
		: (researched as ReadonlySet<string>).has(n.id));

/**
 * Part id to the nodes that unlock it, for every part some node names (`unlocks` or the part's
 * `techNode`), lowest tier first.
 */
export function nodeOfParts(
	nodes: readonly TechNodeDefinition[],
	parts: readonly { id: string; techNode?: string | undefined }[]
): Map<string, TechNodeDefinition[]> {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const sorted = [...nodes].sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));
	const out = new Map<string, TechNodeDefinition[]>();
	const add = (part: string, n: TechNodeDefinition) => {
		const list = out.get(part) ?? [];
		if (!list.includes(n)) list.push(n);
		out.set(part, list);
	};
	for (const n of sorted) for (const p of n.unlocks ?? []) add(p, n);
	for (const p of parts) {
		const n = p.techNode ? byId.get(p.techNode) : undefined;
		if (n) add(p.id, n);
	}
	return out;
}

/**
 * The locked parts among `partIds` (ADR 0154 point 1): a part is open when any node that unlocks
 * it is researched; a locked part names its lowest-tier node.
 */
export function lockedParts(
	partIds: readonly string[],
	nodeOf: ReadonlyMap<string, readonly TechNodeDefinition[]>,
	researched: readonly string[]
): { part: string; node: TechNodeDefinition }[] {
	const out: { part: string; node: TechNodeDefinition }[] = [];
	const seen = new Set<string>();
	for (const part of partIds) {
		if (seen.has(part)) continue;
		seen.add(part);
		const nodes = nodeOf.get(part);
		if (nodes && nodes.length > 0 && !nodes.some((n) => isResearched(n, researched)))
			out.push({ part, node: nodes[0]! });
	}
	return out;
}

/** Why `node` cannot be researched now, or undefined (ADR 0154 point 2). */
export function researchProblem(
	node: TechNodeDefinition,
	nodes: ReadonlyMap<string, TechNodeDefinition>,
	researched: readonly string[],
	milestones: readonly string[],
	science: number
): string | undefined {
	if (isResearched(node, researched)) return `"${node.label}" is already researched`;
	const missing = (node.requires ?? []).filter((r) => {
		const n = nodes.get(r);
		return !n || !isResearched(n, researched);
	});
	if (missing.length > 0)
		return `research ${missing.map((m) => `"${nodes.get(m)?.label ?? m}"`).join(', ')} first`;
	if (node.milestone !== undefined && !milestones.includes(node.milestone))
		return `needs the milestone "${node.milestone}"`;
	if (science < node.cost)
		return `needs ${node.cost} science, the world has ${Math.floor(science)}`;
	return undefined;
}
