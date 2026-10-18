import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleCommand, ModuleResourceContainer } from '../modules.ts';
import { ElectricCharge } from '../resources.ts';
import { AntennaDish, AntennaWhip, ModuleAntenna } from '../comms.ts';
import { cylinder, stackNodes } from './shared.ts';

// Probe core and antennas (plan 114, ADR 0179)

/** A probe core: a control source without seats, with a whip antenna and a small battery. */
export const PartProbeCore = definePart({
	id: 'stock.probe-core',
	title: 'Probe Core',
	mass: kg(50),
	cost: partCost(50, 'command'),
	impactTolerance: 8,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#2a2e35', secondary: '#d5d8dc', accent: '#e0572b' },
		params: { stripe: 0.5, bands: 2 }
	},
	attach: stackNodes(0.4),
	modules: [
		[ModuleCommand],
		[ModuleAntenna, { antenna: AntennaWhip.id }],
		[ModuleResourceContainer, { contents: { [ElectricCharge.id]: { capacity: 20 } } }]
	],
	stagingIcon: 'command'
});

function antennaPart(id: string, title: string, massKg: number, antenna: string, accent: string) {
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'command'),
		impactTolerance: 6,
		maxTemperature: 1000,
		shape: cylinder(0.4),
		visual: {
			kind: 'tank',
			palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent },
			params: { stripe: 0.5, bands: 1 }
		},
		attach: stackNodes(0.4),
		modules: [[ModuleAntenna, { antenna }]]
	});
}

export const PartWhipAntenna = antennaPart(
	'stock.whip-antenna',
	'Whip Antenna',
	5,
	AntennaWhip.id,
	'#f2c14e'
);
export const PartDishAntenna = antennaPart(
	'stock.dish-antenna',
	'Dish Antenna',
	60,
	AntennaDish.id,
	'#f28c28'
);

export const STOCK_COMMS_PARTS = [PartProbeCore, PartWhipAntenna, PartDishAntenna] as const;
