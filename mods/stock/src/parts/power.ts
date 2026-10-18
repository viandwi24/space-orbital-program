import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleResourceContainer } from '../modules.ts';
import { ElectricCharge } from '../resources.ts';
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

/**
 * A battery: a store of electric charge at 5 kg per 100 EC (plan 208, ADR 0203 point 3, the KSP
 * reference). The three sizes differ in capacity and joint size.
 */
const battery = (id: string, title: string, ec: number, size: number, height: number) =>
	definePart({
		id,
		title,
		mass: kg((ec / 100) * 5),
		cost: partCost((ec / 100) * 5, 'command'),
		impactTolerance: 8,
		maxTemperature: 1000,
		shape: { kind: 'cylinder', radius: size / 2, height },
		visual: {
			kind: 'tank',
			palette: { primary: '#2b2f36', secondary: '#d5d8dc', accent: '#e3a61f' },
			params: { stripe: 0.5, bands: 1 }
		},
		attach: stackNodes(height, size),
		modules: [[ModuleResourceContainer, { contents: { [ElectricCharge.id]: { capacity: ec } } }]]
	});

export const PartBatterySmall = battery('stock.battery-small', 'Battery 100', 100, 0.625, 0.3);
export const PartBatteryMedium = battery('stock.battery-medium', 'Battery 400', 400, 1.25, 0.3);
export const PartBatteryLarge = battery('stock.battery-large', 'Battery 1000', 1000, 1.25, 0.5);

/** Power producers and stores (plans 190, 208). */
export const STOCK_POWER_PARTS = [
	PartSolarPanel,
	PartBatterySmall,
	PartBatteryMedium,
	PartBatteryLarge
] as const;
