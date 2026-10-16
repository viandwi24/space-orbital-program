/** Test fixtures: a headless sim with the stock two-stage vessel and a runner wired to it. */
import { partId, type Command, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import {
	createScriptRunner,
	type ScriptRunner,
	type ScriptRunnerOptions,
	type TickResult
} from '../src/index.ts';

const stack = (name: string, parts: string[], stages: number[][]): VesselDesign => ({
	formatVersion: 1,
	name,
	parts: parts.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages
});

/** Top to bottom: pod, wheel, tank, engine, decoupler, tank, engine (stage 0 lower engine, stage 1 decoupler + upper engine). */
export const twoStage = (): VesselDesign =>
	stack(
		'Two-stage',
		[
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.tank-small',
			'stock.engine-lv',
			'stock.decoupler',
			'stock.tank-small',
			'stock.engine-lv'
		],
		[[6], [4, 3]]
	);

export interface Rig {
	sim: Sim;
	vessel: number;
	/** Create a runner for `source` controlling the loaded vessel. */
	runner(source: string, options?: Partial<ScriptRunnerOptions>): Promise<ScriptRunner>;
	/** Tick `runner` on the current snapshot and dispatch what it issued. Returns the tick result. */
	drive(runner: ScriptRunner): TickResult;
	/** `sim.step(0.02)` then `drive`. */
	advance(runner: ScriptRunner): TickResult;
	dispatched: Command[];
}

export async function newRig(): Promise<Rig> {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});
	const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
	if (!loaded.ok) throw new Error(loaded.reason);
	const vessel = Number(loaded.vessel);
	const dispatched: Command[] = [];
	const drive = (runner: ScriptRunner): TickResult => {
		const result = runner.tick(sim.snapshot());
		for (const command of result.commands) {
			dispatched.push(command);
			const res = sim.dispatch(command);
			if (!res.ok) throw new Error(`dispatch refused: ${res.reason}`);
		}
		return result;
	};
	return {
		sim,
		vessel,
		dispatched,
		runner: (source, options) =>
			createScriptRunner(source, {
				vessel,
				bodies: sim.registries.bodies.list(),
				parts: sim.registries.parts.list(),
				resources: sim.registries.resources.list(),
				// Tests of behaviour must not depend on machine speed: only budget tests pass a small budget.
				budgetMs: 1_000,
				...options
			}),
		drive,
		advance(runner) {
			sim.step(0.02);
			return drive(runner);
		}
	};
}
