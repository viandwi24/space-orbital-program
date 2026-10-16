/// <reference lib="webworker" />
// Worker entry: the sim runs here, off the main thread. See sim-host.ts for the logic.
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { createSimHost } from './sim-host';

const host = createSimHost({
	createSim: () =>
		createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 })
		}),
	post: (message) => self.postMessage(message),
	now: () => performance.now(),
	schedule: (tick, periodMs) => {
		const handle = setInterval(tick, periodMs);
		return () => clearInterval(handle);
	}
});

self.onmessage = (event: MessageEvent) => host.handle(event.data);
void host.start();
