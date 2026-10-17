/**
 * Objectives (plan 098, ADRs 0098 and 0175): deterministic primitives, trees of them, and the
 * contract and mission data built on them. The evaluator here is pure; the sim builds the view and
 * decides when to call it. Environment-neutral.
 */
import * as z from 'zod';
import { CURRENCIES, type Currency } from './economy.ts';
import { definitionIdSchema } from './schemas.ts';

export type ObjectiveStatus = 'active' | 'done' | 'failed';

/** What a primitive returns, and what is kept per leaf between evaluations. */
export interface ObjectiveResult {
	status: ObjectiveStatus;
	/** 0..1. */
	progress: number;
	/** The primitive's own memory (plain data), handed back as `prior.data`. */
	data?: Record<string, boolean | number | string>;
}

/** A vessel as objectives see it (ADR 0175 point 1). */
export interface ObjectiveVesselView {
	id: number;
	/** Body whose sphere the vessel is in. */
	body: string;
	mode: 'flight' | 'on-rails';
	landed: boolean;
	/** Height above the body's radius, m. */
	altitude: number;
	/** Periapsis and apoapsis altitudes, m; null without a closed orbit (or on the ground). */
	periapsis: number | null;
	apoapsis: number | null;
}

export interface ObjectiveView {
	/** Sim time, s. */
	time: number;
	/** Id of the home (root) body. */
	home: string;
	vessels: readonly ObjectiveVesselView[];
}

/** What a primitive listens to (ADR 0175 point 5): every step, every world tick, or events. */
export type ObjectiveTrigger = 'step' | 'tick' | (string & {});

export interface ObjectiveDefinition<P = unknown> {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	params: z.ZodType<P>;
	/** Default `['step']`. */
	on?: readonly ObjectiveTrigger[];
	/** Re-evaluated every time and fails its tree when it fails (ADR 0175 point 2); otherwise sticky once done. */
	constraint?: boolean;
	evaluate(params: P, view: ObjectiveView, prior: ObjectiveResult | undefined): ObjectiveResult;
}

export type ObjectiveNode =
	| { objective: string; params?: unknown }
	| { all: ObjectiveNode[] }
	| { any: ObjectiveNode[] }
	| { sequence: ObjectiveNode[] };

export interface RewardEntry {
	currency: Currency;
	amount: number;
}

export interface ContractDefinition {
	id: string;
	title: string;
	objectives: ObjectiveNode;
	reward?: RewardEntry[];
	penalty?: RewardEntry[];
	/** Seconds after the start; failed when it passes unfinished. */
	deadline?: number;
	/** Contract or mission ids that must have completed first. */
	prerequisites?: string[];
}

export interface MissionDefinition {
	id: string;
	title: string;
	objectives: ObjectiveNode;
	reward?: RewardEntry[];
	prerequisites?: string[];
}

const finite = z.number().refine(Number.isFinite, 'must be finite');

export const objectiveNodeSchema: z.ZodType<ObjectiveNode> = z.lazy(() =>
	z.union([
		z.object({ objective: definitionIdSchema, params: z.unknown().optional() }),
		z.object({ all: z.array(objectiveNodeSchema).min(1) }),
		z.object({ any: z.array(objectiveNodeSchema).min(1) }),
		z.object({ sequence: z.array(objectiveNodeSchema).min(1) })
	])
);

const rewardSchema = z.array(z.object({ currency: z.enum(CURRENCIES), amount: finite }));

export const contractDefinitionSchema = z.object({
	id: definitionIdSchema,
	title: z.string().min(1),
	objectives: objectiveNodeSchema,
	reward: rewardSchema.optional(),
	penalty: rewardSchema.optional(),
	deadline: finite.refine((d) => d > 0, 'deadline must be positive').optional(),
	prerequisites: z.array(definitionIdSchema).optional()
});

export const missionDefinitionSchema = z.object({
	id: definitionIdSchema,
	title: z.string().min(1),
	objectives: objectiveNodeSchema,
	reward: rewardSchema.optional(),
	prerequisites: z.array(definitionIdSchema).optional()
});

export const objectiveDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	params: z.custom<z.ZodType>((v) => v instanceof z.ZodType, 'params must be a zod schema'),
	on: z.array(z.string().min(1)).min(1).optional(),
	constraint: z.boolean().optional(),
	evaluate: z.custom<(...a: never[]) => unknown>(
		(v) => typeof v === 'function',
		'evaluate must be a function'
	)
});

/** Leaf results of one active objective, by tree path (`"0"`, `"0.1"`, ...). */
export type LeafResults = Record<string, ObjectiveResult>;

export type ObjectiveLookup = (id: string) => ObjectiveDefinition | undefined;

const children = (node: ObjectiveNode): ObjectiveNode[] | undefined =>
	'all' in node
		? node.all
		: 'any' in node
			? node.any
			: 'sequence' in node
				? node.sequence
				: undefined;

