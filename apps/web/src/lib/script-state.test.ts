import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseWorkerMessage } from './messages';
import { idleScript, MAX_SCRIPT_LOG, reduceScript, scriptIsActive } from './script-state';

describe('script state', () => {
	it('folds status and log messages; a new run clears the old log', () => {
		let v = idleScript();
		v = reduceScript(v, { kind: 'script-status', status: 'starting', lastMs: 0, maxMs: 0 });
		v = reduceScript(v, { kind: 'script-log', lines: ['a', 'b'] });
		v = reduceScript(v, { kind: 'script-status', status: 'running', lastMs: 1.5, maxMs: 2 });
		expect(v).toMatchObject({ status: 'running', lastMs: 1.5, maxMs: 2, log: ['a', 'b'] });
		expect(scriptIsActive(v.status)).toBe(true);
		v = reduceScript(v, {
			kind: 'script-status',
			status: 'terminated',
			error: 'time budget exceeded',
			lastMs: 11,
			maxMs: 11
		});
		expect(v.error).toBe('time budget exceeded');
		expect(scriptIsActive(v.status)).toBe(false);
		v = reduceScript(v, { kind: 'script-status', status: 'starting', lastMs: 0, maxMs: 0 });
		expect(v).toMatchObject({ log: [], error: null });
	});

	it('keeps only the newest MAX_SCRIPT_LOG lines', () => {
		const lines = Array.from({ length: MAX_SCRIPT_LOG + 5 }, (_, i) => `l${i}`);
		const v = reduceScript(idleScript(), { kind: 'script-log', lines });
		expect(v.log).toHaveLength(MAX_SCRIPT_LOG);
		expect(v.log.at(-1)).toBe(`l${MAX_SCRIPT_LOG + 4}`);
	});
});

describe('script messages', () => {
	it('parses the script messages in both directions and rejects malformed ones', () => {
		expect(parseClientMessage({ kind: 'script-start', source: 'x', vessel: 0 })).toEqual({
			kind: 'script-start',
			source: 'x',
			vessel: 0
		});
		expect(parseClientMessage({ kind: 'script-stop' })).toEqual({ kind: 'script-stop' });
		expect(parseClientMessage({ kind: 'script-start', source: 1, vessel: 0 })).toBeNull();
		expect(parseWorkerMessage({ kind: 'script-log', lines: ['a'] })).not.toBeNull();
		expect(parseWorkerMessage({ kind: 'script-log', lines: [1] })).toBeNull();
		expect(
			parseWorkerMessage({ kind: 'script-status', status: 'running', lastMs: 0, maxMs: 0 })
		).not.toBeNull();
		expect(
			parseWorkerMessage({ kind: 'script-status', status: 'weird', lastMs: 0, maxMs: 0 })
		).toBeNull();
	});

	it('carries the error line of a failed script and clears it with the next run', () => {
		let v = reduceScript(idleScript(), {
			kind: 'script-status',
			status: 'failed',
			error: 'TypeError: x',
			errorLine: 5,
			lastMs: 1,
			maxMs: 1
		});
		expect(v).toMatchObject({ status: 'failed', errorLine: 5 });
		v = reduceScript(v, { kind: 'script-status', status: 'starting', lastMs: 0, maxMs: 0 });
		expect(v.errorLine).toBeNull();
	});

	it('accepts only a positive integer error line from the worker', () => {
		const base = { kind: 'script-status', status: 'failed', lastMs: 0, maxMs: 0 };
		expect(parseWorkerMessage({ ...base, errorLine: 3 })).not.toBeNull();
		for (const bad of [0, -1, 1.5, '3', null]) {
			expect(parseWorkerMessage({ ...base, errorLine: bad })).toBeNull();
		}
	});

	it('script-start carries the channel port when there is one, and refuses a port that is not one', () => {
		const { port1, port2 } = new MessageChannel();
		const withPort = parseClientMessage({
			kind: 'script-start',
			source: 'x',
			vessel: 1,
			port: port1
		});
		expect(withPort?.kind === 'script-start' && withPort.port === port1).toBe(true);
		expect(
			parseClientMessage({ kind: 'script-start', source: 'x', vessel: 1, port: 7 })
		).toBeNull();
		expect(
			parseClientMessage({ kind: 'script-start', source: 'x', vessel: 1, port: { postMessage: 1 } })
		).toBeNull();
		port1.close();
		port2.close();
	});
});
