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
	price: RESOURCE_PRICES.electricCharge
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
