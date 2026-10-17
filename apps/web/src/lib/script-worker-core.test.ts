import { describe, expect, it } from 'vitest';
import type { ScriptRunner } from '@orbital/scripting';
import { createScriptWorkerCore } from './script-worker-core';
import type { FromScriptWorker } from './script-protocol';

function rig(
	checkSyntax?: (source: string) => Promise<{ ok: true } | { ok: false; message: string }>
) {
	const posted: FromScriptWorker[] = [];
	let runners = 0;
	const core = createScriptWorkerCore({
		createRunner: async () => {
			runners += 1;
			return {} as ScriptRunner;
		},
		...(checkSyntax ? { checkSyntax } : {}),
		post: (m) => posted.push(m),
		now: () => 0
	});
	return { core, posted, runners: () => runners };
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('the script worker core: syntax checks (plan 058)', () => {
	it('answers a check with the engine result and creates no runner', async () => {
		const seen: string[] = [];
		const { core, posted, runners } = rig(async (source) => {
			seen.push(source);
			return source.includes('bad') ? { ok: false, message: 'oops' } : { ok: true };
		});
		core.handle({ kind: 'check', id: 1, source: 'fine' });
		core.handle({ kind: 'check', id: 2, source: 'bad' });
		await settle();
		expect(posted).toEqual([
			{ kind: 'checked', id: 1, ok: true },
			{ kind: 'checked', id: 2, ok: false, message: 'oops' }
		]);
		expect(seen).toEqual(['fine', 'bad']);
		expect(runners()).toBe(0);
	});
	it('reports an engine that could not be built as a failed check', async () => {
		const { core, posted } = rig(async () => {
			throw new Error('no wasm');
		});
		core.handle({ kind: 'check', id: 4, source: 'x' });
		await settle();
		expect(posted).toEqual([
			{ kind: 'checked', id: 4, ok: false, message: 'could not check: no wasm' }
		]);
	});
	it('ignores checks when the host cannot check, and malformed ones', async () => {
		const { core, posted } = rig();
		core.handle({ kind: 'check', id: 1, source: 'x' });
		core.handle({ kind: 'check', id: 'x', source: 'x' });
		await settle();
		expect(posted).toEqual([]);
	});
});
