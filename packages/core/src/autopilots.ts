/**
 * Autopilots (plan 310, ADR 0271): mod code the sim runs for one vessel at a fixed rate, flying it
 * through the public `VesselPilot`. Engaged and disengaged by commands; its memory is plain JSON
 * saved with the vessel. Environment-neutral.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import type { VesselPilot } from './vessel-pilot.ts';
import type { ModContext } from './mod-api.ts';

/** What one step reports. */
export interface AutopilotStep {
	/** Short phase name shown to the player ("align", "approach"). */
	phase: string;
	/** One line for the player. */
	status?: string;
	/** Numbers or text the panel shows, by label. */
	readouts?: Record<string, number | string>;
	/** The job is finished: the sim ends the autopilot with outcome `done`. */
	done?: boolean;
	/** The job cannot go on: the sim ends the autopilot with outcome `aborted` and this reason. */
	abort?: string;
	/** Lines for the panel's log (ADR 0285 point 4): what changed this step, if anything. */
	log?: string | readonly string[];
}

export interface AutopilotDefinition<Memory = unknown> {
	/** `<plugin>.<name>`. */
	id: string;
	title: string;
	description?: string;
	/** Steps per second of sim time, 1..50 (default 10). */
	rate?: number;
	/**
	 * Called by `autopilot-engage`: checks the vessel and returns the memory (plain JSON). Throwing
	 * refuses the command with the error's message.
	 */
	start(ctrl: VesselPilot, params: unknown, ctx: ModContext): Memory;
	/**
	 * One step: read, send controls, report. `dt` is the sim time since the last step. `ctx` is the
	 * mod World API (plan 343, ADR 0292): the whole world, commands, the plugin's stores, notices.
	 */
	step(ctrl: VesselPilot, memory: Memory, dt: number, ctx: ModContext): AutopilotStep;
}

/** The autopilot state the snapshot reports for a vessel (ADR 0271 point 5). */
export interface AutopilotSnapshot {
	id: string;
	title: string;
	phase: string;
	status: string;
	readouts: Record<string, number | string>;
	/** The newest log lines, oldest first, each with its seconds since engage (ADR 0285 point 4). */
	log: string[];
}

/** How an autopilot ended; `refused`: `autopilot-engage` was refused (ADR 0285 point 4). */
export type AutopilotOutcome = 'done' | 'aborted' | 'disengaged' | 'refused';

/** The last run of an autopilot on a vessel, kept after it ends (ADR 0285 point 4). */
export interface AutopilotLast {
	id: string;
	title: string;
	outcome: AutopilotOutcome;
	reason: string;
	/** Sim time it ended, s. */
	time: number;
	log: string[];
}

/** Lines of an autopilot's log the sim keeps. */
export const AUTOPILOT_LOG_LINES = 30;

/** A setting value an autopilot reads (ADR 0285 point 3). */
export type AutopilotSettingValue = boolean | number | string;

const fn = z.custom<(...args: never[]) => unknown>(
	(v) => typeof v === 'function',
	'expected a function'
);

export const autopilotDefinitionSchema = z.object({
	id: z
		.string()
		.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case'),
	title: z.string().min(1),
	description: z.string().optional(),
	rate: z.number().min(1).max(50).optional(),
	start: fn,
	step: fn
});

/** Default steps per second. */
export const AUTOPILOT_RATE = 10;
