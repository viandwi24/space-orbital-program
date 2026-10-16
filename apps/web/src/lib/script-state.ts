/** Page-side state of the running script, folded from the Worker's `script-*` messages (pure, testable). */
import type { ScriptState } from './messages';
import type { ScriptEvent } from './sim-client';

/** Log lines kept for display; older ones are dropped. */
export const MAX_SCRIPT_LOG = 200;

export interface ScriptView {
	status: ScriptState | 'idle';
	error: string | null;
	/** 1-based line of the script the error points at, or null. */
	errorLine: number | null;
	/** Guest time of the last tick and the worst so far, ms. */
	lastMs: number;
	maxMs: number;
	log: string[];
}

export const idleScript = (): ScriptView => ({
	status: 'idle',
	error: null,
	errorLine: null,
	lastMs: 0,
	maxMs: 0,
	log: []
});

/** A status that ends the script (or says it never ran): Run is possible again. */
export const scriptIsActive = (status: ScriptView['status']): boolean =>
	status === 'starting' || status === 'running';

export function reduceScript(view: ScriptView, event: ScriptEvent): ScriptView {
	if (event.kind === 'script-log') {
		return { ...view, log: [...view.log, ...event.lines].slice(-MAX_SCRIPT_LOG) };
	}
	// A new run starts with a clean log; the host posts `starting` first.
	const log = event.status === 'starting' ? [] : view.log;
	return {
		status: event.status,
		error: event.error ?? null,
		errorLine: event.errorLine ?? null,
		lastMs: event.lastMs,
		maxMs: event.maxMs,
		log
	};
}
