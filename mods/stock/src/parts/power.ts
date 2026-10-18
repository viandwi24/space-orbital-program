import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleSolarPanel } from '../solar.ts';
import { cylinder, stackNodes } from './shared.ts';

/** A stack solar panel (plan 190): 0.5 EC/s while deployed, in flight and on rails. */
export const PartSolarPanel = definePart({
	id: 'stock.solar-panel',
	title: 'Solar Panel',
	mass: kg(30),
	cost: partCost(30, 'command'),
	impactTolerance: 6,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#1f3a6e', secondary: '#d5d8dc', accent: '#7a8aa6' },
		params: { stripe: 0.5, bands: 3 }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleSolarPanel, {}]]
});

/** Power producers (plan 190). */
export const STOCK_POWER_PARTS = [PartSolarPanel] as const;
