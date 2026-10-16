/// <reference lib="webworker" />
// Worker entry: the sim runs here, off the main thread. See sim-host.ts for the logic. Player
// scripts do not run here: each Run gets its own script Worker (ADR 0031).
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import type { ScriptWorkerLike } from './script-protocol';
import { createSimHost } from './sim-host';

/** A script Worker for one Run: bundled by Vite (the `new URL` form must stay literal). */
function spawnScriptWorker(): ScriptWorkerLike {
	const worker = new Worker(new URL('./script.worker.ts', import.meta.url), { type: 'module' });
	let onmessage: ScriptWorkerLike['onmessage'] = null;
	let onerror: ScriptWorkerLike['onerror'] = null;
	return {
		postMessage: (message) => worker.postMessage(message),
		get onmessage() {
			return onmessage;
		},
		set onmessage(handler) {
			onmessage = handler;
			worker.onmessage = handler ? (event: MessageEvent) => handler({ data: event.data }) : null;
		},
		get onerror() {
			return onerror;
		},
		set onerror(handler) {
			onerror = handler;
			worker.onerror = handler ? (event: ErrorEvent) => handler({ message: event.message }) : null;
		},
		terminate: () => worker.terminate()
	};
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
