/**
 * The save/boot half of the sim Worker's message handling (plan 043), kept out of `sim.worker.ts`
 * so it can be tested without a Worker: `init` starts the host (once) with the save to resume,
 * `save` answers with the live sim's data. Everything else is left to the sim host.
 */
import type { ModBundle, SimSave } from '@orbital/core';
import { parseClientMessage, type WorkerMessage } from '../messages';

export interface SaveRouterOptions {
	/** The sim the host is running, or undefined before it booted. */
	sim(): { save(): SimSave } | undefined;
	post(message: WorkerMessage): void;
	/** Boot the host; `resume` is the save from `init`, unvalidated (the sim checks it). */
	/** `world`: the info of a world without saves (plan 087); `createSim` validates it. */
	boot(resume: unknown, mods: ModBundle[], world?: unknown, ephemeris?: ArrayBuffer): void;
}

export interface SaveRouter {
	/** Returns true when the message was an `init` or `save` request and has been dealt with. */
	handle(data: unknown): boolean;
}

export function createSaveRouter(options: SaveRouterOptions): SaveRouter {
	let booted = false;
	return {
		handle(data) {
			const message = parseClientMessage(data);
			if (message?.kind === 'init') {
				if (!booted) {
					booted = true;
					options.boot(message.save, message.mods ?? [], message.world, message.ephemeris);
				}
				return true;
			}
			if (message?.kind === 'save') {
				const sim = options.sim();
				if (!sim) {
					options.post({
						kind: 'save-error',
						id: message.id,
						message: 'the simulation is not ready yet'
					});
					return true;
				}
				try {
					options.post({ kind: 'saved', id: message.id, save: sim.save() });
				} catch (e) {
					options.post({
						kind: 'save-error',
						id: message.id,
						message: e instanceof Error ? e.message : String(e)
					});
				}
				return true;
			}
			return false;
		}
	};
}
