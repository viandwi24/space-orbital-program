import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleResourceContainer, ModuleScrubber } from '../modules.ts';
import { Food, Oxygen, Supplies, Water } from '../resources.ts';
import { cylinder, stackNodes } from './shared.ts';

// Life support (plan 107, ADR 0181 point 10)

/** Six crew-days of every consumable (supplies for `simple`; oxygen, water and food for `full`). */
export const PartLifeSupportPack = definePart({
	id: 'stock.life-support-pack',
	title: 'Life Support Pack',
	mass: kg(60),
	cost: partCost(60, 'tank'),
	impactTolerance: 6,
	maxTemperature: 900,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#e9ebee', secondary: '#2a2e35', accent: '#4caf6e' },
		params: { stripe: 0.5, bands: 2 }
	},
	attach: stackNodes(0.4),
	modules: [
		[
			ModuleResourceContainer,
			{
				contents: {
					[Supplies.id]: { capacity: 6 },
					[Oxygen.id]: { capacity: 6 },
					[Water.id]: { capacity: 6 },
					[Food.id]: { capacity: 6 }
				}
			}
		]
	]
});

/** A CO2 scrubber for three people. */
export const PartScrubber = definePart({
	id: 'stock.scrubber',
	title: 'CO2 Scrubber',
	mass: kg(40),
	cost: partCost(40, 'command'),
	impactTolerance: 6,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#4caf6e' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleScrubber, { crew: 3, charge: 10 }]]
});

export const STOCK_LIFE_SUPPORT_PARTS = [PartLifeSupportPack, PartScrubber] as const;
