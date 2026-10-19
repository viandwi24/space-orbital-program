import { defineResource } from '@orbital/sdk';
import { RESOURCE_PRICES } from './costs.ts';

/**
 * Amounts are in each resource's own unit: `u` is the KSP-style abstract volume unit, so a
 * container holding 400 u of liquid fuel carries 400 × 5 = 2 000 kg of it.
 */
export const LiquidFuel = defineResource({
	id: 'stock.liquid-fuel',
	density: 5,
	// Drawn from tanks on the engine's side of the stack (plan 007 resolves reachability).
	flowMode: 'stack',
	unit: 'u',
	price: RESOURCE_PRICES.liquidFuel
});

export const Oxidizer = defineResource({
	id: 'stock.oxidizer',
	density: 5,
	flowMode: 'stack',
	unit: 'u',
	price: RESOURCE_PRICES.oxidizer
});

export const ElectricCharge = defineResource({
	id: 'stock.electric-charge',
	// The schema requires a positive density; 1e-6 kg per EC is a microgram-scale stand-in for
	// "massless" (50 EC weigh 50 mg).
	density: 1e-6,
	// Shared by every part on the vessel.
	flowMode: 'vessel',
	unit: 'EC',
	price: RESOURCE_PRICES.electricCharge,
	// a transfer moves charge at 50 EC/s (plan 213)
	transferRate: 50
});

/** Consumed by heat shields to carry re-entry heat away (ADR 0023). 1 u is 1 kg. */
export const Ablator = defineResource({
	id: 'stock.ablator',
	density: 1,
	// Only the shield that holds it burns it; it is never pumped around.
	flowMode: 'none',
	unit: 'u',
	price: RESOURCE_PRICES.ablator
});

// Life support (plan 107, ADR 0181): drawn by the crew from anywhere on the vessel. One unit is
// one crew member's need for one day.
export const Supplies = defineResource({
	id: 'stock.supplies',
	density: 5,
	flowMode: 'vessel',
	unit: 'u',
	price: RESOURCE_PRICES.supplies
});
export const Oxygen = defineResource({
	id: 'stock.oxygen',
	density: 1,
	flowMode: 'vessel',
	unit: 'u',
	price: RESOURCE_PRICES.oxygen
});
export const Water = defineResource({
	id: 'stock.water',
	density: 3,
	flowMode: 'vessel',
	unit: 'u',
	price: RESOURCE_PRICES.water
});
export const Food = defineResource({
	id: 'stock.food',
	density: 1,
	flowMode: 'vessel',
	unit: 'u',
	price: RESOURCE_PRICES.food
});

/**
 * Monopropellant for RCS (plan 208, ADR 0203 point 2): about 4 kg per unit, drawn from anywhere on
 * the vessel like KSP's.
 */
export const Monopropellant = defineResource({
	id: 'stock.monopropellant',
	density: 4,
	flowMode: 'vessel',
	unit: 'u',
	price: RESOURCE_PRICES.monopropellant
});

/** Solid fuel (plan 208): about 7.5 kg per unit; a solid booster burns only its own. */
export const SolidFuel = defineResource({
	id: 'stock.solid-fuel',
	density: 7.5,
	flowMode: 'none',
	unit: 'u',
	price: RESOURCE_PRICES.solidFuel
});

export const LIFE_SUPPORT_RESOURCES = [Supplies, Oxygen, Water, Food] as const;
