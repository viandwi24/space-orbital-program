/**
 * The signal-delay rule (plan 117, ADR 0101 point 4, ADR 0188 point 6): under `enforced` the
 * vessel control commands of a linked probe wait for the route's light time; under
 * `flight-computer` the script's commands do not wait, the player's do. `display` never waits.
 * Queued commands are saved and apply in `(at, seq)` order at the first step boundary at or after
 * `at`, re-checked as they apply.
 */
import { COMMS_RULES, DELAYED_COMMANDS, type Command, type EntityId } from '@orbital/core';
import { commsOn, isProbe } from './comms.ts';
import type { SimCore } from './core.ts';
import { ruleOf } from './economy.ts';

/**
 * Who sent a command: the player, the script runner (the host says so), or an autopilot the sim
 * runs (ADR 0271). `script` and `autopilot` are programs (plan 320, ADR 0276 point 2).
 */
export type CommandSource = 'player' | 'script' | 'autopilot';

/** Seconds `command` from `source` must wait, or 0 (ADR 0188 point 6). */
export function delayOf(core: SimCore, command: Command, source: CommandSource): number {
	if (!DELAYED_COMMANDS.has(command.type) || !commsOn(core)) return 0;
	const rule = ruleOf(core, COMMS_RULES.signalDelay);
	if (rule !== 'enforced' && rule !== 'flight-computer') return 0;
	if (rule === 'flight-computer' && source !== 'player') return 0;
	const vessel = (command as { vessel: EntityId }).vessel;
	if (!isProbe(core, vessel)) return 0;
	const link = core.comms.links.get(vessel);
	return link && link.to !== null && link.latency !== null ? link.latency : 0;
}

/** Queue a command to apply at `at`; a program's command keeps its source (ADR 0276 point 2). */
export function enqueue(
	core: SimCore,
	command: Command,
	at: number,
	source: CommandSource = 'player'
): void {
	const s = core.commsState;
	s.queue.push({
		at,
		seq: s.seq++,
		command: command as unknown as Record<string, unknown>,
		...(source !== 'player' ? { source } : {})
	});
	s.queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
}

/** Apply every queued command whose time has come, in order, through `apply` (no second delay). */
export function drainQueue(
	core: SimCore,
	apply: (command: Command, source: CommandSource) => unknown
): void {
	const s = core.commsState;
	while (s.queue.length > 0 && s.queue[0]!.at <= core.t + 1e-9) {
		const entry = s.queue.shift()!;
		apply(entry.command as unknown as Command, entry.source ?? 'player');
	}
}

/** The next queued arrival, or null. */
export const nextArrival = (core: SimCore): number | null => core.commsState.queue[0]?.at ?? null;
