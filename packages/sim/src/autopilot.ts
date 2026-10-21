/**
 * Autopilots (plan 310, ADR 0271): a mod's `AutopilotDefinition` flies one vessel. The sim steps an
 * engaged autopilot at its rate on sim time, before the step's physics, with a `VesselPilot` built
 * from fresh snapshots of the vessel and its target vessel. Every control call is a command
 * through `dispatch`, the handler the keys and scripts use, sent as a flight computer's (`script`:
 * the signal-delay rule treats it like a script). A throwing autopilot ends as `aborted`.
 */
import {
	AUTOPILOT_RATE,
	createVesselPilot,
	type AutopilotDefinition,
	type AutopilotOutcome,
	type AutopilotSnapshot,
	type Command,
	type CommandResult,
	type EntityId,
	type VesselPilot
} from '@orbital/core';
import { dispatch } from './commands.ts';
import { isControlled, vesselIds, vesselOf, type SimCore } from './core.ts';
import { vesselSnapshot } from './snapshot.ts';
import { VESSEL, type VesselState } from './state.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const definitionOf = (core: SimCore, id: string): AutopilotDefinition | undefined =>
	core.registries.autopilots.get(id);

/** A pilot for `vesselId` over snapshots of it and its target vessel; commands for other vessels are dropped. */
function pilotFor(core: SimCore, vesselId: EntityId): VesselPilot {
	const own = vesselSnapshot(core, vesselId);
	const vessels = [own];
	const t = own.target;
	if (t?.kind === 'vessel' && core.world.hasEntity(t.id) && core.world.has(t.id, VESSEL))
		vessels.push(vesselSnapshot(core, t.id));
	const send = (command: Command): CommandResult =>
		'vessel' in command && command.vessel === vesselId
			? dispatch(core, command, 'script')
			: refuse('an autopilot commands its own vessel only');
	return createVesselPilot({ t: core.t, vessels }, vesselId, send);
}

/** Plain JSON copy of an autopilot's memory (it is saved with the vessel). */
const plain = (memory: unknown): unknown =>
	memory === undefined ? null : (JSON.parse(JSON.stringify(memory)) as unknown);

/** `autopilot-engage`: refused for an unknown autopilot, or with the message `start` threw. */
export function engageAutopilot(
	core: SimCore,
	vesselId: EntityId,
	vessel: VesselState,
	id: string,
	params: unknown
): CommandResult {
	const def = definitionOf(core, id);
	if (!def) {
		const known = core.registries.autopilots.list().map((d) => `"${d.id}"`);
		return refuse(
			`unknown autopilot "${id}"${known.length ? `; this world has ${known.join(', ')}` : ''}`
		);
	}
	if (vessel.autopilot) endAutopilot(core, vesselId, 'disengaged', `replaced by ${def.title}`);
	let memory: unknown;
	try {
		memory = plain(def.start(pilotFor(core, vesselId), params));
	} catch (e) {
		return refuse(message(e));
	}
	const period = 1 / (def.rate ?? AUTOPILOT_RATE);
	vessel.autopilot = {
		id,
		memory,
		last: core.t - period, // the first step runs with the next tick
		phase: 'engaged',
		status: '',
		readouts: {}
	};
	core.active.add(vesselId);
	return { ok: true };
}

/** End the vessel's autopilot: clears the RCS translation it left and emits `autopilot:ended`. */
export function endAutopilot(
	core: SimCore,
	vesselId: EntityId,
	outcome: AutopilotOutcome,
	reason: string
): void {
	if (!core.world.hasEntity(vesselId) || !core.world.has(vesselId, VESSEL)) return;
	const vessel = vesselOf(core, vesselId);
	const a = vessel.autopilot;
	if (!a) return;
	delete vessel.autopilot;
	delete vessel.translate;
	core.events.emit('autopilot:ended', { vessel: vesselId, autopilot: a.id, outcome, reason });
}

/** Readouts kept: finite numbers and short strings. */
function readoutsOf(raw: unknown): Record<string, number | string> {
	const out: Record<string, number | string> = {};
	if (!raw || typeof raw !== 'object') return out;
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
		else if (typeof v === 'string') out[k] = v.slice(0, 80);
	}
	return out;
}

/** Step every engaged autopilot that is due (once per tick, before the physics). */
export function runAutopilots(core: SimCore): void {
	for (const id of vesselIds(core)) {
		if (!core.world.hasEntity(id)) continue;
		const vessel = vesselOf(core, id);
		const a = vessel.autopilot;
		if (!a) continue;
		const def = definitionOf(core, a.id);
		if (!def) {
			endAutopilot(core, id, 'aborted', `autopilot "${a.id}" is not loaded`);
			continue;
		}
		const period = 1 / (def.rate ?? AUTOPILOT_RATE);
		if (core.t + 1e-9 < a.last + period) continue;
		if (!isControlled(core, vessel)) {
			endAutopilot(core, id, 'aborted', 'the vessel lost control');
			continue;
		}
		const dt = core.t - a.last;
		a.last = core.t;
		let result;
		try {
			result = def.step(pilotFor(core, id), a.memory, dt);
		} catch (e) {
			endAutopilot(core, id, 'aborted', `${def.title} failed: ${message(e)}`);
			continue;
		}
		// a command may have changed the vessel (a stage split, a docking)
		if (!core.world.hasEntity(id) || vesselOf(core, id).autopilot !== a) continue;
		a.phase = String(result?.phase ?? a.phase);
		a.status = String(result?.status ?? '');
		a.readouts = readoutsOf(result?.readouts);
		core.active.add(id);
		if (result?.abort) endAutopilot(core, id, 'aborted', String(result.abort));
		else if (result?.done) endAutopilot(core, id, 'done', a.status || 'done');
	}
}

/** The snapshot's view of a vessel's autopilot, or undefined. */
export function autopilotSnapshot(
	core: SimCore,
	vessel: VesselState
): AutopilotSnapshot | undefined {
	const a = vessel.autopilot;
	if (!a) return undefined;
	return {
		id: a.id,
		title: definitionOf(core, a.id)?.title ?? a.id,
		phase: a.phase,
		status: a.status,
		readouts: { ...a.readouts }
	};
}
