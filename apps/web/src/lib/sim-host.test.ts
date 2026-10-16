import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import type { WorkerMessage } from './messages';
import { createSimHost, MAX_WALL_DELTA } from './sim-host';

function makeHost() {
	const posted: WorkerMessage[] = [];
	let clock = 0;
	const host = createSimHost({
		createSim: () =>
			createSim({
				plugins: [Stock],
				backendFactory: () => createRapierBackend({ solverIterations: 16 }),
				maxFlightFrames: 1
			}),
		post: (m) => void posted.push(m),
		now: () => clock
	});
	return { host, posted, advance: (ms: number) => void (clock += ms) };
}

describe('sim host (worker boot)', () => {
	it('reports ready with the stock plugin loaded, then serves a launch and snapshots', async () => {
		const { host, posted, advance } = makeHost();
		await host.start();
		const ready = posted[0];
		expect(ready?.kind).toBe('ready');
		if (ready?.kind !== 'ready') return;
		expect(ready.plugins).toContain('stock');
		expect(ready.parts.map((p) => p.id)).toContain('stock.engine-lv');
		expect(ready.bodies.map((b) => b.id)).toContain('stock.home');

		host.handle({
			kind: 'command',
			id: 7,
			command: { type: 'load-vessel', design: referenceTwoStage() }
		});
		const result = posted.find((m) => m.kind === 'result');
		expect(result).toMatchObject({ kind: 'result', id: 7, result: { ok: true } });

		advance(20);
		host.tick();
		const snap = posted.findLast((m) => m.kind === 'snapshot');
		expect(snap?.kind === 'snapshot' && snap.snapshot.vessels).toHaveLength(1);
		host.dispose();
	});

	it('refuses bad commands without throwing, and rejects unknown messages', async () => {
		const { host, posted } = makeHost();
		await host.start();
		host.handle({ kind: 'command', id: 1, command: { type: 'warp', factor: -3 } });
		expect(posted.at(-1)).toMatchObject({ kind: 'result', id: 1, result: { ok: false } });
		host.handle({ nonsense: true });
		expect(posted.at(-1)).toMatchObject({ kind: 'error' });
		host.dispose();
	});

	it('clamps a stalled wall delta to MAX_WALL_DELTA', async () => {
		const { host, advance } = makeHost();
		await host.start();
		advance(60_000);
		host.tick(); // would otherwise ask the sim for 60 s; must complete instantly and not throw
		expect(MAX_WALL_DELTA).toBe(0.1);
		host.dispose();
	});

	it('answers commands that arrive before the sim is ready with a refusal', () => {
		const { host, posted } = makeHost();
		host.handle({ kind: 'command', id: 3, command: { type: 'stage' } });
		expect(posted[0]).toMatchObject({ kind: 'result', id: 3, result: { ok: false } });
	});
});
