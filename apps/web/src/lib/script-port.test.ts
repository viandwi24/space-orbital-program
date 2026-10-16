import { describe, expect, it } from 'vitest';
import { scriptWorkerOverPort } from './script-port';

describe('script worker over a port', () => {
	it('carries messages both ways over a real MessageChannel', async () => {
		const { port1, port2 } = new MessageChannel();
		const worker = scriptWorkerOverPort(port1);
		const fromWorker = new Promise((resolve) => (worker.onmessage = (e) => resolve(e.data)));
		port2.postMessage({ kind: 'ready' });
		expect(await fromWorker).toEqual({ kind: 'ready' });
		const atOtherEnd = new Promise((resolve) => (port2.onmessage = (e) => resolve(e.data)));
		worker.postMessage({ kind: 'tick', snapshot: { t: 1, vessels: [], bodies: [] } });
		expect(await atOtherEnd).toEqual({ kind: 'tick', snapshot: { t: 1, vessels: [], bodies: [] } });
		worker.terminate();
		port2.close();
	});

	it('terminate() stops delivery and closes the port', async () => {
		const { port1, port2 } = new MessageChannel();
		const worker = scriptWorkerOverPort(port1);
		let heard = 0;
		worker.onmessage = () => void (heard += 1);
		worker.terminate();
		port2.postMessage('late');
		await new Promise((r) => setTimeout(r, 20));
		expect(heard).toBe(0);
		port2.close();
	});
});
