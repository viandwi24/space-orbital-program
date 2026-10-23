/**
 * The Space Center tour's state (plan 377, ADR 0314 points 1 and 3): each world's progress in
 * `localStorage`, "Don't ask again" for every world, and the Space Center's live feed (its page
 * and overlay write it; the tour runner in the world layout reads it).
 */
import { untrack } from 'svelte';
import type { TourBuilding, TourProgress } from './sc-tour';

const key = (world: string): string => `orbital.sc-tour.${world}`;
const NEVER = 'orbital.sc-tour.never';

function read(world: string): TourProgress | null {
	try {
		const raw = localStorage.getItem(key(world));
		if (raw === null) return null;
		const p = JSON.parse(raw) as Partial<TourProgress>;
		return typeof p.status === 'string' && typeof p.step === 'number'
			? {
					status: p.status,
					step: p.step,
					review: p.review === true,
					...(typeof p.building === 'string' ? { building: p.building } : {})
				}
			: null;
	} catch {
		return null;
	}
}

class TourStore {
	/** The active world's tour, null when it was never offered. */
	progress = $state<TourProgress | null>(null);
	world = $state<string | null>(null);

	/** Reads `world`'s tour (on entering a world). */
	load(world: string): void {
		this.world = world;
		this.progress = read(world);
	}

	set(p: TourProgress): void {
		this.progress = p;
		if (this.world === null) return;
		try {
			localStorage.setItem(key(this.world), JSON.stringify(p));
		} catch {
			// private mode: the tour lasts for this page
		}
	}

	/** "Don't ask again": no offer in any world on this browser. */
	get never(): boolean {
		try {
			return localStorage.getItem(NEVER) === '1';
		} catch {
			return false;
		}
	}
	setNever(on: boolean): void {
		try {
			if (on) localStorage.setItem(NEVER, '1');
			else localStorage.removeItem(NEVER);
		} catch {
			// private mode
		}
	}
}

export const tourStore = new TourStore();

/** What the Space Center shows now, for the tour (the page and its overlay write it). */
export interface ScFeed {
	orbited: boolean;
	zoomed: boolean;
	buildOpen: boolean;
	tool: 'place' | 'demolish';
	placing: string | null;
	selected: string | null;
	listOpen: boolean;
	confirm: boolean;
	economy: boolean;
	/** The shown site's buildings, with the tour building's refund. */
	buildings: readonly (TourBuilding & { refund?: number })[];
}

export const EMPTY_FEED: ScFeed = {
	orbited: false,
	zoomed: false,
	buildOpen: false,
	tool: 'place',
	placing: null,
	selected: null,
	listOpen: false,
	confirm: false,
	economy: false,
	buildings: []
};

class ScFeedState {
	/** Null away from the Space Center page. */
	feed = $state.raw<ScFeed | null>(null);
	/** The buildings seen last, kept while the player visits another page. */
	buildings = $state.raw<ScFeed['buildings']>([]);
	economy = $state(false);

	update(part: Partial<ScFeed>): void {
		// written from effects: reading the feed here must not make them depend on it
		const next = { ...(untrack(() => this.feed) ?? EMPTY_FEED), ...part };
		this.feed = next;
		if (part.buildings) this.buildings = part.buildings;
		if (part.economy !== undefined) this.economy = part.economy;
	}
	leave(): void {
		this.feed = null;
	}
}

export const scFeed = new ScFeedState();
