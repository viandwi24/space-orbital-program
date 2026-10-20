/**
 * Power for control (plan 208, ADR 0214): the sim notices when a vessel's control sources run out
 * of the power they need and says so once, with `vessel:power-depleted`, for the host's notices.
 */
import type { EntityId } from '@orbital/core';
import { stopWarp } from './warp-stop.ts';
import { controlProblem, moduleDefOf, partOf, vesselOf, type SimCore } from './core.ts';

/** Vessels last seen out of power, per sim: the event fires on the change only. */
const depleted = new WeakMap<SimCore, Set<EntityId>>();

/** Whether any control source of the vessel needs a resource (a probe core). */
function needsPower(core: SimCore, vesselId: EntityId): boolean {
	return vesselOf(core, vesselId).parts.some((id) =>
		partOf(core, id).modules.some((m) => moduleDefOf(core, m.id).needs?.(m.config) !== undefined)
	);
}

/** After a vessel's hooks ran: emit `vessel:power-depleted` when it has just run out of power. */
export function notePower(core: SimCore, vesselId: EntityId): void {
	let set = depleted.get(core);
	if (!set) depleted.set(core, (set = new Set()));
	if (!needsPower(core, vesselId)) {
		set.delete(vesselId);
		return;
	}
	const out = controlProblem(core, vesselOf(core, vesselId)) === 'no-power';
	if (out && !set.has(vesselId)) {
		set.add(vesselId);
		core.events.emit('vessel:power-depleted', { vessel: vesselId, time: core.t });
		if (vesselOf(core, vesselId).owner === undefined) stopWarp(core, 'a vessel is out of power');
	} else if (!out) set.delete(vesselId);
}
