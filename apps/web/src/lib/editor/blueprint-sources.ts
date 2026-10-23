/**
 * Where stock's blueprints come from (ADR 0316): the Hangar editor's builders, which keep them
 * valid by construction. `scripts/bake-stock-blueprints.ts` builds each against stock's content
 * into `mods/stock/src/blueprints.generated.ts`, and `stock-blueprints.test.ts` checks the
 * registered designs still equal what these build. Change a builder, then run the bake.
 */
import type { BlueprintDefinition, VesselDesign } from '@orbital/core';
import { starterRocket } from '../design';
import { asparagusRocket, boosterRocket, glider, moonShot } from './examples';
import { MISSION_BLUEPRINTS } from './missions';
import type { Content } from './state';

export interface BlueprintSource extends Omit<BlueprintDefinition, 'design' | 'systems'> {
	build(content: Content): VesselDesign;
	/** The systems it is designed for, each with its own builder if it needs one (plan 380). */
	systems?: ReadonlyArray<{
		system: string;
		variant?: string;
		build?(content: Content): VesselDesign;
	}>;
}

/** The five examples the empty Hangar used to offer as text buttons. */
const LEARN: readonly BlueprintSource[] = [
	{
		id: 'stock.two-stage',
		title: 'Two-stage starter',
		collection: 'learn',
		goal: 'orbit',
		crew: 1,
		summary: 'A pod with a parachute on two stages: the first rocket to fly, and to bring home.',
		// the learn rockets are the stock system's, on its first tech tiers (plan 380): the Sol systems
		// need later tech
		systems: [{ system: 'stock' }],
		build: () => starterRocket()
	},
	{
		id: 'stock.boosters',
		title: 'Booster rocket',
		collection: 'learn',
		goal: 'orbit',
		crew: 1,
		summary: 'A core with four solid boosters and four fins: staging boosters away.',
		systems: [{ system: 'stock' }],
		build: (content) => boosterRocket(content)
	},
	{
		id: 'stock.asparagus',
		title: 'Asparagus rocket',
		collection: 'learn',
		goal: 'orbit',
		crew: 1,
		summary: 'Four boosters feed the core through fuel lines and drop in pairs.',
		systems: [{ system: 'stock' }],
		build: (content) => asparagusRocket(content)
	},
	{
		id: 'stock.moon-shot',
		title: 'Moon shot',
		collection: 'learn',
		goal: 'moon',
		crew: 1,
		summary: 'A core with four boosters under a lander with legs: to the moon in one go.',
		systems: [{ system: 'stock' }],
		build: () => moonShot()
	},
	{
		id: 'stock.glider',
		title: 'Glider',
		collection: 'learn',
		goal: 'surface',
		crew: 1,
		summary: 'A pod and a tank with wings and a tail: it glides, it has no engine.',
		systems: [{ system: 'stock' }, { system: 'sol' }],
		build: (content) => glider(content)
	}
];

/** Every blueprint stock registers, in Library order: learn, then the famous missions. */
export const BLUEPRINT_SOURCES: readonly BlueprintSource[] = [
	...LEARN,
	...MISSION_BLUEPRINTS.map((m): BlueprintSource => ({
		id: `stock.${m.id}`,
		title: m.title,
		inspiredBy: m.inspiredBy,
		goal: m.goal,
		crew: m.crew,
		summary: m.summary,
		collection: 'missions',
		build: (content) => m.build(content),
		...(m.systems ? { systems: m.systems } : {})
	}))
];

/**
 * Numbers to 12 significant digits and no `-0`: the builders' trigonometry differs in the last bit
 * between engines (Bun bakes, Node tests), far below anything a part placement can show.
 */
export function stableNumbers<T>(value: T): T {
	if (typeof value === 'number') {
		const n = Number(value.toPrecision(12));
		return (Object.is(n, -0) ? 0 : n) as T;
	}
	if (Array.isArray(value)) return value.map(stableNumbers) as T;
	if (value && typeof value === 'object')
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stableNumbers(v)])) as T;
	return value;
}

/** Every source built against `content`: the definitions stock registers. */
export function bakeStockBlueprints(content: Content): BlueprintDefinition[] {
	return BLUEPRINT_SOURCES.map(({ build, systems, ...card }) => ({
		...card,
		design: stableNumbers(build(content)),
		...(systems
			? {
					systems: systems.map(({ build: own, ...s }) => ({
						...s,
						...(own ? { design: stableNumbers(own(content)) } : {})
					}))
				}
			: {})
	}));
}
