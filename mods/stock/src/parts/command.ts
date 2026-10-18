import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleCommand, ModuleReactionWheel, ModuleResourceContainer } from '../modules.ts';
import { ElectricCharge } from '../resources.ts';
import { ModuleDataStorage } from '../data.ts';
import { cylinder, stackNodes } from './shared.ts';

export const PartCommandPod = definePart({
	id: 'stock.command-pod',
	title: 'Command Pod',
	mass: kg(840),
	crewCapacity: 1,
	cost: partCost(840, 'command'),
	impactTolerance: 10,
	maxTemperature: 1000,
	shape: cylinder(1),
	visual: {
		kind: 'capsule',
		palette: { primary: '#e9ebee', secondary: '#2b2f36', accent: '#e0572b' }
	},
	// The docking collar on top is 0.625 m across (a parachute's size), the drum below 1.25 m.
	attach: stackNodes(1, 0.625, 1.25),
	modules: [
		[ModuleCommand, {}],
		[ModuleResourceContainer, { contents: { [ElectricCharge.id]: { capacity: 50 } } }]
	],
	stagingIcon: 'command'
});

export const PartReactionWheel = definePart({
	id: 'stock.reaction-wheel',
	title: 'Reaction Wheel',
	mass: kg(100),
	cost: partCost(100, 'command'),
	impactTolerance: 6,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'reaction-wheel',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#2f8fa3' }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleReactionWheel, { torque: 5_000, chargeRate: 0.6 }]],
	stagingIcon: 'wheel'
});

/** A data drive: 64 Mbit of storage for data items (plan 083). */
export const PartDataDrive = definePart({
	id: 'stock.data-drive',
	title: 'Data Drive',
	mass: kg(20),
	cost: partCost(20, 'command'),
	impactTolerance: 8,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#2a2e35', secondary: '#d5d8dc', accent: '#2f8fa3' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleDataStorage, { capacity: 64 * 1024 * 1024 }]]
});
