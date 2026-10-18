/**
 * When to autosave (plan 043; every 60 s by plan 204, ADR 0201 point 11): a timer while the world
 * has something to save, a prompt save after an event (a stage, a landing, a change in the Space
 * Center), and one when the tab is hidden or closed. Pure decision logic with an injected clock; the
 * world layout calls `tick` every second and `request` from events, and performs the save it returns.
 */
export interface AutosaveOptions {
	/** Wall time between timed autosaves, ms. */
	intervalMs: number;
	/** Shortest gap between any two autosaves, ms (stops a burst of stage events). */
	minGapMs: number;
}

export const DEFAULT_AUTOSAVE: AutosaveOptions = { intervalMs: 60_000, minGapMs: 15_000 };

/** What the page knows right now. */
export interface AutosaveState {
	/** The world has something to save (a flight, or a save it booted from). */
	flying: boolean;
	/** The Esc menu or a dialog has frozen the sim. */
	paused: boolean;
	/** A save or load is already running. */
	busy: boolean;
}

export type AutosaveReason = 'timer' | 'stage' | 'landed' | 'change' | 'hidden' | 'pagehide';

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
			const leaving = reason === 'hidden' || reason === 'pagehide';
			if (!leaving && now() - last < options.minGapMs) return null;
			return reason;
		},
		saved() {
			last = now();
		}
	};
}
