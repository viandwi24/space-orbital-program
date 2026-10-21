import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleCommand, ModuleReactionWheel, ModuleResourceContainer } from '../modules.ts';
import { ElectricCharge, Monopropellant } from '../resources.ts';
import { ModuleDataStorage } from '../data.ts';
import { cylinder, stackNodes } from './shared.ts';

export const PartCommandPod = definePart({
	id: 'stock.command-pod',
	title: 'Command Pod',
	mass: kg(840),
	crewCapacity: 1,
	cost: partCost(840, 'command'),
	impactTolerance: 10,
	// a pod takes more heat than most parts, a shield more again (plan 212, ADR 0204 point 5)
	maxTemperature: 2_400,
	shape: cylinder(1),
	// the mass sits low, towards the heat shield, and the base is blunt: a pod flies base first (plan 265, ADR 0246)
	centerOfMass: [0, -0.12, 0],
	bluntBase: 0.35,
	visual: {
		kind: 'capsule',
		palette: { primary: '#e9ebee', secondary: '#2b2f36', accent: '#e0572b' }
	},
	// The docking collar on top is 0.625 m across (a parachute's size), the drum below 1.25 m.
	attach: stackNodes(1, 0.625, 1.25),
	// the hatch on the +Z side and a short ladder beside it (plan 225, ADR 0209 points 4 and 5)
	hatch: { pos: [0, 0.05, 0.63], dir: [0, 0, 1] },
	ladder: { from: [0.3, -0.45, 0.6], to: [0.3, 0.4, 0.6], out: [0, 0, 1] },
	modules: [
		[ModuleCommand, {}],
		// a monopropellant reserve for RCS (plan 211, ADR 0203 point 5), empty at build: filling it
		// would change the reference rockets' mass and every frozen flight of the tests
		[
			ModuleResourceContainer,
			{
				contents: {
					[ElectricCharge.id]: { capacity: 50 },
					[Monopropellant.id]: { capacity: 10, amount: 0 }
				}
			}
		]
	],
	stagingIcon: 'command'
});

export const PartReactionWheel = definePart({
	id: 'stock.reaction-wheel',
	title: 'Reaction Wheel',
	mass: kg(100),
	cost: partCost(100, 'command'),
	impactTolerance: 6,
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
	// a stack part from before plan 280: kept for old designs, its surface-mounted successor is in the catalogue (ADR 0259)
	catalog: { hidden: true },
	mass: kg(20),
	cost: partCost(20, 'command'),
	impactTolerance: 8,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#2a2e35', secondary: '#d5d8dc', accent: '#2f8fa3' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleDataStorage, { capacity: 64 * 1024 * 1024 }]]
});
