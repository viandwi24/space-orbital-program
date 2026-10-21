/**
 * Sim Worker <-> script Worker protocol (ADR 0031). The script Worker runs the QuickJS runner and
 * nothing else; it receives the controlled vessel's snapshot and answers with the commands the
 * script issued. Plain data, structured-clone safe. Everything coming back is untrusted: the sim
 * host validates it (shape here, command policy in `sim-host.ts`, `commandSchema` in the sim).
 */
import type { Command, Snapshot } from '@orbital/core';
import type {
	CommandVerdict,
	ScriptEnvironment,
	ScriptStatus,
	SyntaxCheck
} from '@orbital/scripting';

/** Longest source the page asks the engine to check, characters (the share limit is 64 KB). */
export const MAX_CHECK_CHARS = 200_000;

export type ToScriptWorker =
	/** Plan 058: compile `source` and answer with its syntax error, if any; nothing runs. */
	| { kind: 'check'; id: number; source: string }
	| {
			kind: 'start';
			source: string;
			vessel: number;
			budgetMs: number;
			/** Budget of the script's first (cold) tick, ms. */
			firstTickBudgetMs: number;
			/** Deterministic work budget per tick, interrupt polls (plan 032); absent: wall clock only. */
			fuelPolls?: number;
			env: ScriptEnvironment;
			/** The script's saved memory and whether this run resumes it (plan 320, ADR 0276). */
			memory?: Record<string, unknown>;
			resumed?: boolean;
	  }
	| {
			kind: 'tick';
			snapshot: Snapshot;
			/** The host's answers to commands of earlier ticks (plan 032, ADR 0039). */
			verdicts?: CommandVerdict[];
	  };

export type FromScriptWorker =
	| ({ kind: 'checked'; id: number } & SyntaxCheck)
	| { kind: 'ready' }
	| { kind: 'boot-failed'; error: string }
	| {
			kind: 'result';
			commands: Command[];
			/** Sequence number of each command, same order; the host answers them with `verdicts`. */
			seqs?: number[];
			status: ScriptStatus;
			error?: string;
			/** 1-based script line of `error`, when the engine said. */
			errorLine?: number;
			/** Guest time of this tick, ms. */
			elapsedMs: number;
			/** `print()` lines produced during this tick. */
			lines: string[];
			/** The script's `memory` when it changed this tick (plan 320, ADR 0276). */
			memory?: Record<string, unknown>;
	  };

/** The slice of `Worker` the script channel uses (a double in tests). */
export interface ScriptWorkerLike {
	postMessage(message: ToScriptWorker): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message?: string }) => void) | null;
	terminate(): void;
}

const STATUSES: readonly unknown[] = ['running', 'finished', 'failed', 'terminated'];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Shallow shape check of a message from the script Worker; commands are checked by the host. */
export function parseFromScriptWorker(data: unknown): FromScriptWorker | null {
	if (!isRecord(data)) return null;
	if (data.kind === 'ready') return { kind: 'ready' };
	if (data.kind === 'checked' && typeof data.id === 'number' && Number.isInteger(data.id)) {
		if (data.ok === true) return { kind: 'checked', id: data.id, ok: true };
		if (
			data.ok === false &&
			typeof data.message === 'string' &&
			(data.line === undefined ||
				(typeof data.line === 'number' && Number.isInteger(data.line) && data.line >= 1)) &&
			(data.column === undefined ||
				(typeof data.column === 'number' && Number.isInteger(data.column) && data.column >= 1))
		) {
			return {
				kind: 'checked',
				id: data.id,
				ok: false,
				message: data.message.slice(0, 500),
				...(data.line === undefined ? {} : { line: data.line }),
				...(data.column === undefined ? {} : { column: data.column })
			};
		}
		return null;
	}
	if (data.kind === 'boot-failed' && typeof data.error === 'string') {
		return { kind: 'boot-failed', error: data.error };
	}
	if (
		data.kind === 'result' &&
		Array.isArray(data.commands) &&
		STATUSES.includes(data.status) &&
		typeof data.elapsedMs === 'number' &&
		Number.isFinite(data.elapsedMs) &&
		Array.isArray(data.lines) &&
		data.lines.every((l) => typeof l === 'string') &&
		(data.seqs === undefined ||
			(Array.isArray(data.seqs) &&
				data.seqs.length === data.commands.length &&
				data.seqs.every((q) => typeof q === 'number' && Number.isInteger(q)))) &&
		(data.error === undefined || typeof data.error === 'string') &&
		(data.memory === undefined || isRecord(data.memory)) &&
		(data.errorLine === undefined ||
			(typeof data.errorLine === 'number' &&
				Number.isInteger(data.errorLine) &&
				data.errorLine >= 1))
	) {
		return data as unknown as FromScriptWorker;
	}
	return null;
}

/** Shallow shape check of a message from the sim Worker (script Worker side). */
export function parseToScriptWorker(data: unknown): ToScriptWorker | null {
	if (!isRecord(data)) return null;
	if (
		data.kind === 'check' &&
		typeof data.id === 'number' &&
		Number.isInteger(data.id) &&
		typeof data.source === 'string' &&
		data.source.length <= MAX_CHECK_CHARS
	) {
		return { kind: 'check', id: data.id, source: data.source };
	}
	if (
		data.kind === 'start' &&
		typeof data.source === 'string' &&
		typeof data.vessel === 'number' &&
		typeof data.budgetMs === 'number' &&
		typeof data.firstTickBudgetMs === 'number' &&
		(data.fuelPolls === undefined || typeof data.fuelPolls === 'number') &&
		(data.memory === undefined || isRecord(data.memory)) &&
		(data.resumed === undefined || typeof data.resumed === 'boolean') &&
		isRecord(data.env) &&
		Array.isArray(data.env.bodies) &&
		Array.isArray(data.env.parts) &&
		Array.isArray(data.env.resources)
	) {
		return data as unknown as ToScriptWorker;
	}
	if (
		data.kind === 'tick' &&
		isRecord(data.snapshot) &&
		typeof data.snapshot.t === 'number' &&
		(data.verdicts === undefined ||
			(Array.isArray(data.verdicts) &&
				data.verdicts.every(
					(v) =>
						isRecord(v) &&
						typeof v.seq === 'number' &&
						typeof v.ok === 'boolean' &&
						(v.reason === undefined || typeof v.reason === 'string')
				)))
	) {
		return data as unknown as ToScriptWorker;
	}
	return null;
}
