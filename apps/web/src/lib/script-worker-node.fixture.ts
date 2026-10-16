// Entry of a real script Worker thread for tests (node:worker_threads), the counterpart of
// script.worker.ts. Run by Node's type stripping, hence the explicit `.ts` import.
import { parentPort } from 'node:worker_threads';
import { createScriptRunner } from '@orbital/scripting';
import { createScriptWorkerCore } from './script-worker-core.ts';

if (!parentPort) throw new Error('script-worker-node.fixture.ts must run as a worker thread');
const port = parentPort;
const core = createScriptWorkerCore({
	createRunner: createScriptRunner,
	post: (message) => port.postMessage(message),
	now: () => performance.now()
});
port.on('message', (data: unknown) => core.handle(data));
