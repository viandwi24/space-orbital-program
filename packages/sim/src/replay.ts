/**
 * Recording and verifying replays (plan 131, ADR 0159 points 2 and 3): commands are logged with
 * the sim time they were accepted at and checkpoints taken every 10 s of sim time; a replay is
 * verified by resuming its start save, stepping fixed steps to each command and each checkpoint.
 */
import {
	CHECKPOINT_EVERY,
	checkpointOf,
	checkpointProblem,
	API_VERSION,
	REPLAY_FORMAT,
	REPLAY_FORMAT_VERSION,
	type Command,
	type CommandResult,
	type ReplayFile
} from '@orbital/core';
import type { Sim } from './sim.ts';

export interface ReplayRecorder {
	/** Dispatch through the recorder: an accepted command is logged with the sim time. */
	dispatch(command: Command): CommandResult;
	/** Call after each `step`: takes a checkpoint when one is due. */
	tick(): void;
	/** The replay so far, with a final checkpoint now (`name` replaces the recording's). */
	finish(name?: string): ReplayFile;
}

export function recordReplay(
	sim: Sim,
	name: string,
	options: { terrain?: boolean } = {}
): ReplayRecorder {
	const start = sim.save();
	const commands: ReplayFile['commands'] = [];
	const checkpoints: ReplayFile['checkpoints'] = [];
	let next = sim.time + CHECKPOINT_EVERY;
	return {
		dispatch(command) {
			const r = sim.dispatch(command);
			if (r.ok) commands.push({ t: sim.time, command: structuredClone(command) });
			return r;
		},
		tick() {
			if (sim.time + 1e-9 < next) return;
			checkpoints.push(checkpointOf(sim.snapshot(), commands.length));
			next = sim.time + CHECKPOINT_EVERY;
		},
		finish(as) {
			return {
				format: REPLAY_FORMAT,
				formatVersion: REPLAY_FORMAT_VERSION,
				apiVersion: API_VERSION,
				name: as ?? name,
				terrain: options.terrain === true,
				start,
				commands: [...commands],
				checkpoints: [...checkpoints, checkpointOf(sim.snapshot(), commands.length)]
			};
		}
	};
}

export type ReplayVerdict =
	{ ok: true; checkpoints: number; commands: number } | { ok: false; reason: string };

/**
 * Re-simulates `replay` in a sim made by `make` from its start save and compares every checkpoint
 * (ADR 0159 point 3). `make` boots the mods the replay needs.
 */
export async function verifyReplay(
	make: (resume: unknown) => Promise<Sim>,
	replay: ReplayFile
): Promise<ReplayVerdict> {
	let sim: Sim;
	try {
		sim = await make(replay.start);
	} catch (e) {
		return {
			ok: false,
			reason: `the start save cannot be loaded: ${e instanceof Error ? e.message : String(e)}`
		};
	}
	const dt = (replay.start as { dt?: number }).dt ?? 0.02;
	/** Fixed steps of sim time until `t` (the wall step is the sim step over the warp). */
	const advance = (t: number): void => {
		let guard = 0;
		while (sim.time < t - dt / 2) {
			sim.step(dt / Math.max(1, sim.warp));
			if (++guard > 50_000_000) throw new Error('the replay does not advance');
		}
	};
	try {
		let done = 0;
		for (const cp of replay.checkpoints) {
			for (; done < cp.n && done < replay.commands.length; done++) {
				const c = replay.commands[done]!;
				advance(c.t);
				const r = sim.dispatch(c.command);
				if (!r.ok)
					return {
						ok: false,
						reason: `at t = ${c.t.toFixed(2)} s the command ${(c.command as Command).type} was refused: ${r.reason}`
					};
			}
			advance(cp.t);
			const problem = checkpointProblem(cp, checkpointOf(sim.snapshot(), done));
			if (problem) return { ok: false, reason: problem };
		}
		return { ok: true, checkpoints: replay.checkpoints.length, commands: replay.commands.length };
	} finally {
		sim.dispose();
	}
}
