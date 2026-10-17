import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScriptChecker } from './script-checker';

/** A fake sandbox: the "Worker" end answers checks with `answer(source)`. */
function rig(answer: (source: string) => Record<string, unknown> | null, delayMs = 0) {
	const log = { opens: 0, closes: 0, requests: [] as string[], workerPorts: [] as MessagePort[] };
	const deps = {
		async open(): Promise<MessagePort> {
			log.opens += 1;
			const channel = new MessageChannel();
			log.workerPorts.push(channel.port2);
			channel.port2.onmessage = (event: MessageEvent) => {
				const m = event.data as { kind: string; id: number; source: string };
				log.requests.push(m.source);
				const reply = answer(m.source);
				if (reply)
					setTimeout(
						() => channel.port2.postMessage({ kind: 'checked', id: m.id, ...reply }),
						delayMs
					);
			};
			return channel.port1;
		},
		close(): void {
			log.closes += 1;
			log.workerPorts.pop()?.close();
		}
	};
	return { deps, log };
}

const answers = (source: string): Record<string, unknown> =>
	source.includes('BAD')
		? { ok: false, message: 'unexpected token', line: 2, column: 4 }
		: { ok: true };

afterEach(() => {
	vi.useRealTimers();
});

describe('the syntax checker', () => {
	it('only ever sends check messages to the worker: it is a read-only line, no commands', async () => {
		const sent: unknown[] = [];
		const { deps, log } = rig(answers);
		const checker = createScriptChecker({
			...deps,
			async open() {
				const port = await deps.open();
				log.workerPorts[0]!.addEventListener('message', (e) => sent.push((e as MessageEvent).data));
				return port;
			}
		});
		await checker.check('print(1)');
		await checker.check('x\nBAD');
		expect(sent.length).toBe(2);
		expect(sent.every((m) => (m as { kind: string }).kind === 'check')).toBe(true);
		checker.close();
	});

	it('answers null for a valid script and the engine error with its line for a bad one', async () => {
		const { deps, log } = rig(answers);
		const checker = createScriptChecker(deps);
		expect(await checker.check('print(1)')).toBeNull();
		expect(await checker.check('x\nBAD')).toEqual({
			message: 'unexpected token',
			line: 2,
			column: 4
		});
		expect(log.opens).toBe(1); // the sandbox is opened once and reused
		checker.close();
	});

	it('only the newest of overlapping checks gets an answer', async () => {
		const { deps } = rig(answers, 5);
		const checker = createScriptChecker(deps);
		const first = checker.check('BAD 1');
		const second = checker.check('fine');
		expect(await first).toBeUndefined();
		expect(await second).toBeNull();
		checker.close();
	});

	it('closes the sandbox after the idle time and reopens it on the next check', async () => {
		const { deps, log } = rig(answers);
		const checker = createScriptChecker({ ...deps, idleMs: 30 });
		await checker.check('a');
		expect(log.closes).toBe(0);
		await new Promise((r) => setTimeout(r, 80));
		expect(log.closes).toBe(1);
		expect(await checker.check('b')).toBeNull();
		expect(log.opens).toBe(2);
		checker.close();
		checker.close(); // idempotent
		expect(log.closes).toBe(2);
	});

	it('close() settles a check in flight with no answer', async () => {
		const { deps } = rig(() => null);
		const checker = createScriptChecker(deps);
		const pending = checker.check('a');
		await new Promise((r) => setTimeout(r, 10));
		checker.close();
		expect(await pending).toBeUndefined();
	});

	it('gives no answer when the sandbox does not answer in time, and does not hang', async () => {
		const { deps } = rig(() => null);
		const checker = createScriptChecker({ ...deps, answerTimeoutMs: 20 });
		expect(await checker.check('a')).toBeUndefined();
		checker.close();
	});

	it('gives no answer when the sandbox cannot start, and waits before trying again', async () => {
		let opens = 0;
		let closes = 0;
		let clock = 0;
		const checker = createScriptChecker({
			open: async () => {
				opens += 1;
				throw new Error('did not start');
			},
			close: () => void (closes += 1),
			retryAfterMs: 1000,
			now: () => clock
		});
		expect(await checker.check('a')).toBeUndefined();
		expect(await checker.check('b')).toBeUndefined();
		expect(opens).toBe(1);
		clock = 2000;
		expect(await checker.check('c')).toBeUndefined();
		expect(opens).toBe(2);
		expect(closes).toBeGreaterThanOrEqual(2);
	});

	it('ignores answers it did not ask for and malformed ones', async () => {
		const { deps, log } = rig(() => null);
		const checker = createScriptChecker({ ...deps, answerTimeoutMs: 60 });
		const pending = checker.check('a');
		await new Promise((r) => setTimeout(r, 10));
		const port = log.workerPorts[0]!;
		port.postMessage({ kind: 'checked', id: 999, ok: false, message: 'stale' });
		port.postMessage({ kind: 'checked', id: 'x', ok: true });
		port.postMessage('junk');
		port.postMessage({ kind: 'checked', id: 1, ok: false, message: 3 });
		expect(await pending).toBeUndefined();
		checker.close();
	});

	it('does not ask the engine to check an enormous source', async () => {
		const { deps, log } = rig(answers);
		const checker = createScriptChecker(deps);
		expect(await checker.check('a'.repeat(300_000))).toBeUndefined();
		expect(log.opens).toBe(0);
	});
});
