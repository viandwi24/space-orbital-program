/**
 * Warnings and errors shown in the VAB before launch (ADR 0029). Errors block Launch; warnings ask
 * for a confirmation. Pure: the page passes the readouts it already computed.
 */
import { resolveVesselDesign, type PartLookup } from '@orbital/core';
import { stagingModelFromDesign, type ContentLookups } from '../delta-v';
import { isAutoStaged } from './staging';
import type { EditorState } from './state';
import type { Stability } from './stability';
import type { DesignStats } from './stats';

export type CheckId =
	| 'empty'
	| 'invalid'
	| 'no-control'
	| 'no-engine'
	| 'no-stages'
	| 'unstaged'
	| 'empty-stage'
	| 'low-twr'
	| 'marginal-twr'
	| 'unstable'
	| 'loose';

/** How bad for the flight (ADR 0148 point 1), apart from whether it blocks Launch (`severity`). */
export type CheckLevel = 'no-go' | 'caution';

export interface Check {
	id: CheckId;
	severity: 'error' | 'warning';
	level: CheckLevel;
	text: string;
	/** What the player can do about it. */
	hint: string;
	/** Design indices the check is about, for highlighting. */
	parts: number[];
}

/** Below this liftoff TWR the verdict is caution (ADR 0148 point 1). */
export const MARGINAL_TWR = 1.2;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function checkDesign(
	state: Pick<EditorState, 'design' | 'loose'>,
	content: ContentLookups,
	stats: Pick<DesignStats, 'liftoffTwr'>,
	stability?: Pick<Stability, 'state' | 'margin' | 'fins'>
): Check[] {
	const { design, loose } = state;
	if (design.parts.length === 0) {
		return [
			{
				id: 'empty',
				severity: 'error',
				level: 'no-go',
				text: 'Nothing to launch yet.',
				hint: 'Pick a command pod in the catalogue and click the highlighted spot on the platform.',
				parts: []
			}
		];
	}
	const resolved = resolveVesselDesign(design, content.parts as PartLookup);
	if (!resolved.ok) {
		return [
			{
				id: 'invalid',
				severity: 'error',
				level: 'no-go',
				text: `The design is not valid: ${resolved.errors[0] ?? 'unknown error'}`,
				hint: 'Undo the last change or detach the part that does not fit.',
				parts: []
			}
		];
	}
	const out: Check[] = [];
	const model = stagingModelFromDesign(design, content);
	const parts = [...model.parts.values()];
	if (!parts.some((p) => p.controlSource)) {
		out.push({
			id: 'no-control',
			severity: 'warning',
			level: 'no-go',
			text: 'No control source: nothing can steer this vessel.',
			hint: 'Add a command pod.',
			// the part at fault is the top of the vessel, where a pod belongs (ADR 0148 point 2)
			parts: design.parts.filter((p) => p.parent === null).map((p) => p.index)
		});
	}
	const engines = parts.filter((p) => p.engine).map((p) => p.index);
	if (engines.length === 0) {
		out.push({
			id: 'no-engine',
			severity: 'warning',
			level: 'no-go',
			text: 'No engine: the vessel cannot leave the pad.',
			hint: 'Attach an engine under a fuel tank.',
			parts: []
		});
	}
	if (design.stages.length === 0 && engines.length > 0) {
		out.push({
			id: 'no-stages',
			severity: 'warning',
			level: 'caution',
			text: 'No stages: pressing Space will do nothing.',
			hint: 'Drag the engine into a stage, or press Auto-stage.',
			parts: engines
		});
	}
	const staged = new Set(design.stages.flat());
	const unstaged = design.parts
		.filter((p) => isAutoStaged(design, content, p.index) && !staged.has(p.index))
		.map((p) => p.index);
	if (unstaged.length > 0 && design.stages.length > 0) {
		out.push({
			id: 'unstaged',
			severity: 'warning',
			level: 'caution',
			text: `${plural(unstaged.length, 'engine or decoupler is', 'engines or decouplers are')} in no stage and will never fire.`,
			hint: 'Drag it into a stage.',
			parts: unstaged
		});
	}
	const emptyAt = design.stages.flatMap((s, k) => (s.length === 0 ? [k] : []));
	if (emptyAt.length > 0) {
		out.push({
			id: 'empty-stage',
			severity: 'warning',
			level: 'caution',
			text: `Stage ${emptyAt.map((k) => k + 1).join(', ')} is empty: pressing Space there does nothing.`,
			hint: 'Remove the empty stage or move a part into it.',
			parts: []
		});
	}
	// the engines of the first stage to fire, else every engine
	const first = new Set(design.stages[0] ?? []);
	const liftEngines = engines.some((i) => first.has(i)) ? engines.filter((i) => first.has(i)) : engines;
	if (stats.liftoffTwr !== null && stats.liftoffTwr < 1) {
		out.push({
			id: 'low-twr',
			severity: 'warning',
			level: 'no-go',
			text: `Thrust-to-weight at liftoff is ${stats.liftoffTwr.toFixed(2)}: the vessel will not leave the pad.`,
			hint: 'Add engines or remove mass above the first stage.',
			parts: liftEngines
		});
	} else if (stats.liftoffTwr !== null && stats.liftoffTwr < MARGINAL_TWR) {
		out.push({
			id: 'marginal-twr',
			severity: 'warning',
			level: 'caution',
			text: `Thrust-to-weight at liftoff is ${stats.liftoffTwr.toFixed(2)}: the climb will be slow and costly.`,
			hint: `Aim for ${MARGINAL_TWR} or more: more thrust in the first stage, or less mass.`,
			parts: liftEngines
		});
	}
	if (stability?.state === 'unstable') {
		out.push({
			id: 'unstable',
			severity: 'warning',
			level: 'caution',
			text: `The fins or wings sit ahead of the centre of mass (margin ${(stability.margin ?? 0).toFixed(1)} calibres): the vessel will tumble in the air.`,
			hint: 'Move the fins or the tail lower on the vessel, or add more behind the centre of mass.',
			parts: design.parts
				.filter((p) =>
					content.parts
						.get(p.part)
						?.modules?.some(
							(m) =>
								m[0] === 'stock.fin' || m[0] === 'stock.control-surface' || m[0] === 'stock.wing'
						)
				)
				.map((p) => p.index)
		});
	}
	if (loose.length > 0) {
		const n = loose.reduce((m, a) => m + a.parts.length, 0);
		out.push({
			id: 'loose',
			severity: 'warning',
			level: 'caution',
			text: `${plural(n, 'part is', 'parts are')} not attached and will stay behind.`,
			hint: 'Pick them up and attach them, or delete them.',
			parts: loose.flatMap((a) => a.parts.map((p) => p.index))
		});
	}
	return out;
}

export const blocksLaunch = (checks: readonly Check[]): boolean =>
	checks.some((c) => c.severity === 'error');

export type Verdict = 'go' | 'caution' | 'no-go';

/** One word for the pre-flight panel (ADR 0148 point 1): the worst level, or go. */
export function verdictOf(checks: readonly Pick<Check, 'level'>[]): Verdict {
	if (checks.some((c) => c.level === 'no-go')) return 'no-go';
	return checks.some((c) => c.level === 'caution') ? 'caution' : 'go';
}
