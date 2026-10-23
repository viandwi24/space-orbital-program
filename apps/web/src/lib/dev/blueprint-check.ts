/**
 * The Blueprints tab's checks (plan 375): every blueprint the game offers, built against the loaded
 * plugins and checked as the Hangar would. A report has:
 * - the parts the loaded content lacks;
 * - attach links whose two node sizes differ;
 * - the Hangar's pre-flight checks;
 * - the numbers.
 * Pure: the page draws the result.
 */
import {
	nodeSize,
	nodeSizesMatch,
	type LoadReport,
	type PartDefinition,
	type VesselDesign
} from '@orbital/core';
import type { ContentLookups } from '../delta-v';
import { blueprintStats, type BlueprintCard, type BlueprintStats } from '../editor/blueprints';
import { checkDesign, type Check } from '../editor/checks';
import { stabilityOf } from '../editor/stability';
import type { Content } from '../editor/state';
import { designStats } from '../editor/stats';

export interface SizeMismatch {
	/** The child: design index, part id, node and its size, m. */
	part: number;
	partId: string;
	node: string;
	size: number;
	/** The parent it hangs on. */
	parent: number;
	parentId: string;
	parentNode: string;
	parentSize: number;
}

export interface BlueprintReport {
	id: string;
	title: string;
	origin: BlueprintCard['origin'];
	/** Who provides it: a plugin id, or `game` for the cards built into the web app (ADR 0311). */
	by: string;
	goal: BlueprintCard['goal'];
	crew: number;
	/** Part ids the design names that no loaded plugin registers. */
	missing: string[];
	sizes: SizeMismatch[];
	/** The Hangar's pre-flight checks (errors and warnings). */
	checks: Check[];
	stats: BlueprintStats | null;
	/** The build threw (a learn or mission card builds through editor operations). */
	buildError?: string;
	verdict: 'ok' | 'warnings' | 'errors';
}

/** Attach links whose node sizes do not match (radial and surface links have no size to compare). */
export function sizeMismatches(
	design: VesselDesign,
	defOf: (id: string) => PartDefinition | undefined
): SizeMismatch[] {
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const out: SizeMismatch[] = [];
	for (const p of design.parts) {
		const link = p.parent;
		if (!link || link.parentNode === 'surface') continue;
		const parent = byIndex.get(link.index);
		const def = defOf(p.part);
		const parentDef = parent && defOf(parent.part);
		if (!parent || !def || !parentDef) continue;
		const size = nodeSize(def, link.node);
		const parentSize = nodeSize(parentDef, link.parentNode);
		if (size === undefined || parentSize === undefined || nodeSizesMatch(size, parentSize)) continue;
		out.push({
			part: p.index,
			partId: p.part,
			node: link.node,
			size,
			parent: parent.index,
			parentId: parent.part,
			parentNode: link.parentNode,
			parentSize
		});
	}
	return out;
}

export interface CheckInput {
	/** What a card builds with (the editor's lookups). */
	editor: Content;
	lookups: ContentLookups;
	/** Surface gravity of the home body, m/s². */
	gravity: number;
	/** Blueprint id → registering plugin, from `report.registered.blueprint`. */
	by: ReadonlyMap<string, string>;
}

export function checkBlueprint(card: BlueprintCard, input: CheckInput): BlueprintReport {
	const base = {
		id: card.id,
		title: card.title,
		origin: card.origin,
		by: input.by.get(card.id) ?? 'game',
		goal: card.goal,
		crew: card.crew
	};
	let design: VesselDesign;
	try {
		design = card.build(input.editor);
	} catch (e) {
		return {
			...base,
			missing: [],
			sizes: [],
			checks: [],
			stats: null,
			buildError: e instanceof Error ? e.message : String(e),
			verdict: 'errors'
		};
	}
	const defOf = (id: string): PartDefinition | undefined => input.lookups.parts.get(id);
	const missing = [...new Set(design.parts.map((p) => p.part as string).filter((id) => !defOf(id)))];
	if (missing.length > 0) {
		return { ...base, missing, sizes: [], checks: [], stats: null, verdict: 'errors' };
	}
	const sizes = sizeMismatches(design, defOf);
	let checks: Check[] = [];
	let stats: BlueprintStats | null = null;
	try {
		const sea = designStats(design, input.lookups, 'sea-level', input.gravity);
		checks = checkDesign(
			{ design, loose: [] },
			input.lookups,
			sea,
			stabilityOf(design, input.lookups),
			[],
			null,
			null
		);
		stats = blueprintStats(design, input.lookups, input.gravity);
	} catch (e) {
		return {
			...base,
			missing,
			sizes,
			checks,
			stats,
			buildError: e instanceof Error ? e.message : String(e),
			verdict: 'errors'
		};
	}
	const errors = checks.some((c) => c.severity === 'error');
	const warnings = sizes.length > 0 || checks.some((c) => c.severity === 'warning');
	return {
		...base,
		missing,
		sizes,
		checks,
		stats,
		verdict: errors ? 'errors' : warnings ? 'warnings' : 'ok'
	};
}

/** Blueprint id → registering plugin. */
export const blueprintOwners = (report: LoadReport): Map<string, string> =>
	new Map((report.registered.blueprint ?? []).map((e) => [e.id, e.by]));
