/**
 * Stock scheduled charges (plan 095, ADR 0113): the agency budget and an operations placeholder
 * until building upkeep (096). Numbers were tuned so the 10-year career bot stays in its band
 * (journal 095); they are data and patchable.
 */
import { defineCharge } from '@orbital/sdk';

const MONTH = 30;

export const ChargeBudgetGovernment = defineCharge({
	id: 'stock.budget-government',
	label: 'Government budget',
	currency: 'funds',
	amount: 24_000,
	everyDays: MONTH,
	when: { rule: 'stock.agency-type', equals: 'government' },
	scaleBy: ['stock.funds-multiplier'],
	multiplier: 'budget' // strategies (plan 101, ADR 0187)
});
export const ChargeBudgetHybrid = defineCharge({
	id: 'stock.budget-hybrid',
	label: 'Public grant',
	currency: 'funds',
	amount: 12_000,
	everyDays: MONTH,
	when: { rule: 'stock.agency-type', equals: 'hybrid' },
	scaleBy: ['stock.funds-multiplier'],
	multiplier: 'budget'
});
export const ChargeOperations = defineCharge({
	id: 'stock.operations',
	label: 'Space Center operations',
	currency: 'funds',
	// 800 less than plan 095's 4 000 since the start's Astronaut Complex and R&D (ADR 0322) pay
	// that much upkeep: a Career month costs what it did
	amount: -3_200,
	everyDays: MONTH,
	scaleBy: ['stock.cost-multiplier']
});

export const STOCK_CHARGES = [
	ChargeBudgetGovernment,
	ChargeBudgetHybrid,
	ChargeOperations
] as const;
