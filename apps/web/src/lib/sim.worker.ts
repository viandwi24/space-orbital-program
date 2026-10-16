/// <reference lib="webworker" />
// Worker entry: the sim runs here, off the main thread. See sim-host.ts for the logic. Player
// scripts do not run here: each Run gets its own script Worker, in a sandboxed iframe (ADR 0031,
// ADR 0038).
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import type { ScriptPortLike } from './messages';
import type { ScriptWorkerLike } from './script-protocol';
import { scriptWorkerOverPort } from './script-port';
import { createSimHost } from './sim-host';

/** The script Worker of a Run lives in the page's sandbox iframe; the page sent the port to it (ADR 0038). */
function spawnScriptWorker(port: ScriptPortLike | undefined): ScriptWorkerLike {
	if (!port) throw new Error('the script sandbox is not available (no channel from the page)');
	return scriptWorkerOverPort(port);
}

const host = createSimHost({
	createSim: () =>
		createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 })
		}),
	spawnScriptWorker: spawnScriptWorker,
	post: (message) => self.postMessage(message),
	now: () => performance.now(),
	schedule: (tick, periodMs) => {
		const handle = setInterval(tick, periodMs);
		return () => clearInterval(handle);
	}
});

self.onmessage = (event: MessageEvent) => host.handle(event.data);
void host.start();
