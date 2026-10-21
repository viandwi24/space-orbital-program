/**
 * Vessel programs (plan 311, ADR 0272): who wins a control channel when the player and a program
 * (an engaged autopilot or a running script) both write it, and the script record that is saved
 * with the vessel.
 *
 * A `player` write to a channel overrides it: held while the value is non-zero, then for
 * `PROGRAM_RESUME_DELAY` sim seconds after it goes back to zero (throttles: after each write).
 * A program's write to an overridden channel is dropped; its other channels still apply.
 */
import {
	CONTROL_CHANNELS,
	PROGRAM_RESUME_DELAY,
	type ControlChannel,
	type EntityId
} from '@orbital/core';
import type { SimCore } from './core.ts';
import type { CommandSource } from './delay.ts';
import { VESSEL, type VesselState } from './state.ts';

/** Sources that are programs (ADR 0272 point 2). */
export const isProgramSource = (source: CommandSource): boolean =>
	source === 'script' || source === 'autopilot';

/** The vessel has an engaged autopilot (ADR 0271) or a running script. */
export function hasProgram(v: VesselState): boolean {
	return v.script !== undefined || (v as { autopilot?: unknown }).autopilot != null;
}

/** The channel is overridden by the player at the current sim time. */
export function isOverridden(core: SimCore, v: VesselState, channel: ControlChannel): boolean {
	const until = v.override?.[channel];
	return until === 'held' || (until !== undefined && until > core.t);
}

/** The channels overridden now, in `CONTROL_CHANNELS` order. */
export function overriddenChannels(core: SimCore, v: VesselState): ControlChannel[] {
	if (!v.override) return [];
	return CONTROL_CHANNELS.filter((c) => isOverridden(core, v, c));
}

/**
 * Record a player write to `values`' channels. `latched` channels (throttles) override for the
 * resume delay after each write; the others are held while non-zero. Nothing is kept on a vessel
 * without a program. Emits `program:override` when the overridden set grows from empty.
 */
export function notePlayerWrite(
	core: SimCore,
	vessel: EntityId,
	v: VesselState,
	values: Partial<Record<ControlChannel, number>>,
	latched = false
): void {
	if (!hasProgram(v)) return;
	const before = overriddenChannels(core, v).length;
	const map = (v.override ??= {});
	for (const [channel, value] of Object.entries(values) as Array<[ControlChannel, number]>) {
		if (latched) map[channel] = core.t + PROGRAM_RESUME_DELAY;
		else if (value !== 0) map[channel] = 'held';
		else if (map[channel] !== undefined) map[channel] = core.t + PROGRAM_RESUME_DELAY;
	}
	const now = overriddenChannels(core, v);
	if (now.length === 0 && Object.keys(map).length === 0) delete v.override;
	if (before === 0 && now.length > 0) {
		core.events.emit('program:override', { vessel, channels: now });
	}
}

/**
 * Once per frame: drop expired overrides, emit `program:resumed` when a vessel's set empties, and
 * forget overrides on vessels whose programs ended.
 */
export function stepOverrides(core: SimCore): void {
	for (const id of core.world.query([VESSEL])) {
		const v = core.world.get(id, VESSEL)!;
		if (!v.override) continue;
		if (!hasProgram(v)) {
			delete v.override;
			continue;
		}
		for (const channel of Object.keys(v.override) as ControlChannel[]) {
			const until = v.override[channel];
			if (until !== 'held' && (until === undefined || until <= core.t)) delete v.override[channel];
		}
		if (Object.keys(v.override).length === 0) {
			delete v.override;
			core.events.emit('program:resumed', { vessel: id });
		}
	}
}

/** End the vessel's script, if any, with `reason`; forgets overrides when no program is left. */
export function detachScript(core: SimCore, vessel: EntityId, v: VesselState, reason: string): boolean {
	const script = v.script;
	if (!script) return false;
	delete v.script;
	if (!hasProgram(v)) delete v.override;
	core.events.emit('script:detached', { vessel, name: script.name, reason });
	return true;
}

/**
 * Disengage the vessel's autopilot (ADR 0271) for `program-stop`: the autopilot record goes, with
 * the RCS translation it left (ADR 0271 point 5). Plan 310's runner owns the `autopilot:ended`
 * event; once it lands this calls its disengage instead (plan 311 log).
 */
export function stopAutopilot(_core: SimCore, _vessel: EntityId, v: VesselState): void {
	const record = v as { autopilot?: unknown };
	if (record.autopilot == null) return;
	delete record.autopilot;
	delete v.translate;
}

/** The scripts saved on vessels, for the host to restart when a world opens (ADR 0272 point 6). */
export function savedScripts(core: SimCore): Array<{
	vessel: EntityId;
	name: string;
	source: string;
	memory: Record<string, unknown>;
}> {
	const out = [];
	for (const id of core.world.query([VESSEL])) {
		const s = core.world.get(id, VESSEL)!.script;
		if (s) out.push({ vessel: id, name: s.name, source: s.source, memory: JSON.parse(JSON.stringify(s.memory)) });
	}
	return out;
}
