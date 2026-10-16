import { describe, expect, it } from 'vitest';
import { parseFromScriptWorker, parseToScriptWorker } from './script-protocol';

const result = {
	kind: 'result',
	commands: [{ type: 'stage', vessel: 1 }],
	status: 'running',
	elapsedMs: 1,
	lines: []
};

describe('script protocol: command feedback (plan 032)', () => {
	it('accepts a result with one sequence number per command, or none', () => {
		expect(parseFromScriptWorker({ ...result, seqs: [7] })).not.toBeNull();
		expect(parseFromScriptWorker(result)).not.toBeNull();
	});
	it('rejects seqs that do not match the commands or are not integers', () => {
		expect(parseFromScriptWorker({ ...result, seqs: [] })).toBeNull();
		expect(parseFromScriptWorker({ ...result, seqs: [1, 2] })).toBeNull();
		expect(parseFromScriptWorker({ ...result, seqs: [1.5] })).toBeNull();
		expect(parseFromScriptWorker({ ...result, seqs: ['1'] })).toBeNull();
	});
	it('accepts verdicts on a tick and rejects malformed ones', () => {
		const snapshot = { t: 1, vessels: [], bodies: [] };
		const good = [
			{ seq: 1, ok: false, reason: 'no' },
			{ seq: 2, ok: true }
		];
		expect(parseToScriptWorker({ kind: 'tick', snapshot, verdicts: good })).not.toBeNull();
		expect(parseToScriptWorker({ kind: 'tick', snapshot })).not.toBeNull();
		expect(parseToScriptWorker({ kind: 'tick', snapshot, verdicts: [{ seq: 1 }] })).toBeNull();
		expect(
			parseToScriptWorker({ kind: 'tick', snapshot, verdicts: [{ seq: 1, ok: true, reason: 3 }] })
		).toBeNull();
		expect(parseToScriptWorker({ kind: 'tick', snapshot, verdicts: 'x' })).toBeNull();
	});
	it('accepts a fuel budget on start and rejects a non-number', () => {
		const start = {
			kind: 'start',
			source: '',
			vessel: 1,
			budgetMs: 200,
			firstTickBudgetMs: 300,
			env: { bodies: [], parts: [], resources: [] }
		};
		expect(parseToScriptWorker({ ...start, fuelPolls: 20000 })).not.toBeNull();
		expect(parseToScriptWorker(start)).not.toBeNull();
		expect(parseToScriptWorker({ ...start, fuelPolls: 'x' })).toBeNull();
	});
});
