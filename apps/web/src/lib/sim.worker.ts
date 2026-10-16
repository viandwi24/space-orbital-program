/// <reference lib="webworker" />
// Worker entry: the sim runs here, off the main thread. See sim-host.ts for the logic.
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createScriptRunnerIn } from '@orbital/scripting/runner';
import { createSim } from '@orbital/sim';
import releaseSync from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import quickjsWasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { createSimHost } from './sim-host';

// One WASM module for the worker's life, loaded from the bundled asset URL (ADR 0022).
let quickjs: ReturnType<typeof newQuickJSWASMModuleFromVariant> | null = null;
const loadQuickJS = () => {
	if (!quickjs) {
		const loading = newQuickJSWASMModuleFromVariant(
			newVariant(releaseSync, { wasmLocation: quickjsWasmUrl })
		);
		loading.catch(() => (quickjs = null)); // a failed load may be retried by the next Run
		quickjs = loading;
	}
	return quickjs;
};

const host = createSimHost({
	createSim: () =>
		createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 })
		}),
	createRunner: async (source, options) =>
		createScriptRunnerIn(await loadQuickJS(), source, options),
	post: (message) => self.postMessage(message),
	now: () => performance.now(),
	schedule: (tick, periodMs) => {
		const handle = setInterval(tick, periodMs);
		return () => clearInterval(handle);
	}
});

self.onmessage = (event: MessageEvent) => host.handle(event.data);
void host.start();
