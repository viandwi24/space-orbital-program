/**
 * Balance profiles per variant (plan 124, ADR 0184 point 5): typed patches on stock parts, fixed
 * by the validation suite's measurements (journal 124).
 */
import type { AnyPatchDefinition } from '@orbital/sdk';

/** The stock liquid engine's thrust (N) and specific impulse (s) for a variant. */
const engine = (id: string, thrust: number, vacuum: number, sea: number): AnyPatchDefinition =>
	({
		id,
		target: 'part',
		select: { id: 'stock.engine-lv' },
		ops: [
			{ op: 'set', path: 'modules.stock.engine.thrust', value: thrust },
			{ op: 'set', path: 'modules.stock.engine.ispVacuum', value: vacuum },
			{ op: 'set', path: 'modules.stock.engine.ispSeaLevel', value: sea }
		]
	}) as AnyPatchDefinition;

/** The stock tanks' dry mass (kg) for a variant. */
const tankMass = (id: string, small: number, medium: number): AnyPatchDefinition[] => [
	{
		id: `${id}-small`,
		target: 'part',
		select: { id: 'stock.tank-small' },
		ops: [{ op: 'set', path: 'mass', value: small }]
	} as AnyPatchDefinition,
	{
		id: `${id}-medium`,
		target: 'part',
		select: { id: 'stock.tank-medium' },
		ops: [{ op: 'set', path: 'mass', value: medium }]
	} as AnyPatchDefinition
];

/**
 * The heat shield's ablator (kg) and its heat of ablation (J/kg): an orbital entry at real scale
 * brings about forty times stock's flux, so the material is better as well as thicker.
 */
const shield = (id: string, ablator: number, heatOfAblation: number): AnyPatchDefinition =>
	({
		id,
		target: 'part',
		select: { id: 'stock.heat-shield' },
		ops: [
			{ op: 'set', path: 'modules.stock.heat-shield.ablator', value: ablator },
			{ op: 'set', path: 'modules.stock.heat-shield.heatOfAblation', value: heatOfAblation }
		]
	}) as AnyPatchDefinition;

export const BALANCE_1_1: AnyPatchDefinition[] = [
	engine('sol.balance-1-1-engine', 1_200_000, 420, 360),
	...tankMass('sol.balance-1-1-tank', 150, 300),
	shield('sol.balance-1-1-shield', 300, 1.2e7)
];

export const BALANCE_RESCALED: AnyPatchDefinition[] = [
	engine('sol.balance-rescaled-engine', 400_000, 330, 300)
];
