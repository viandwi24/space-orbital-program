/**
 * Warnings and errors shown in the VAB before launch (ADR 0029). Errors block Launch; warnings ask
 * for a confirmation. Pure: the page passes the readouts it already computed.
 */
import {
	effectiveDef,
	nodeSize,
	nodeSizesMatch,
	resolveVesselDesign,
	type PartLookup
} from '@orbital/core';
import { stagingModelFromDesign, type ContentLookups } from '../delta-v';
import { partsOffParent } from './bounds';
import { groupActions } from './groups';
import { isAutoStaged } from './staging';
import type { EditorState } from './state';
import type { Stability } from './stability';
import type { DesignStats } from './stats';
import type { PartsLimit } from '../capacity';

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
	| 'loose'
	| 'locked'
	| 'over-capacity'
	| 'size-mismatch'
	| 'off-parent'
	| 'no-crew'
	| 'no-antenna'
	| 'no-parachute'
	| 'robotics'
	| 'legacy-part';

/** The stock group parachutes put their deploy switch in: how the report knows a part is one. */
export const PARACHUTE_GROUP = 'stock.parachutes';

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

/** Robotic joints (plan 306, ADR 0269 point 6): most in series from the root, most per vessel. */
export const MAX_JOINTS_IN_SERIES = 4;
export const MAX_JOINTS = 16;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function checkDesign(
	state: Pick<EditorState, 'design' | 'loose'>,
	content: ContentLookups,
	stats: Pick<DesignStats, 'liftoffTwr'>,
	stability?: Pick<Stability, 'state' | 'margin' | 'fins'>,
	/** Parts the world's tech tree locks (plan 105, ADR 0154 point 4). */
	locks: readonly { parts: number[]; title: string; node: string }[] = [],
	/** The Hangar's part limit where the world's limits apply (plan 096, ADR 0123 point 4). */
	partsLimit?: PartsLimit | null,
	/**
	 * Crew seated in the design (plan 218), or null where the world has no roster: then a pod
	 * counts as a control source and the crew checks are off.
	 */
	crew: readonly { member: string; part: number }[] | null = null
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
	if (partsLimit && design.parts.length > partsLimit.limit) {
		out.push({
			id: 'over-capacity',
			severity: 'error',
			level: 'no-go',
			text: `${design.parts.length} parts: the Hangar takes ${partsLimit.limit}.`,
			hint: partsLimit.upgrade
				? `Upgrade in the Space Center: ${partsLimit.upgrade}.`
				: 'No building level takes this many parts: remove some.',
			parts: []
		});
	}
	// a hidden stack part from before plan 280 that has a surface-mounted successor (ADR 0259)
	const legacy = design.parts.flatMap((p) => {
		const catalog = content.parts.get(p.part)?.catalog;
		return catalog?.hidden && catalog.replacedBy
			? [{ index: p.index, id: p.part, to: catalog.replacedBy }]
			: [];
	});
	if (legacy.length > 0) {
		const named = [...new Map(legacy.map((l) => [l.id, l])).values()].map((l) => {
			const from = content.parts.get(l.id)?.title ?? l.id;
			const to = content.parts.get(l.to)?.title ?? l.to;
			return `${from} (use ${to})`;
		});
		out.push({
			id: 'legacy-part',
			severity: 'warning',
			level: 'caution',
			text: `${plural(legacy.length, 'part is', 'parts are')} an older version no longer in the catalogue: ${named.join(', ')}.`,
			hint: 'It still flies. Replace it with the surface-mounted part from the catalogue.',
			parts: legacy.map((l) => l.index)
		});
	}
	const model = stagingModelFromDesign(design, content);
	const parts = [...model.parts.values()];
	const seatsOf = (p: (typeof parts)[number]): number => p.def.crewCapacity ?? 0;
	const seated = new Set((crew ?? []).map((c) => c.part));
	// a pod steers only with someone in it (ADR 0109 point 1) where the world has crew to seat
	const steers = (p: (typeof parts)[number]): boolean =>
		p.controlSource && (crew === null || seatsOf(p) === 0 || seated.has(p.index));
	if (!parts.some(steers)) {
		out.push({
			id: 'no-control',
			severity: 'warning',
			level: 'no-go',
			text: 'No control source: nothing can steer this vessel.',
			hint:
				crew !== null && parts.some((p) => p.controlSource)
					? 'Seat crew in the pod, or add a probe core.'
					: 'Add a command pod.',
			// the part at fault is the top of the vessel, where a pod belongs (ADR 0148 point 2)
			parts: design.parts.filter((p) => p.parent === null).map((p) => p.index)
		});
	}
	const pods = parts.filter((p) => p.controlSource && seatsOf(p) > 0);
	if (crew !== null && pods.length > 0 && !pods.some((p) => seated.has(p.index))) {
		out.push({
			id: 'no-crew',
			severity: 'warning',
			level: 'caution',
			text: 'Pod without crew: nobody sits in the command pod.',
			hint: 'Seat crew in the pod below, or on the Launch screen.',
			parts: pods.map((p) => p.index)
		});
	}
	const probes = parts.filter((p) => p.controlSource && seatsOf(p) === 0);
	const crewed = crew === null ? pods.length > 0 : pods.some((p) => seated.has(p.index));
	const antennas = design.parts.some((p) =>
		(content.parts.get(p.part)?.modules ?? []).some(
			([id]) => content.modules.get(id)?.antenna !== undefined
		)
	);
	if (probes.length > 0 && !crewed && !antennas) {
		out.push({
			id: 'no-antenna',
			severity: 'warning',
			level: 'caution',
			text: 'Probe without antenna: it cannot be steered once out of range of home.',
			hint: 'Add an antenna.',
			parts: probes.map((p) => p.index)
		});
	}
	const chutes = design.parts.some((p) =>
		groupActions(design, content, p.index).some((a) => a.group === PARACHUTE_GROUP)
	);
	// only with the seating known: the old designs without a chute stay go (ADR 0225)
	if (crew !== null && pods.some((p) => seated.has(p.index)) && !chutes) {
		out.push({
			id: 'no-parachute',
			severity: 'warning',
			level: 'caution',
			text: 'Crewed vessel without a parachute: the crew cannot land safely.',
			hint: 'Put a parachute on top of the pod and stage it last.',
			parts: pods.map((p) => p.index)
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
	const liftEngines = engines.some((i) => first.has(i))
		? engines.filter((i) => first.has(i))
		: engines;
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
	const mismatched = sizeMismatches(design, content.parts as PartLookup);
	if (mismatched.length > 0) {
		const first = mismatched[0]!;
		out.push({
			id: 'size-mismatch',
			severity: 'warning',
			level: 'caution',
			text:
				mismatched.length === 1
					? `Size mismatch: a ${metres(first.child)} part sits on a ${metres(first.parent)} joint.`
					: `Size mismatch at ${mismatched.length} joints, such as a ${metres(first.child)} part on a ${metres(first.parent)} joint.`,
			hint: 'Put an adapter between the two sizes, or pick a part of the same size.',
			parts: mismatched.flatMap((m) => [m.index, m.parentIndex])
		});
	}
	// free placement (plan 279, ADR 0258 point 4): a part may float off its parent; say so before launch
	const off = design.freePlacement ? partsOffParent(design, content.parts as PartLookup) : [];
	if (off.length > 0) {
		out.push({
			id: 'off-parent',
			severity: 'warning',
			level: 'caution',
			text:
				off.length === 1
					? 'A part is not touching its parent.'
					: `${off.length} parts are not touching their parents.`,
			hint: 'Free mode lets parts float; they still fly as one rigid vessel. Move them back to look right.',
			parts: off
		});
	}
	const robotic = new Set(
		design.parts
			.filter((p) =>
				(content.parts.get(p.part)?.modules ?? []).some(
					([id]) => content.modules.get(id)?.joint !== undefined
				)
			)
			.map((p) => p.index)
	);
	if (robotic.size > 0) {
		const byIndex = new Map(design.parts.map((p) => [p.index, p]));
		const chain = (index: number): number => {
			let n = 0;
			for (let p = byIndex.get(index); p; p = p.parent ? byIndex.get(p.parent.index) : undefined)
				if (robotic.has(p.index)) n++;
			return n;
		};
		const deep = [...robotic].filter((i) => chain(i) > MAX_JOINTS_IN_SERIES);
		if (robotic.size > MAX_JOINTS || deep.length > 0) {
			out.push({
				id: 'robotics',
				severity: 'error',
				level: 'no-go',
				text:
					robotic.size > MAX_JOINTS
						? `${robotic.size} robotic parts: a vessel takes ${MAX_JOINTS}.`
						: `More than ${MAX_JOINTS_IN_SERIES} robotic parts in a row.`,
				hint: `At most ${MAX_JOINTS_IN_SERIES} hinges, servos, rotors or pistons one after another, and ${MAX_JOINTS} on a vessel.`,
				parts: robotic.size > MAX_JOINTS ? [...robotic] : deep
			});
		}
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
	// one check for every locked part (the list keys checks by id)
	if (locks.length > 0) {
		const names = locks.map((l) => `"${l.title}"`).join(', ');
		const nodes = [...new Set(locks.map((l) => `"${l.node}"`))].join(', ');
		out.unshift({
			id: 'locked',
			severity: 'error',
			level: 'no-go',
			text: `${names} ${locks.length === 1 ? 'is' : 'are'} locked in this world.`,
			hint: `Research ${nodes} in R&D, or take ${locks.length === 1 ? 'the part' : 'them'} off.`,
			parts: locks.flatMap((l) => l.parts)
		});
	}
	return out;
}

const metres = (size: number): string => `${size} m`;

/** A stack joint whose two nodes have different sizes (plan 207, ADR 0212). */
export interface SizeMismatch {
	/** Design index of the child part and of its parent. */
	index: number;
	parentIndex: number;
	/** Node sizes, m. */
	child: number;
	parent: number;
}

/** Every stack joint of `design` whose node sizes differ; radial joints have no size. */
export function sizeMismatches(
	design: Pick<EditorState['design'], 'parts'>,
	parts: PartLookup
): SizeMismatch[] {
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const out: SizeMismatch[] = [];
	for (const p of design.parts) {
		if (!p.parent) continue;
		const parent = byIndex.get(p.parent.index);
		const childDef = parts.get(p.part);
		const parentRaw = parent && parts.get(parent.part);
		const parentDef = parentRaw && effectiveDef(parentRaw, parent.settings);
		if (!childDef || !parentDef) continue;
		const child = nodeSize(childDef, p.parent.node);
		const at = nodeSize(parentDef, p.parent.parentNode);
		if (child === undefined || at === undefined || nodeSizesMatch(child, at)) continue;
		out.push({ index: p.index, parentIndex: p.parent.index, child, parent: at });
	}
	return out;
}

/** The report items the Launch screen repeats under the seats (plan 218): they change with the crew. */
export const LAUNCH_REPORT: readonly CheckId[] = [
	'no-control',
	'no-crew',
	'no-antenna',
	'no-parachute'
];

export const blocksLaunch = (checks: readonly Check[]): boolean =>
	checks.some((c) => c.severity === 'error');

export type Verdict = 'go' | 'caution' | 'no-go';

/** One word for the pre-flight panel (ADR 0148 point 1): the worst level, or go. */
export function verdictOf(checks: readonly Pick<Check, 'level'>[]): Verdict {
	if (checks.some((c) => c.level === 'no-go')) return 'no-go';
	return checks.some((c) => c.level === 'caution') ? 'caution' : 'go';
}
