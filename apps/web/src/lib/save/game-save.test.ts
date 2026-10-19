/** Plan 221 / ADR 0208 point 1: per-vessel design records and the version 2 envelope migration. */
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import { buildGameSave, GAME_SAVE_VERSION, parseGameSave } from './game-save';

const sim = () =>
	createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});

/** Launch the two-stage vessel and drop its lower stage; returns the two ids. */
function staged(s: Sim): { upper: number; lower: number } {
	const r = s.dispatch({ type: 'load-vessel', design: referenceTwoStage() });
	if (!r.ok) throw new Error(r.reason);
	const upper = Number(r.vessel);
	let lower = -1;
	s.events.on('vessel:split', (e) => (lower = Number(e.vessel)));
	s.dispatch({ type: 'stage', vessel: r.vessel! });
	s.dispatch({ type: 'throttle', vessel: r.vessel!, value: 1 });
	for (let i = 0; i < 100; i++) s.step(0.02);
	s.dispatch({ type: 'stage', vessel: r.vessel! });
	s.step(0.02);
	return { upper, lower };
}

describe('design records', () => {
	it('a staged save has a record per vessel and each lists only its kept parts', async () => {
		const a = await sim();
		const { upper, lower } = staged(a);
		const save = buildGameSave({
			id: 's',
			name: 'Staged',
			kind: 'manual',
			createdAt: 0,
			sim: a.save(),
			focus: upper,
			design: referenceTwoStage(),
			thumbnail: null,
			bodyRadius: 600_000
		});
		a.dispose();
		expect(save.formatVersion).toBe(GAME_SAVE_VERSION);
		const b = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			resume: parseGameSave(JSON.parse(JSON.stringify(save))).sim
		});
		const up = b.designOf(upper as never)!;
		const down = b.designOf(lower as never)!;
		expect(up.rebuilt).toBe(false);
		expect(down.rebuilt).toBe(false);
		expect(up.parts).toEqual([0, 1, 2, 3]);
		expect(down.parts).toEqual([4, 5, 6]);
		b.dispose();
	});

	it('a version 2 save migrates with the focus design as the focus record', async () => {
		const a = await sim();
		const { upper, lower } = staged(a);
		const v2 = JSON.parse(
			JSON.stringify(
				buildGameSave({
					id: 'old',
					name: 'Old',
					kind: 'auto',
					createdAt: 0,
					sim: a.save(),
					focus: upper,
					design: referenceTwoStage(),
					thumbnail: null,
					bodyRadius: 600_000
				})
			)
		);
		a.dispose();
		// what a version 2 save looks like: no design on any vessel
		v2.formatVersion = 2;
		for (const v of Object.values(v2.sim.world.components['sim.vessel']) as Array<
			Record<string, unknown>
		>)
			delete v.design;
		const { checksum: _c, ...rest } = v2.sim;
		const { simSaveChecksum } = await import('@orbital/core');
		v2.sim.checksum = simSaveChecksum(rest);

		const parsed = parseGameSave(v2);
		const b = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			resume: parsed.sim
		});
		const focus = b.designOf(upper as never)!;
		expect(focus.rebuilt).toBe(false);
		expect(focus.design.name).toBe(referenceTwoStage().name);
		expect(focus.parts).toEqual([0, 1, 2, 3]);
		// the other vessel had no record: rebuilt from its parts, still with its own indices
		const other = b.designOf(lower as never)!;
		expect(other.rebuilt).toBe(true);
		expect(other.parts).toEqual([4, 5, 6]);
		expect(other.design.parts.map((p) => p.index).sort()).toEqual([4, 5, 6]);
		b.dispose();
	});
});