/**
 * The leaves the next evaluation would run (ADR 0175 point 3): every unfinished leaf of `all` and
 * `any`, only the current step of a `sequence`, and constraint leaves always.
 */
export function currentLeaves(
	node: ObjectiveNode,
	leaves: LeafResults,
	lookup: ObjectiveLookup,
	path = '0'
): Array<{ path: string; objective: ObjectiveDefinition }> {
	if ('objective' in node) {
		const def = lookup(node.objective);
		if (!def) return [];
		const prior = leaves[path];
		return prior?.status === 'done' && !def.constraint ? [] : [{ path, objective: def }];
	}
	const list = children(node)!;
	if ('sequence' in node) {
		for (let i = 0; i < list.length; i++) {
			const p = `${path}.${i}`;
			if (nodeStatus(list[i]!, leaves, lookup, p) !== 'done')
				return currentLeaves(list[i]!, leaves, lookup, p);
		}
		return [];
	}
	return list.flatMap((c, i) => currentLeaves(c, leaves, lookup, `${path}.${i}`));
}

/** Status of a node from the stored leaf results, without evaluating anything. */
export function nodeStatus(
	node: ObjectiveNode,
	leaves: LeafResults,
	lookup: ObjectiveLookup,
	path = '0'
): ObjectiveStatus {
	return summarize(node, leaves, lookup, path).status;
}

function summarize(
	node: ObjectiveNode,
	leaves: LeafResults,
	lookup: ObjectiveLookup,
	path: string
): { status: ObjectiveStatus; progress: number } {
	if ('objective' in node) {
		const r = leaves[path];
		return r ? { status: r.status, progress: r.progress } : { status: 'active', progress: 0 };
	}
	const list = children(node)!;
	const parts = list.map((c, i) => summarize(c, leaves, lookup, `${path}.${i}`));
	if ('all' in node) {
		if (parts.some((p) => p.status === 'failed'))
			return { status: 'failed', progress: mean(parts) };
		return {
			status: parts.every((p) => p.status === 'done') ? 'done' : 'active',
			progress: mean(parts)
		};
	}
	if ('any' in node) {
		const progress = Math.max(...parts.map((p) => p.progress));
		if (parts.some((p) => p.status === 'done')) return { status: 'done', progress: 1 };
		return { status: parts.every((p) => p.status === 'failed') ? 'failed' : 'active', progress };
	}
	// sequence: the first unfinished step decides.
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i]!;
		if (p.status === 'done') continue;
		return {
			status: p.status === 'failed' ? 'failed' : 'active',
			progress: (i + p.progress) / parts.length
		};
	}
	return { status: 'done', progress: 1 };
}

const mean = (parts: Array<{ progress: number }>): number =>
	parts.reduce((s, p) => s + p.progress, 0) / parts.length;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Evaluates the current leaves of `node` against `view` and returns the new leaf results and the
 * tree's status and progress (ADR 0175 points 2 and 3). Pure: `leaves` is not changed.
 */
export function evaluateObjectives(
	node: ObjectiveNode,
	leaves: LeafResults,
	lookup: ObjectiveLookup,
	view: ObjectiveView
): { leaves: LeafResults; status: ObjectiveStatus; progress: number } {
	const next: LeafResults = { ...leaves };
	// A sequence's current step can move on within one evaluation: repeat until no new step opens.
	for (let guard = 0; guard < 64; guard++) {
		const due = currentLeaves(node, next, lookup);
		let moved = false;
		for (const { path, objective } of due) {
			const params = leafAt(node, path).params;
			const r = objective.evaluate(params as never, view, next[path]);
			const result: ObjectiveResult = {
				status: r.status,
				progress: clamp01(r.status === 'done' ? 1 : r.progress)
			};
			if (r.data !== undefined) result.data = r.data;
			const before = next[path];
			next[path] = result;
			if (result.status === 'done' && before?.status !== 'done' && !objective.constraint)
				moved = true;
		}
		if (!moved || summarize(node, next, lookup, '0').status !== 'active') break;
	}
	const { status, progress } = summarize(node, next, lookup, '0');
	return { leaves: next, status, progress };
}

/** The leaf node at `path` (`"0.2.1"`). */
export function leafAt(node: ObjectiveNode, path: string): { objective: string; params?: unknown } {
	let n: ObjectiveNode = node;
	for (const i of path.split('.').slice(1).map(Number)) n = children(n)![i]!;
	if (!('objective' in n)) throw new Error(`objective tree: no leaf at ${path}`);
	return n;
}

/** Every leaf of a tree with its path, for load-time checks. */
export function leavesOf(
	node: ObjectiveNode,
	path = '0'
): Array<{ path: string; objective: string; params?: unknown }> {
	if ('objective' in node) return [{ path, ...node }];
	return children(node)!.flatMap((c, i) => leavesOf(c, `${path}.${i}`));
}
