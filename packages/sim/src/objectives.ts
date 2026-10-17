/**
 * Objectives in the sim (plan 098, ADR 0175): starting a contract or mission, building the
 * read-only view, evaluating after steps, ticks and the events the primitives name, rewards and
 * penalties, the snapshot and the save.
 */
import {
	currentLeaves,
	evaluateObjectives,
	leavesOf,
	type CommandResult,
	type ContractDefinition,
	type EntityId,
	type MissionDefinition,
	type ObjectiveNode,
	type ObjectiveView,
	type ObjectiveVesselView,
	type SaveActiveObjective,
	type SaveObjectives,
	type Snapshot
} from '@orbital/core';
import { length } from '@orbital/kepler';
import { bodyOfVessel } from './bodies.ts';
import { vesselIds, vesselOf, type SimCore } from './core.ts';
import { economyOn, record } from './economy.ts';
import { elementsOf, motionOf } from './orbit.ts';

export interface ObjectivesState {
	state: SaveObjectives;
	/** Instances an event they listen to marked during the current step. */
	dirty: Set<string>;
}

export const freshObjectives = (): SaveObjectives => ({ next: 1, active: [], finished: [] });

type Source = SaveActiveObjective['source'];

function definitionOf(
	core: SimCore,
	source: Source
): ContractDefinition | MissionDefinition | undefined {
	return source.kind === 'contract'
		? core.registries.contracts.get(source.id)
		: core.registries.missions.get(source.id);
}

const treeOf = (core: SimCore, inst: SaveActiveObjective): ObjectiveNode | undefined =>
	definitionOf(core, inst.source)?.objectives;

const lookup = (core: SimCore) => (id: string) => core.registries.objectives.get(id);

/** Subscribes to every event a registered primitive names (ADR 0175 point 5). Called once at createSim. */
export function listenForObjectives(core: SimCore): void {
	const names = new Set<string>();
	for (const o of core.registries.objectives.list()) {
		for (const t of o.on ?? ['step']) if (t !== 'step' && t !== 'tick') names.add(t);
	}
	for (const name of [...names].sort()) {
		core.events.on(name as never, () => {
			for (const inst of core.objectives.state.active) {
				const tree = treeOf(core, inst);
				if (
					tree &&
					currentLeaves(tree, inst.leaves, lookup(core)).some((l) =>
						(l.objective.on ?? ['step']).includes(name)
					)
				) {
					core.objectives.dirty.add(inst.id);
				}
			}
		});
	}
	core.events.on('world:tick', () => evaluateObjectivesDue(core, 'tick'));
}

function vesselView(core: SimCore, id: EntityId): ObjectiveVesselView {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const motion = motionOf(core, vessel);
	const surface = vessel.rails?.kind === 'surface';
	const landed = surface || vessel.landed;
	const orbit = surface
		? undefined
		: vessel.rails?.kind === 'elements'
			? vessel.rails.elements
			: elementsOf(body.mu, motion.r, motion.v, core.t);
	const radius = body.def.radius;
	return {
		id,
		body: body.def.id,
		mode: vessel.mode,
		landed,
		altitude: length(motion.r) - radius,
		periapsis: orbit && !landed ? orbit.a * (1 - orbit.e) - radius : null,
		apoapsis: orbit && !landed && orbit.e < 1 ? orbit.a * (1 + orbit.e) - radius : null
	};
}

/** The view of one instance (ADR 0175 points 1 and 4): its bound vessel, or every vessel. */
export function viewFor(core: SimCore, inst: Pick<SaveActiveObjective, 'vessel'>): ObjectiveView {
	const ids =
		inst.vessel === undefined
			? vesselIds(core)
			: vesselIds(core).filter((id) => id === inst.vessel);
	return { time: core.t, home: core.root.def.id, vessels: ids.map((id) => vesselView(core, id)) };
}

function pay(
	core: SimCore,
	entries: readonly { currency: 'funds' | 'science' | 'reputation'; amount: number }[] | undefined,
	cause: string,
	ref: string
): void {
	if (!entries || !economyOn(core)) return;
	for (const e of entries) record(core, e.currency, e.amount, cause, ref);
}

