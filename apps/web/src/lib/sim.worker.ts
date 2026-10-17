/// <reference lib="webworker" />
// Worker entry: the sim runs here, off the main thread. See sim-host.ts for the logic. Player
// scripts do not run here: each Run gets its own script Worker, in a sandboxed iframe (ADR 0031,
// ADR 0038).
import {
	importModBundle,
	installModSdk,
	resolveMods,
	createBodyTerrainField,
	type ModBundle
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import * as sdk from '@orbital/sdk';
import { createSim, type Sim } from '@orbital/sim';
import type { ScriptPortLike } from './messages';
import type { ScriptWorkerLike } from './script-protocol';
import { scriptWorkerOverPort } from './script-port';
import { createSaveRouter } from './save/worker-save';
import { createSimHost } from './sim-host';

/** The script Worker of a Run lives in the page's sandbox iframe; the page sent the port to it (ADR 0038). */
function spawnScriptWorker(port: ScriptPortLike | undefined): ScriptWorkerLike {
	if (!port) throw new Error('the script sandbox is not available (no channel from the page)');
	return scriptWorkerOverPort(port);
}

/** The save to continue, from the first message; the sim is built after it arrived. */
let resume: unknown;
/** The mods the page decided to run (ADR 0057); resolved again here, with the same function. */
let modBundles: ModBundle[] = [];
let current: Sim | undefined;

const host = createSimHost({
	createSim: async () => {
		installModSdk(sdk);
		const mods = await resolveMods(modBundles, {
			builtin: [Stock],
			importModule: importModBundle
		});
		current = await createSim({
			plugins: [Stock, ...mods.plugins],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			// The same procedural terrain the renderer draws (ADR 0043, 0054), by the kind each body names
			// (`BodyDefinition.terrain`, ADR 0067): hills, craters with the body's seed, or a smooth sphere.
			terrain: createBodyTerrainField,
			// `createSim` validates the save (checksum, version, content) and refuses with a readable reason.
			...(resume === undefined ? {} : { resume })
		});
		return current;
	},
	spawnScriptWorker: spawnScriptWorker,
	post: (message) => self.postMessage(message),
	now: () => performance.now(),
	schedule: (tick, periodMs) => {
		const handle = setInterval(tick, periodMs);
		return () => clearInterval(handle);
	}
});

const saves = createSaveRouter({
	sim: () => current,
	post: (message) => self.postMessage(message),
	boot: (save, mods) => {
		resume = save;
		modBundles = mods;
		void host.start();
	}
});

// The page's first message is `init`; the host starts then, from a save when it carries one.
self.onmessage = (event: MessageEvent) => {
	if (!saves.handle(event.data)) host.handle(event.data);
};
