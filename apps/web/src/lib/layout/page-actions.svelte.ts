/**
 * What the shown page puts into the Base layout's bars (plan 204, rancangan §2.4; plan 233): its
 * menu bar actions, the time bar while it drives the warp itself (Flight), the status bar's
 * location, the Map entry and the Menu button. A page sets what it needs on mount and clears it
 * when it goes (`pageShell.reset(owner)`).
 */
import type { Snippet } from 'svelte';
import type { CatchUp } from '../worlds/world-model';
import type { SHELL_ICONS } from './shell-model';

export interface PageAction {
	id: string;
	label: string;
	icon: keyof typeof SHELL_ICONS;
	/** A panel toggle (BASE_LAYOUT §3: the dot while open); undefined for a one-press action. */
	on?: boolean;
	disabled?: boolean;
	/** The main action of the page (the Hangar's Launch): its icon is lit. */
	primary?: boolean;
	title?: string;
	testid?: string;
	onclick?: (e: MouseEvent) => void;
}

/** The time bar while a page drives the warp (Flight, plan 206's levels). */
export interface PageTime {
	steps: readonly number[];
	/** The level now. */
	index: number;
	/** Levels above this factor are out of reach now (plan 206), or null. */
	limit: number | null;
	/** Why the warp is limited or was clamped, shown by the segments; empty for none. */
	reason: string;
	/** Seconds for T+ (the mission's elapsed time in Flight). */
	elapsed: number;
	/** The world date, for the time's tooltip. */
	date?: string;
	/** Pick a level; undefined while it cannot be changed. */
	onpick?: (index: number) => void;
	/** "Catch up to now" after the time while the world is behind the real date (plan 087). */
	catchUp?: CatchUp;
	oncatchup?: () => void;
}

export interface PageLocation {
	icon: 'vessel' | 'spaceCenter';
	text: string;
	/** The vessel's situation, shown after its name (`[VESSEL] · Orbiting Kerbin`). */
	situation?: string;
}

class PageShell {
	/** The legacy actions slot: a page's own buttons (the Hangar: New · Open · Save · Launch). */
	current = $state.raw<Snippet | null>(null);
	actions = $state.raw<readonly PageAction[]>([]);
	time = $state.raw<PageTime | null>(null);
	location = $state.raw<PageLocation | null>(null);
	/** Flight's map view: the fixed group's Map is active while it is on, and switches it. */
	map = $state.raw<{ on: boolean; toggle: () => void } | null>(null);
	/** The page's own menu (Flight's pause menu); the shell's otherwise. */
	menu = $state.raw<(() => void) | null>(null);
	/**
	 * The page's start view, called when the player presses the fixed icon of the page already shown
	 * (V3 §1.4: the Space Center icon returns the Space Center to Overview; plan 274).
	 */
	home = $state.raw<(() => void) | null>(null);

	reset(): void {
		this.actions = [];
		this.time = null;
		this.location = null;
		this.map = null;
		this.menu = null;
		this.home = null;
	}
}

export const pageShell = new PageShell();
/** The name plan 204's pages use for the actions slot. */
export const pageActions = pageShell;
