/**
 * Sim Worker <-> script Worker protocol (ADR 0031). The script Worker runs the QuickJS runner and
 * nothing else; it receives the controlled vessel's snapshot and answers with the commands the
 * script issued. Plain data, structured-clone safe. Everything coming back is untrusted: the sim
 * host validates it (shape here, command policy in `sim-host.ts`, `commandSchema` in the sim).
 */
import type { Command, Snapshot } from '@orbital/core';
import type { ScriptEnvironment, ScriptStatus } from '@orbital/scripting';

export type ToScriptWorker =
	| {
			kind: 'start';
			source: string;
			vessel: number;
			budgetMs: number;
			/** Budget of the script's first (cold) tick, ms. */
			firstTickBudgetMs: number;
			env: ScriptEnvironment;
	  }
	| { kind: 'tick'; snapshot: Snapshot };

export type FromScriptWorker =
	| { kind: 'ready' }
	| { kind: 'boot-failed'; error: string }
	| {
			kind: 'result';
			commands: Command[];
			status: ScriptStatus;
			error?: string;
			/** 1-based script line of `error`, when the engine said. */
			errorLine?: number;
			/** Guest time of this tick, ms. */
			elapsedMs: number;
			/** `print()` lines produced during this tick. */
			lines: string[];
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
		(data.error === undefined || typeof data.error === 'string') &&
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
		data.kind === 'start' &&
		typeof data.source === 'string' &&
		typeof data.vessel === 'number' &&
		typeof data.budgetMs === 'number' &&
		typeof data.firstTickBudgetMs === 'number' &&
		isRecord(data.env) &&
		Array.isArray(data.env.bodies) &&
		Array.isArray(data.env.parts) &&
		Array.isArray(data.env.resources)
	) {
		return data as unknown as ToScriptWorker;
	}
	if (data.kind === 'tick' && isRecord(data.snapshot) && typeof data.snapshot.t === 'number') {
		return data as unknown as ToScriptWorker;
	}
	return null;
}
