/// <reference lib="webworker" />
// Entry of the script Worker (ADR 0031, hardened by ADR 0038). It runs inside the sandboxed iframe
// (`script-sandbox-frame.ts`) as a blob Worker built from this file's bundle
// (`scripts/build-sandbox.ts`). QuickJS lives here and only here. The iframe hands over the
// `.wasm` bytes and a MessagePort whose other end is in the sim Worker: from then on this Worker
// talks to the sim Worker directly. It has no sim, no snapshot beyond the controlled vessel's, and
// no way to the game origin (opaque origin, CSP `connect-src 'none'`).
import { createScriptRunnerIn } from '@orbital/scripting/runner';
import releaseSync from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import { probeContainment } from './script-sandbox-probe';
import { createScriptWorkerCore } from './script-worker-core';

interface InitMessage {
	kind: 'init';
	port: MessagePort;
	wasm: ArrayBuffer;
	/** A URL in the game's origin, for the self-test. */
	probeUrl: string;
}

const isInit = (data: unknown): data is InitMessage =>
	typeof data === 'object' &&
	data !== null &&
	(data as { kind?: unknown }).kind === 'init' &&
	(data as { port?: unknown }).port instanceof MessagePort &&
	(data as { wasm?: unknown }).wasm instanceof ArrayBuffer &&
	typeof (data as { probeUrl?: unknown }).probeUrl === 'string';

let started = false;
self.onmessage = (event: MessageEvent) => {
	if (started || !isInit(event.data)) return;
	started = true;
	const { port, wasm, probeUrl } = event.data;
	const core = createScriptWorkerCore({
		createRunner: async (source, options) =>
			createScriptRunnerIn(
				await newQuickJSWASMModuleFromVariant(newVariant(releaseSync, { wasmBinary: wasm })),
				source,
				options
			),
		post: (message) => port.postMessage(message),
		now: () => performance.now()
	});
	port.onmessage = (portEvent: MessageEvent) => core.handle(portEvent.data);
	// What this context can reach, for the page to show (never blocks the script).
	void probeContainment(self, { context: 'worker', target: probeUrl }).then((report) =>
		self.postMessage({ kind: 'report', report })
	);
};
