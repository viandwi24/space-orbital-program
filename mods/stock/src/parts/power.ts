import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleResourceContainer } from '../modules.ts';
import { ElectricCharge } from '../resources.ts';
import { ModuleRtg, ModuleSolarPanel } from '../solar.ts';
import { cylinder, stackNodes } from './shared.ts';

/**
 * A folding stack solar panel (plan 190): 0.5 EC/s while deployed, facing +Z, at the home planet's
 * distance from the star (plan 208: angle, distance and shadow count).
 */
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

/** A fixed body panel (plan 208): 0.35 EC/s facing +Z, always on, nothing to deploy. */
export const PartSolarPanelFixed = definePart({
	id: 'stock.solar-panel-fixed',
	title: 'Fixed Solar Panel',
	mass: kg(15),
	cost: partCost(15, 'command'),
	impactTolerance: 8,
	maxTemperature: 1000,
	shape: cylinder(0.3),
	visual: {
		kind: 'tank',
		palette: { primary: '#1f3a6e', secondary: '#2b2f36', accent: '#7a8aa6' },
		params: { stripe: 0, bands: 1 }
	},
	attach: stackNodes(0.3),
	modules: [[ModuleSolarPanel, { rate: 0.35, deployable: false }]]
});

/**
 * A large sun-tracking array (plan 208, ADR 0203 point 3): 8.25 EC/s; it turns about the part's
 * axis toward the star, so only the star's angle to the axis costs output.
 */
export const PartSolarArrayLarge = definePart({
	id: 'stock.solar-array-large',
	title: 'Large Solar Array',
	mass: kg(300),
	cost: partCost(300, 'command'),
	impactTolerance: 5,
	maxTemperature: 1000,
	shape: cylinder(0.6),
	visual: {
		kind: 'tank',
		palette: { primary: '#1f3a6e', secondary: '#d5d8dc', accent: '#e3a61f' },
		params: { stripe: 0.4, bands: 2 }
	},
	attach: stackNodes(0.6),
	modules: [[ModuleSolarPanel, { rate: 8.25, mode: 'track' }]]
});

/** A radioisotope generator (plan 208): 0.75 EC/s, day and night. */
export const PartRtg = definePart({
	id: 'stock.rtg',
	title: 'Radioisotope Generator',
	mass: kg(80),
	cost: partCost(80, 'engine'),
	impactTolerance: 8,
	maxTemperature: 1200,
	shape: cylinder(0.5),
	visual: {
		kind: 'tank',
		palette: { primary: '#3b4047', secondary: '#e3a61f', accent: '#d9552b' },
		params: { stripe: 0.4, bands: 2 }
	},
	attach: stackNodes(0.5),
	modules: [[ModuleRtg, {}]]
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
	PartSolarPanelFixed,
	PartSolarArrayLarge,
	PartRtg,
	PartBatterySmall,
	PartBatteryMedium,
	PartBatteryLarge
] as const;
