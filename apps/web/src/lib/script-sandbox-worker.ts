/// <reference lib="webworker" />
// Script Worker entry (ADR 0031): QuickJS runs here and only here. It has no sim, no snapshot
// beyond the controlled vessel's, and is terminated by the sim Worker when it stops answering.
import { createScriptRunnerIn } from '@orbital/scripting/runner';
import releaseSync from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import quickjsWasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { createScriptWorkerCore } from './script-worker-core';

const core = createScriptWorkerCore({
	createRunner: async (source, options) =>
		createScriptRunnerIn(
			await newQuickJSWASMModuleFromVariant(
				newVariant(releaseSync, { wasmLocation: quickjsWasmUrl })
			),
			source,
			options
		),
	post: (message) => self.postMessage(message),
	now: () => performance.now()
});

self.onmessage = (event: MessageEvent) => core.handle(event.data);
