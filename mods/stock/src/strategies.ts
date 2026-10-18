/**
 * Stock strategies (plan 101, ADR 0187 point 8): six policies on the declared multiplier keys,
 * each with an upkeep, offered by agency type. Tuned so the ten-year career bot stays in its band
 * with each one active (journal 101).
 */
import { defineStrategy } from '@orbital/sdk';

export const StrategyReuseFirst = defineStrategy({
	id: 'stock.reuse-first',
	label: 'Reuse first',
	description: 'Recovered hardware is worth more; building for reuse costs a little at launch.',
	effects: [
		{ key: 'recovery', factor: 1.25 },
		{ key: 'launch-cost', factor: 1.05 }
	],
	upkeep: 1_500
});
export const StrategyScienceFirst = defineStrategy({
	id: 'stock.science-first',
	label: 'Science first',
	description: 'Every result counts for more; paid contract work pays less.',
	effects: [
		{ key: 'science', factor: 1.25 },
		{ key: 'contract-funds', factor: 0.85 }
	],
	upkeep: 1_000
});
export const StrategyPublicOutreach = defineStrategy({
	id: 'stock.public-outreach',
	label: 'Public outreach',
	description: 'Talks, open days and live coverage: more reputation from every success.',
	effects: [{ key: 'reputation', factor: 1.3 }],
	upkeep: 1_000,
	agencyTypes: ['government', 'hybrid']
});
export const StrategyLeanOperations = defineStrategy({
	id: 'stock.lean-operations',
	label: 'Lean operations',
	description: 'Cheaper launches from tight processes, at some cost to the public image.',
	effects: [
		{ key: 'launch-cost', factor: 0.9 },
		{ key: 'reputation', factor: 0.85 }
	],
	upkeep: 2_000,
	agencyTypes: ['company', 'hybrid']
});
export const StrategyCommercialContracts = defineStrategy({
	id: 'stock.commercial-contracts',
	label: 'Commercial contracts',
	description: 'Contracts pay more; science takes a back seat.',
	effects: [
		{ key: 'contract-funds', factor: 1.2 },
		{ key: 'science', factor: 0.8 }
	],
	upkeep: 1_000,
	agencyTypes: ['company', 'hybrid']
});
export const StrategyBudgetLobbying = defineStrategy({
	id: 'stock.budget-lobbying',
	label: 'Budget lobbying',
	description: 'A larger budget from the government, and a little less goodwill.',
	effects: [
		{ key: 'budget', factor: 1.1 },
		{ key: 'reputation', factor: 0.9 }
	],
	upkeep: 1_000,
	agencyTypes: ['government']
});

export const STOCK_STRATEGIES = [
	StrategyReuseFirst,
	StrategyScienceFirst,
	StrategyPublicOutreach,
	StrategyLeanOperations,
	StrategyCommercialContracts,
	StrategyBudgetLobbying
] as const;
