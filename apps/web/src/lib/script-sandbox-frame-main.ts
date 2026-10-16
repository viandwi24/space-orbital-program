// Entry of the sandbox iframe document (bundled to static/sandbox/script-sandbox-frame-main.js by
// scripts/build-sandbox.ts). See script-sandbox-frame.ts.
import { createSandboxFrame } from './script-sandbox-frame';

const frame = createSandboxFrame({
	origin: window.origin,
	parent: window.parent,
	postToParent: (event) => window.parent.postMessage(event, '*'),
	createWorker: (source) => {
		const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
		const worker = new Worker(url);
		URL.revokeObjectURL(url);
		return worker;
	},
	probeScope: window as never
});
window.addEventListener('message', (event) => frame.handle(event));
