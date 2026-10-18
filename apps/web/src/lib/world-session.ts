/**
 * The world session (plan 204, ADR 0201 points 1 and 11): the one sim client of the open world.
 * The `(world)` layout ends it on the way out; every in-world page takes the client from here
 * instead of starting its own Worker, so moving between pages never restarts the clock.
 */
import type { SimSave, Snapshot, VesselDesign, WorldInfo } from '@orbital/core';
import type { GameSave } from './save/game-save';
import type { SaveRequest } from './save/saves';
import { startSimWorker, type SimClient } from './sim-client';

/** What a sim boots from: a save to continue, or a world's start info (none: the Legacy world). */
export interface SimBoot {
	resume?: SimSave;
	world?: WorldInfo;
	ephemeris?: ArrayBuffer;
}

/** The flight the player last flew in this world: the page that comes back to Flight takes it up. */
export interface FlightFocus {
	vessel: number;
	design: VesselDesign;
}

export interface WorldSession {
	/** The world whose sim runs, or null. */
	readonly worldId: string | null;
	readonly client: SimClient | null;
	/** Latest snapshot of the running sim. */
	readonly snapshot: Snapshot | null;
	/**
	 * The running sim of `worldId`, booted with `boot()` the first time. A session of another world
	 * is ended first.
	 */
	acquire(worldId: string, boot: () => Promise<SimBoot>): Promise<SimClient>;
	/** Replace the running sim (a loaded save, a quickload): the world rolls back with it. */
	restart(worldId: string, boot: SimBoot): SimClient;
	/** The flight in focus (set by Flight; null after a recovery or a new boot). */
	focus: FlightFocus | null;
	/**
	 * The save the sim booted from (its focus and design are what an autosave from a page without
	 * a flight writes), or null for a world without saves.
	 */
	base: GameSave | null;
	/** When the world was saved last (wall clock, ms), for the status bar. */
	savedAt: number | null;
	/**
	 * What an autosave writes: Flight sets its own (the focus vessel, its design and a thumbnail);
	 * null lets the layout write the running sim with the focus and design it knows.
	 */
	collect: (() => Promise<SaveRequest>) | null;
	/** Ask the layout for an event autosave (a stage, a landing, a change); set by the layout. */
	requestSave(reason: 'stage' | 'landed' | 'change'): void;
	/** Tell the layout a page wrote a save itself. */
	saved(): void;
	/** Leave the world: the Worker is terminated. */
	end(): void;
	onChange(listener: () => void): () => void;
}

export function createWorldSession(start: (boot: SimBoot) => SimClient): WorldSession {
	let worldId: string | null = null;
	let client: SimClient | null = null;
	let booting: Promise<SimClient> | null = null;
	let offSnapshot: (() => void) | null = null;
	let snapshot: Snapshot | null = null;
	const listeners = new Set<() => void>();
	const changed = (): void => {
		for (const l of listeners) l();
	};

	function adopt(id: string, next: SimClient): SimClient {
		worldId = id;
		client = next;
		snapshot = next.latest;
		offSnapshot = next.onSnapshot((s) => {
			snapshot = s;
		});
		changed();
		return next;
	}

	const session: WorldSession = {
		get worldId() {
			return worldId;
		},
		get client() {
			return client;
		},
		get snapshot() {
			return snapshot;
		},
		focus: null,
		base: null,
		savedAt: null,
		collect: null,
		requestSave: () => {},
		saved: () => {
			session.savedAt = Date.now();
			changed();
		},
		async acquire(id, boot) {
			if (worldId === id && client) return client;
			if (worldId === id && booting) return booting;
			session.end();
			worldId = id;
			const pending = boot().then((b) => (worldId === id ? adopt(id, start(b)) : Promise.reject(new Error('the world was left'))));
			booting = pending;
			try {
				return await pending;
			} finally {
				if (booting === pending) booting = null;
			}
		},
		restart(id, boot) {
			session.end();
			return adopt(id, start(boot));
		},
		end() {
			offSnapshot?.();
			offSnapshot = null;
			client?.dispose();
			client = null;
			booting = null;
			worldId = null;
			snapshot = null;
			session.focus = null;
			session.base = null;
			session.savedAt = null;
			changed();
		},
		onChange(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
	return session;
}

/** The page's one session; the `(world)` layout ends it on the way out. */
export const worldSession: WorldSession = createWorldSession((boot) => startSimWorker(boot));
