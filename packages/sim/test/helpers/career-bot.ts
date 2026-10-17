/**
 * Headless career bot (plan 095, ADR 0098 guardrail): a scripted player that runs a world for
 * years through the real commands, so balance changes that break the economy fail a test. 096,
 * 097 and 099 extend its policy.
 *
 * One mission every `everyDays` days: buy and launch `twoStage` from the pad (the launch debit);
 * the flight itself is not simulated: with the economy switched off by `set-rule` for a moment the
 * rocket is cleared from the pad and its pod is put down at rest `downrange` metres east, then the
 * economy is switched back on and the pod is recovered (the recovery credit). Between missions
 * the clock runs on rails with `warp-to`, so the world tick pays the scheduled charges.
 */
import type { CommandResult, EntityId, LedgerEntry, WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../../src/index.ts';
import { rapier, stack, twoStage } from './vessels.ts';

export interface BotResult {
	sim: Sim;
	missions: number;
	/** Funds at the end of every day (from `world:tick`). */
	daily: number[];
	min: number;
	max: number;
	entries: LedgerEntry[];
}

const must = (r: CommandResult, what: string): EntityId | undefined => {
	if (!r.ok) throw new Error(`career bot: ${what}: ${r.reason}`);
	return r.vessel;
};

function settle(sim: Sim, seconds = 6): void {
	for (let i = 0; i < seconds / 0.02; i++) sim.step(0.02);
}

export async function runCareerBot(options: {
	world: WorldInfo;
	/** Game days to run (a day is the home body's rotation, ADR 0171). */
	days: number;
	everyDays?: number;
	downrange?: number;
}): Promise<BotResult> {
	const everyDays = options.everyDays ?? 30;
	const downrange = options.downrange ?? 40_000;
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: rapier(8),
		world: options.world
	});
	const home = sim.registries.bodies.get('stock.home')!;
	const dayLength = home.rotationPeriod;
	const lastDay = options.days;
	const daily: number[] = [];
	sim.events.on('world:tick', () => daily.push(sim.snapshot().economy!.funds));
	const economy = (on: boolean) =>
		must(sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: on }), 'economy');

	let missions = 0;
	for (let day = everyDays; day <= lastDay; day += everyDays) {
		// The rocket: paid for at launch.
		const rocket = must(sim.dispatch({ type: 'load-vessel', design: twoStage() }), 'launch')!;
		settle(sim, 3);
		economy(false);
		must(sim.dispatch({ type: 'recover-vessel', vessel: rocket }), 'clear the pad');
		const pod = must(
			sim.dispatch({
				type: 'load-vessel',
				design: stack('Pod', ['stock.command-pod'], []),
				placement: { kind: 'surface', latitude: 0, longitude: downrange / home.radius }
			}),
			'place the pod'
		)!;
		economy(true);
		settle(sim);
		must(sim.dispatch({ type: 'recover-vessel', vessel: pod }), 'recover the pod');
		missions++;
		// Run to the next mission day on rails.
		must(sim.dispatch({ type: 'warp-to', time: day * dayLength + 1, factor: 1e6 }), 'warp-to');
		while (sim.time < day * dayLength + 1 - 1e-6) sim.step(10);
	}
	const entries = sim.save().economy!.entries;
	return {
		sim,
		missions,
		daily,
		min: Math.min(...daily),
		max: Math.max(...daily),
		entries
	};
}
