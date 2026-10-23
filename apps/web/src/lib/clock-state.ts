/**
 * The world clock's state (plan 205, ADR 0201 point 4), pure: from what the player did, where they
 * are, whether the tab shows and the world's rule, one state, the time bar's chip and whether the
 * sim ticks. A player pause beats every other input and only the player lifts it.
 */

export type ClockState =
	'running' | 'warp' | 'paused-player' | 'paused-place' | 'paused-tab' | 'background';

export interface ClockInput {
	/** The player pressed pause (P, the time bar's button) and has not resumed. */
	playerPaused: boolean;
	/** The place the player is at pauses the clock (Settings → Time, or a menu that is open). */
	placePaused: boolean;
	/** The place's name for the chip (`Hangar`, `Menu`, ...). */
	place: string;
	tabHidden: boolean;
	/** "Keep running while the tab is hidden" (off by default, ADR 0201 point 8). */
	keepRunningHidden: boolean;
	/** The world's rule `stock.pause-allowed`: false in Hardcore. */
	pauseAllowed: boolean;
	warp: number;
}

export interface ClockView {
	state: ClockState;
	/** The sim steps. */
	ticks: boolean;
	/** `PAUSED`, `PAUSED · HANGAR`, `LOCKED`, `BACKGROUND`; null while it simply runs. */
	chip: string | null;
}

export function clockState(input: ClockInput): ClockView {
	const moving: ClockState = input.warp > 1 ? 'warp' : 'running';
	if (!input.pauseAllowed) {
		// the world always runs, in a hidden tab too; the pause control is locked
		return input.tabHidden
			? { state: 'background', ticks: true, chip: 'BACKGROUND' }
			: { state: moving, ticks: true, chip: 'LOCKED' };
	}
	if (input.playerPaused) return { state: 'paused-player', ticks: false, chip: 'PAUSED' };
	if (input.tabHidden) {
		return input.keepRunningHidden
			? { state: 'background', ticks: true, chip: 'BACKGROUND' }
			: { state: 'paused-tab', ticks: false, chip: 'PAUSED' };
	}
	if (input.placePaused) {
		return { state: 'paused-place', ticks: false, chip: `PAUSED · ${input.place.toUpperCase()}` };
	}
	return { state: moving, ticks: true, chip: null };
}

/** The places of rancangan §3.4 with their default (true: the clock pauses there). */
export const PLACE_PAUSE_DEFAULTS: Readonly<Record<string, boolean>> = {
	Hangar: true,
	Menu: true,
	Launch: true,
	'Space Center': false,
	'Mission Center': false,
	Map: false,
	Flight: false,
	'Astronaut Complex': false,
	'R&D': false,
	Administration: false,
	'Test Stand': false
};

/**
 * The place the clock reads (system audit D4): Flight with its map open is `Map`, so "Pause in Map"
 * holds there; every other page is its own place. (`Mods` is outside the world and was never a place.)
 */
export const clockPlace = (pagePlace: string, mapOpen: boolean): string =>
	pagePlace === 'Flight' && mapOpen ? 'Map' : pagePlace;

/** Whether `place` pauses with the player's choices (a place without one takes the default). */
export const placePauses = (place: string, choices: Readonly<Record<string, boolean>>): boolean =>
	choices[place] ?? PLACE_PAUSE_DEFAULTS[place] ?? false;
