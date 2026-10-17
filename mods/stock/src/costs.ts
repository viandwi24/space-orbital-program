/**
 * Stock costs (plan 095, ADR 0113): one documented rule instead of hand-picked numbers. A part
 * costs its dry mass in kg times its class rate, rounded to whole funds; resources have a price
 * per unit. Contents are paid separately at launch from these prices.
 */
export const COST_RATES = {
	/** Command pods, probe cores, reaction wheels. */
	command: 10,
	engine: 6,
	/** Landing legs and heat shields. */
	gear: 4,
	/** Decouplers, nose cones, fins, wings, struts, fuel lines, control surfaces. */
	structure: 2,
	tank: 1.5
} as const;
export type CostClass = keyof typeof COST_RATES;

export const partCost = (dryMassKg: number, costClass: CostClass): number =>
	Math.round(dryMassKg * COST_RATES[costClass]);

/** Funds per unit of each stock resource. */
export const RESOURCE_PRICES = {
	liquidFuel: 0.8,
	oxidizer: 0.18,
	ablator: 0.5,
	electricCharge: 0
} as const;
