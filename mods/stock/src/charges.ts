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
	scaleBy: ['stock.funds-multiplier']
});
export const ChargeBudgetHybrid = defineCharge({
	id: 'stock.budget-hybrid',
	label: 'Public grant',
	currency: 'funds',
	amount: 12_000,
	everyDays: MONTH,
	when: { rule: 'stock.agency-type', equals: 'hybrid' },
	scaleBy: ['stock.funds-multiplier']
});
export const ChargeOperations = defineCharge({
	id: 'stock.operations',
	label: 'Space Center operations',
	currency: 'funds',
	amount: -4_000,
	everyDays: MONTH,
	scaleBy: ['stock.cost-multiplier']
});

export const STOCK_CHARGES = [
	ChargeBudgetGovernment,
	ChargeBudgetHybrid,
	ChargeOperations
] as const;
