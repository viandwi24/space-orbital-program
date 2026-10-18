/**
 * Stock commodities and the propellant recipe (plan 097, ADR 0124): one chain first, propellant,
 * and the services as fixed prices until their systems trade them (ADR 0098 guardrail).
 */
import { defineCommodity, defineRecipe, type MarketParams } from '@orbital/sdk';
import { RESOURCE_PRICES } from './costs.ts';

/** The market numbers of plan 097: target 50 000 u, √ elasticity, 5 % a day, 0.4 to 2.5 × base, 30 days. */
const MARKET: MarketParams = {
	target: 50_000,
	elasticity: 0.5,
	cap: 0.05,
	floor: 0.4,
	ceiling: 2.5,
	relaxDays: 30
};

export const CommodityLiquidFuel = defineCommodity({
	id: 'stock.liquid-fuel',
	label: 'Liquid fuel',
	unit: 'u',
	basePrice: RESOURCE_PRICES.liquidFuel,
	resource: 'stock.liquid-fuel',
	market: MARKET
});
export const CommodityOxidizer = defineCommodity({
	id: 'stock.oxidizer',
	label: 'Oxidizer',
	unit: 'u',
	basePrice: RESOURCE_PRICES.oxidizer,
	resource: 'stock.oxidizer',
	market: MARKET
});

const service = (id: string, label: string, unit: string, basePrice: number) =>
	defineCommodity({ id: `stock.${id}`, label, unit, basePrice, market: 'fixed' });
export const STOCK_SERVICES = [
	service('launch-service', 'Launch service', 'launch', 30_000),
	service('comms-capacity', 'Comms capacity', 'Mbit', 2),
	service('data', 'Data', 'Mbit', 5),
	service('crew-seat', 'Crew seat', 'seat', 15_000),
	service('insurance', 'Insurance', 'policy', 5_000)
];

/** 200 u of liquid fuel and 245 u of oxidizer a day at level 1 (×2 and ×4 by the plant's level). */
export const RecipePropellantSynthesis = defineRecipe({
	id: 'stock.propellant-synthesis',
	label: 'Propellant synthesis',
	building: 'stock.propellant-plant',
	inputs: { power: 150 },
	outputs: { 'stock.liquid-fuel': 200, 'stock.oxidizer': 245 }
});

export const STOCK_COMMODITIES = [CommodityLiquidFuel, CommodityOxidizer, ...STOCK_SERVICES];
