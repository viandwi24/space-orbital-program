/** Plan 131: the sim host records every flight from boot; the replay it hands out re-verifies. */
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, verifyReplay } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import type { WorkerMessage } from './messages';
import { createSimHost } from './sim-host';

const make = (resume?: unknown) =>
	createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1,
		...(resume ? { resume } : {})
	} as never);

describe('replays from the host (plan 131)', () => {
	it('records the commands of a flight with uneven frames and re-simulates to its checkpoints', async () => {
		const posted: WorkerMessage[] = [];
		let clock = 0;
		const host = createSimHost({
			createSim: () => make(),
			post: (m) => void posted.push(m),
			now: () => clock
		});
		await host.start();
		host.handle({
			kind: 'command',
			id: 1,
			command: { type: 'load-vessel', design: referenceTwoStage() }
		});
		const vessel = (posted.find((m) => m.kind === 'result') as { result: { vessel: number } })
			.result.vessel;
		host.handle({ kind: 'command', id: 2, command: { type: 'throttle', vessel, value: 1 } });
		host.handle({ kind: 'command', id: 3, command: { type: 'stage', vessel } });
		// frames of uneven length, like a browser's
		for (let i = 0; i < 900; i++) {
			clock += i % 3 === 0 ? 17 : 23;
			host.tick();
			if (i === 600)
				host.handle({ kind: 'command', id: 4, command: { type: 'throttle', vessel, value: 0.5 } });
		}
		host.handle({ kind: 'replay', id: 9, name: 'Uneven frames' });
		const answer = posted.find((m) => m.kind === 'replay');
		if (answer?.kind !== 'replay' || !answer.replay) throw new Error('no replay');
		const replay = answer.replay;
		host.dispose();
		expect(replay.name).toBe('Uneven frames');
		expect(replay.commands.map((c) => (c.command as { type: string }).type)).toEqual([
			'load-vessel',
			'throttle',
			'stage',
			'throttle'
		]);
		expect(replay.checkpoints.length).toBeGreaterThanOrEqual(2);
		expect(await verifyReplay(make, JSON.parse(JSON.stringify(replay)))).toMatchObject({
			ok: true
		});
	}, 60_000);
});
