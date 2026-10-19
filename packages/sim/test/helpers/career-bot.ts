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
 *
 * With `strategy` (plan 101, ADR 0187) that strategy is active for the whole run.
 *
 * With `markets` (plan 097, ADR 0124) launches buy their fuel through the market (the sim does it),
 * and from year 2, once it has 150 000 funds, the bot builds a propellant plant; before each launch
 * it sells what its site holds above 5 000 u of each commodity while the price is at least 95 % of
 * base (at base exactly a market never rises above it without buyers).
 *
 * With `contracts` (plan 099, ADR 0186), each mission also does one altitude job: the bot accepts
 * an offer (the advance) and buys a sounding rocket placed above the altitude (its launch debit;
 * the reward). Other offers expire.
 */
import { tickDayLength } from '../../src/tick.ts';
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
	/** Contracts the bot completed (with `contracts`). */
	completed: number;
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
	/** Build a propellant plant in year 2 and sell its surplus (plan 097). */
	markets?: boolean;
	/** Take and fly one altitude contract per mission (plan 099). */
	contracts?: boolean;
	/** A strategy active from day 0 (plan 101). */
	strategy?: string;
}): Promise<BotResult> {
	const everyDays = options.everyDays ?? 30;
	const downrange = options.downrange ?? 40_000;
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: rapier(8),
		world: options.world
	});
	// the calendar's solar day, what `world:tick` counts (plan 122: longer than the rotation)
	const home = sim.registries.bodies.get('stock.home')!;
	const dayLength = tickDayLength(sim.registries.bodies.list());
	const lastDay = options.days;
	const daily: number[] = [];
	// funds from the ledger's events: a snapshot a day would cost more with every pod in orbit
	let funds = sim.snapshot().economy!.funds;
	sim.events.on('economy:entry', (e) => {
		if (e.currency === 'funds') funds += e.amount;
	});
	sim.events.on('world:tick', () => daily.push(funds));
	const economy = (on: boolean) =>
		must(sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: on }), 'economy');

	let completed = 0;
	if (options.contracts) {
		sim.events.on('objective:completed', (e) => {
			if (e.source.kind === 'contract') completed++;
		});
	}
	/**
	 * One job per mission: accept one altitude offer and fly it with a sounding rocket, a tank and
	 * an engine bought like any launch (the debit) and placed above the altitude at rest. It has no
	 * control source, so it goes on rails as ballistic debris and is removed when it falls back into
	 * the air (ADR 0021): nothing piles up.
	 */
	const doContracts = () => {
		const board = () => sim.snapshot().contracts!;
		const doable = (t: string) => t === 'stock.contract-altitude';
		const offer = board().offers.find((x) => doable(x.template));
		if (!offer || !sim.dispatch({ type: 'contract-accept', offer: offer.id }).ok) return;
		const { min } = (offer.objectives as { params: { min: number } }).params;
		must(
			sim.dispatch({
				type: 'load-vessel',
				design: stack('Sounding rocket', ['stock.tank-small', 'stock.engine-lv'], [[1]]),
				placement: {
					kind: 'state',
					position: { x: home.radius + Math.max(min + 10_000, 80_000), y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: 0 }
				}
			}),
			'fly a sounding rocket'
		);
		settle(sim, 3); // past the idle time: it goes on rails as debris
	};
	if (options.strategy)
		must(sim.dispatch({ type: 'strategy-activate', strategy: options.strategy }), 'strategy');

	let missions = 0;
	let plant = false;
	const sellSurplus = (): void => {
		const economy = sim.snapshot().economy!;
		const held = economy.storage?.find((s) => s.site === 'legacy')?.items ?? {};
		for (const m of economy.markets ?? []) {
			const surplus = (held[m.id] ?? 0) - 5_000;
			if (surplus > 0 && m.price >= 0.95 * m.base)
				must(
					sim.dispatch({ type: 'market-sell', commodity: m.id, amount: surplus, site: 'legacy' }),
					'sell'
				);
		}
	};
	for (let day = everyDays; day <= lastDay; day += everyDays) {
		if (options.markets && !plant && day >= 360 && sim.snapshot().economy!.funds >= 150_000) {
			must(
				sim.dispatch({
					type: 'place-building',
					site: 'legacy',
					kind: 'stock.propellant-plant',
					cell: { i: 20, j: -12 },
					rotation: 0,
					id: 'bot-plant'
				}),
				'build the plant'
			);
			plant = true;
		}
		if (options.markets) sellSurplus();
		if (options.contracts) doContracts();
		// The rocket: paid for at launch.
		const rocket = must(sim.dispatch({ type: 'load-vessel', design: twoStage() }), 'launch')!;
		settle(sim, 3);
		economy(false);
		must(sim.dispatch({ type: 'recover-vessel', vessel: rocket }), 'clear the pad');
		const pod = must(
			sim.dispatch({
				type: 'load-vessel',
				design: stack('Pod', ['stock.command-pod'], []),
				placement: { kind: 'surface', latitude: 0, longitude: downrange / home.radius },
				crew: [] // a stand-in for a returning capsule: nobody to hire (plan 200's auto-crew)
			}),
			'place the pod'
		)!;
		economy(true);
		settle(sim);
		must(sim.dispatch({ type: 'recover-vessel', vessel: pod }), 'recover the pod');
		missions++;
		// Run to the next mission day on rails.
		must(sim.dispatch({ type: 'warp-to', time: day * dayLength + 1, factor: 1e6 }), 'warp-to');
		// until the warp-to has arrived (a day of 21 650.8 s lands between floats of the epsilon)
		for (
			let guard = 0;
			(sim.time < day * dayLength + 1 - 1e-6 || sim.warp !== 1) && guard < 1e5;
			guard++
		)
			sim.step(10);
	}
	const entries = sim.save().economy!.entries;
	return {
		sim,
		missions,
		daily,
		min: Math.min(...daily),
		max: Math.max(...daily),
		entries,
		completed
	};
}
