/**
 * When to autosave (plan 043): a timer while a flight is running, a prompt save after a stage or a
 * landing, and one when the tab is hidden. Pure decision logic with an injected clock; the page
 * calls `tick` from its frame loop and `request` from events, and performs the save it returns.
 */
export interface AutosaveOptions {
	/** Wall time between timed autosaves, ms. */
	intervalMs: number;
	/** Shortest gap between any two autosaves, ms (stops a burst of stage events). */
	minGapMs: number;
}

export const DEFAULT_AUTOSAVE: AutosaveOptions = { intervalMs: 120_000, minGapMs: 15_000 };

/** What the page knows right now. */
export interface AutosaveState {
	/** The sim has produced a snapshot with a vessel in it. */
	flying: boolean;
	/** The Esc menu or a dialog has frozen the sim. */
	paused: boolean;
	/** A save or load is already running. */
	busy: boolean;
}

export type AutosaveReason = 'timer' | 'stage' | 'landed' | 'hidden';

export interface Autosaver {
	/** Call every frame or second; returns the reason to save now, or null. */
	tick(state: AutosaveState): AutosaveReason | null;
	/** An event asks for a save; returns the reason when it should be saved now. */
	request(reason: Exclude<AutosaveReason, 'timer'>, state: AutosaveState): AutosaveReason | null;
	/** The page finished a save (or load): restarts the timer. */
	saved(): void;
}

export function createAutosaver(
	now: () => number,
	options: AutosaveOptions = DEFAULT_AUTOSAVE
): Autosaver {
	let last = now();
	const allowed = (state: AutosaveState): boolean => state.flying && !state.busy;
	return {
		tick(state) {
			if (!allowed(state) || state.paused) return null;
			return now() - last >= options.intervalMs ? 'timer' : null;
		},
		request(reason, state) {
			if (!allowed(state)) return null;
			// Leaving the tab must save whatever the gap; the other events wait out the minimum.
			if (reason !== 'hidden' && now() - last < options.minGapMs) return null;
			return reason;
		},
		saved() {
			last = now();
		}
	};
}
