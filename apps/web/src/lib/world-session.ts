/**
 * The world session (plan 204, ADR 0201 points 1 and 11): the one sim client of the open world.
 * The `(world)` layout ends it on the way out; every in-world page takes the client from here
 * instead of starting its own Worker, so moving between pages never restarts the clock.
 */
import type { SimSave, Snapshot, VesselDesign, WorldInfo } from '@orbital/core';
import type { ScriptSandbox } from './script-sandbox';
import { startScriptSandbox } from './script-sandbox-web';
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
	/**
	 * Save now, whatever the autosave gap (plan 223: the Mission Center's fleet actions are the
	 * player's own changes); resolves false when nothing could be saved. Set by the layout.
	 */
	saveNow(): Promise<boolean>;
	/** Tell the layout a page wrote a save itself. */
	saved(): void;
	/**
	 * The world before the flight's launch (plan 230): Revert to the Hangar restarts the sim from
	 * it. Null when the flight was loaded or taken up again, or after a restart.
	 */
	revertPoint: { worldId: string; sim: SimSave } | null;
	/** Open World settings (plan 230): the layout owns the dialog; a page's menu asks for it. */
	openWorldSettings(): void;
	/**
	 * The script sandbox of this world (plan 239, ADR 0232): it lives as long as the world, so a
	 * script keeps flying its vessel when the player leaves Flight. Flight runs and stops scripts
	 * in it; leaving the world or a restart (a load) closes it. Null where scripting is unavailable.
	 */
	scriptSandbox(): ScriptSandbox | null;
	/**
	 * A menu or dialog that pauses as the place "Menu" does (plan 205): `source` holds it while
	 * `on`; the layout decides with the player's choices and the world's rule.
	 */
	hold(source: string, on: boolean): void;
	/** The sources that hold a menu pause now. */
	readonly holds: ReadonlySet<string>;
	/** Leave the world: the Worker is terminated. */
	end(): void;
	onChange(listener: () => void): () => void;
}

export function createWorldSession(
	start: (boot: SimBoot) => SimClient,
	makeSandbox?: () => ScriptSandbox
): WorldSession {
	let sandbox: ScriptSandbox | null = null;
	let worldId: string | null = null;
	let client: SimClient | null = null;
	let booting: Promise<SimClient> | null = null;
	let offSnapshot: (() => void) | null = null;
	let snapshot: Snapshot | null = null;
	const listeners = new Set<() => void>();
	const holds = new Set<string>();
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
		next.ready.then(() => resumeSaved(next), () => {});
		return next;
	}

	/**
	 * A world that opens restarts the script saved on its vessel, with its memory (plan 315, ADR
	 * 0273 point 6). One script runs per world, so only the first saved one resumes.
	 */
	function resumeSaved(next: SimClient): void {
		const first = next.savedScripts[0];
		if (client !== next || !first) return;
		const box = session.scriptSandbox();
		if (!box) return;
		box.open().then(
			(port) => {
				if (client === next) next.resumeScript(first.vessel, port);
				else port.close();
			},
			() => {}
		);
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
		saveNow: () => Promise.resolve(false),
		revertPoint: null,
		openWorldSettings: () => {},
		saved: () => {
			session.savedAt = Date.now();
			changed();
		},
		hold(source, on) {
			if (on === holds.has(source)) return;
			if (on) holds.add(source);
			else holds.delete(source);
			changed();
		},
		get holds() {
			return holds;
		},
		async acquire(id, boot) {
			if (worldId === id && client) return client;
			if (worldId === id && booting) return booting;
			session.end();
			worldId = id;
			const pending = boot().then((b) =>
				worldId === id ? adopt(id, start(b)) : Promise.reject(new Error('the world was left'))
			);
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
		scriptSandbox() {
			if (!sandbox && makeSandbox) sandbox = makeSandbox();
			return sandbox;
		},
		end() {
			offSnapshot?.();
			offSnapshot = null;
			// the script ends with its world (plan 239): its Worker goes with the sandbox's iframe;
			// it stays saved on its vessel and resumes when the world opens again (plan 315)
			client?.stopScript(true);
			sandbox?.close();
			sandbox = null; // a closed sandbox is not handed to the next world (plan 262)
			client?.dispose();
			client = null;
			booting = null;
			worldId = null;
			snapshot = null;
			session.focus = null;
			session.base = null;
			session.savedAt = null;
			holds.clear();
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
export const worldSession: WorldSession = createWorldSession(
	(boot) => startSimWorker(boot),
	() => startScriptSandbox()
);