function finish(
	core: SimCore,
	inst: SaveActiveObjective,
	status: 'done' | 'failed',
	reason: string
): void {
	const def = definitionOf(core, inst.source);
	inst.status = status;
	inst.finishedAt = core.t;
	const s = core.objectives.state;
	s.active = s.active.filter((a) => a !== inst);
	s.finished.push(inst);
	if (status === 'done') {
		pay(core, def?.reward, inst.source.id, inst.id);
		core.events.emit('objective:completed', {
			id: inst.id,
			source: { ...inst.source },
			time: core.t
		});
	} else {
		pay(core, def && 'penalty' in def ? def.penalty : undefined, inst.source.id, inst.id);
		core.events.emit('objective:failed', {
			id: inst.id,
			source: { ...inst.source },
			time: core.t,
			reason
		});
	}
}

/**
 * Evaluates the active instances due for `trigger` (ADR 0175 point 5): those whose current leaves
 * listen to it, or that an event marked during the step. A passed deadline fails an instance.
 */
export function evaluateObjectivesDue(core: SimCore, trigger: 'step' | 'tick'): void {
	const { state, dirty } = core.objectives;
	if (state.active.length === 0) return;
	for (const inst of [...state.active]) {
		const tree = treeOf(core, inst);
		if (!tree) continue; // its plugin is not loaded: kept as it is
		if (inst.deadline !== undefined && core.t > inst.deadline) {
			finish(core, inst, 'failed', 'deadline passed');
			continue;
		}
		const due =
			dirty.has(inst.id) ||
			currentLeaves(tree, inst.leaves, lookup(core)).some((l) =>
				(l.objective.on ?? ['step']).includes(trigger)
			);
		if (!due) continue;
		const r = evaluateObjectives(tree, inst.leaves, lookup(core), viewFor(core, inst));
		inst.leaves = r.leaves;
		inst.progress = r.progress;
		if (r.status === 'done') finish(core, inst, 'done', 'completed');
		else if (r.status === 'failed') finish(core, inst, 'failed', 'an objective failed');
	}
	if (trigger === 'step') dirty.clear();
}

/** `objective-start` (ADR 0175 point 7). */
export function startObjective(
	core: SimCore,
	source: Source,
	vessel: EntityId | undefined
): CommandResult {
	const def = definitionOf(core, source);
	if (!def) return { ok: false, reason: `unknown ${source.kind} "${source.id}"` };
	if (vessel !== undefined && !vesselIds(core).includes(vessel))
		return { ok: false, reason: `unknown vessel ${vessel}` };
	const s = core.objectives.state;
	if (s.active.some((a) => a.source.kind === source.kind && a.source.id === source.id)) {
		return { ok: false, reason: `${source.kind} "${source.id}" is already active` };
	}
	const completed = new Set(s.finished.filter((f) => f.status === 'done').map((f) => f.source.id));
	const missing = (def.prerequisites ?? []).filter((p) => !completed.has(p));
	if (missing.length > 0)
		return {
			ok: false,
			reason: `needs ${missing.map((m) => `"${m}"`).join(', ')} completed first`
		};
	const deadline =
		'deadline' in def && def.deadline !== undefined ? core.t + def.deadline : undefined;
	s.active.push({
		id: `o${s.next++}`,
		source: { ...source },
		...(vessel === undefined ? {} : { vessel: Number(vessel) }),
		startedAt: core.t,
		...(deadline === undefined ? {} : { deadline }),
		status: 'active',
		progress: 0,
		leaves: {}
	});
	return { ok: true };
}

/** `Snapshot.objectives`, or undefined when nothing was ever started. */
export function objectivesSnapshot(core: SimCore): Snapshot['objectives'] {
	const s = core.objectives.state;
	if (s.active.length === 0 && s.finished.length === 0) return undefined;
	return [...s.active, ...s.finished].map((inst) => {
		const tree = treeOf(core, inst);
		return {
			id: inst.id,
			source: { ...inst.source },
			status: inst.status,
			progress: inst.progress,
			leaves: (tree ? leavesOf(tree) : []).map((l) => ({
				path: l.path,
				objective: l.objective,
				status: inst.leaves[l.path]?.status ?? 'active',
				progress: inst.leaves[l.path]?.progress ?? 0
			}))
		};
	});
}
