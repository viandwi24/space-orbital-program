import { describe, expect, it } from 'vitest';
import { bootSummary, formatBootLog, readBootLog, storeBootLog } from './boot-log';
import { importCode, pluginSource, recordOf } from './fixtures';
import { evaluateMods } from './runtime';

describe('the mod loader log (plan 375)', () => {
	it('lists the boot order, counts per kind, problems by code and patches', async () => {
		const patch = `ctx.parts.register({ id: 'tuner.thing', title: 'T', mass: 2, shape: { kind: 'cylinder', radius: 0.5, height: 1 } }); ctx.patches.register({ id: 'tuner.thrust', target: 'part', select: { id: 'stock.engine-lv' }, ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value: 230000 }] }); ctx.patches.register({ id: 'tuner.none', target: 'part', select: { id: 'nobody.here' }, ops: [{ op: 'set', path: 'mass', value: 1 }] });`;
		const runtime = await evaluateMods(
			[
				await recordOf('tuner', { order: 0, code: pluginSource('tuner', '1.0.0', patch) }),
				await recordOf('off', { order: 1, enabled: false }),
				await recordOf('bad', {
					order: 2,
					code: pluginSource('bad', '1.0.0', `throw new Error('boom in setup');`)
				}),
				await recordOf('tampered', { order: 3, trusted: 'f'.repeat(64) })
			],
			{ importModule: importCode }
		);
		const log = runtime.log!;
		expect(log.order[0]).toBe('stock');
		expect(log.order).toContain('tuner');
		const byId = new Map(log.mods.map((m) => [m.id, m]));
		expect(byId.get('stock')?.source).toBe('builtin');
		expect(byId.get('stock')?.counts.part).toBeGreaterThan(50);
		const tuner = byId.get('tuner')!;
		expect(tuner).toMatchObject({ state: 'loaded', source: 'installed', counts: { part: 1 } });
		expect(tuner.patches).toEqual({ applied: 2, failed: 0 });
		expect(tuner.warnings).toEqual(['patch "tuner.none" matched nothing']);
		expect(byId.get('off')?.state).toBe('disabled');
		expect(byId.get('bad')).toMatchObject({
			state: 'failed',
			problem: { code: 'setup', message: expect.stringContaining('boom in setup') }
		});
		expect(byId.get('tampered')?.problem?.code).toBe('untrusted');
		expect(bootSummary(log)).toMatchObject({ loaded: 5, failed: 2, disabled: 1 });
		const text = formatBootLog(log);
		expect(text).toContain('setup threw: Plugin "bad" setup failed: boom in setup');
		expect(text).toContain('ok     tuner.thrust (tuner) → part: 1 changed (stock.engine-lv)');
	});

	it('the switch boots disabled mods too, for the viewers', async () => {
		const runtime = await evaluateMods([await recordOf('off', { enabled: false })], {
			importModule: importCode,
			includeDisabled: true
		});
		expect(runtime.plugins.map((p) => p.meta.id)).toEqual(['off']);
	});

	it('keeps the last boot in storage', async () => {
		const runtime = await evaluateMods([await recordOf('good')], { importModule: importCode });
		const kept = new Map<string, string>();
		const storage = {
			getItem: (k: string) => kept.get(k) ?? null,
			setItem: (k: string, v: string) => void kept.set(k, v)
		};
		storeBootLog(runtime.log!, storage);
		expect(readBootLog(storage)).toEqual(runtime.log);
	});
});
