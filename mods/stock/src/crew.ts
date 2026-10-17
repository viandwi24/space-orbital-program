/**
 * Stock crew data (plan 106, ADR 0176): traits that change quality only, and the syllables names
 * are drawn from (invented sounds; no names from other games).
 */
import { defineCrewNames, defineCrewTrait } from '@orbital/sdk';

export const STOCK_CREW_TRAITS = [
	defineCrewTrait({
		id: 'stock.courageous',
		label: 'Courageous',
		abilities: { gTolerance: 1.15, panicResistance: 1.4 }
	}),
	defineCrewTrait({
		id: 'stock.nervous',
		label: 'Nervous',
		abilities: { panicResistance: 0.7, controlSmoothing: 0.95 }
	}),
	defineCrewTrait({
		id: 'stock.steady-hands',
		label: 'Steady hands',
		abilities: { controlSmoothing: 1.1, repairRate: 1.1 }
	}),
	defineCrewTrait({
		id: 'stock.meticulous',
		label: 'Meticulous',
		abilities: { dataQuality: 1.1, scriptBudget: 1.05 }
	}),
	defineCrewTrait({
		id: 'stock.tough',
		label: 'Tough',
		abilities: { gTolerance: 1.25 },
		weight: 0.5
	}),
	defineCrewTrait({
		id: 'stock.distracted',
		label: 'Distracted',
		abilities: { dataQuality: 0.9, repairRate: 0.9 },
		weight: 0.5
	})
] as const;

export const STOCK_CREW_NAMES = defineCrewNames({
	id: 'stock.names',
	first: [
		'ar',
		'be',
		'cal',
		'da',
		'el',
		'fen',
		'ga',
		'hil',
		'io',
		'ka',
		'lo',
		'ma',
		'ne',
		'or',
		'pa',
		'ri',
		'sa',
		'ta',
		'ul',
		've',
		'wy',
		'zo'
	],
	last: [
		'bar',
		'del',
		'fo',
		'gren',
		'ha',
		'kin',
		'lund',
		'mer',
		'nor',
		'qui',
		'ros',
		'sen',
		'tal',
		'var',
		'wen',
		'zar'
	]
});
