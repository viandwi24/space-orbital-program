import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ColdGas } from '../eva.ts';
import { ModuleResourceContainer } from '../modules.ts';
import { ModuleRcs } from '../rcs.ts';
import { Monopropellant } from '../resources.ts';
import { stackNodes, type Vec3Tuple } from './shared.ts';

// Reaction control (plan 211, ADR 0217): thrusters and their tanks.

const BLOCK_NOZZLES: Array<{ pos: Vec3Tuple; dir: Vec3Tuple }> = [
	{ pos: [0.05, 0.14, 0], dir: [0, -1, 0] },
	{ pos: [0.05, -0.14, 0], dir: [0, 1, 0] },
	{ pos: [0.05, 0, 0.14], dir: [0, 0, -1] },
	{ pos: [0.05, 0, -0.14], dir: [0, 0, 1] }
];
const PORT_NOZZLES: Array<{ pos: Vec3Tuple; dir: Vec3Tuple }> = [
	{ pos: [0.07, 0, 0], dir: [-1, 0, 0] }
];

const radial = (half: number) => ({
	radial: { pos: [-half, 0, 0] as Vec3Tuple, dir: [-1, 0, 0] as Vec3Tuple }
});

/**
 * A four-way RCS block on the side of a stack: four 1 kN monopropellant nozzles (the KSP reference,
 * Isp 240 s in vacuum, 100 s at sea level) pushing along the hull and around it.
 */
export const PartRcsBlock = definePart({
	id: 'stock.rcs-block',
	title: 'RCS Block',
	mass: kg(50),
	cost: partCost(50, 'engine'),
	impactTolerance: 8,
	shape: { kind: 'box', size: [0.2, 0.3, 0.3] },
	visual: {
		kind: 'rcs-block',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e3a61f' },
		params: { nozzles: 4 },
		puffs: { module: ModuleRcs.id, field: 'firing', nozzles: BLOCK_NOZZLES, length: 0.6 }
	},
	attach: radial(0.1),
	crossfeed: false,
	modules: [
		[
			ModuleRcs,
			{
				nozzles: BLOCK_NOZZLES,
				thrust: 1_000,
				ispVacuum: 240,
				ispSeaLevel: 100,
				propellant: Monopropellant.id
			}
		]
	],
	stagingIcon: 'rcs'
});

/**
 * A small cold-gas thruster with its own 8 kg of gas: one 200 N nozzle pushing the vessel inward,
 * for fine translation and for probes without monopropellant.
 */
export const PartColdGasThruster = definePart({
	id: 'stock.rcs-cold-gas',
	title: 'Cold Gas Thruster',
	mass: kg(15),
	cost: partCost(15, 'engine'),
	impactTolerance: 8,
	shape: { kind: 'box', size: [0.14, 0.14, 0.14] },
	visual: {
		kind: 'rcs-block',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#2f8fa3' },
		params: { nozzles: 1 },
		puffs: { module: ModuleRcs.id, field: 'firing', nozzles: PORT_NOZZLES, length: 0.35 }
	},
	attach: radial(0.07),
	modules: [
		[
			ModuleRcs,
			{
				nozzles: PORT_NOZZLES,
				thrust: 200,
				ispVacuum: 70,
				ispSeaLevel: 40,
				propellant: ColdGas.id
			}
		],
		[ModuleResourceContainer, { contents: { [ColdGas.id]: { capacity: 8 } } }]
	],
	stagingIcon: 'rcs'
});

/** An inline monopropellant tank, 1.25 m: 120 u (480 kg). */
export const PartMonopropTank = definePart({
	id: 'stock.monoprop-tank',
	title: 'Monopropellant Tank',
	mass: kg(60),
	cost: partCost(60, 'tank'),
	impactTolerance: 6,
	shape: { kind: 'cylinder', radius: 0.625, height: 0.5 },
	visual: {
		kind: 'tank',
		palette: { primary: '#f2f2ee', secondary: '#2a2e35', accent: '#e3a61f' },
		params: { stripe: 0.4, bands: 1 }
	},
	attach: stackNodes(0.5),
	modules: [[ModuleResourceContainer, { contents: { [Monopropellant.id]: { capacity: 120 } } }]],
	stagingIcon: 'tank'
});

/** A radial monopropellant tank: 30 u (120 kg) on the side of a stack. */
export const PartMonopropRadial = definePart({
	id: 'stock.monoprop-radial',
	title: 'Radial Monopropellant Tank',
	mass: kg(20),
	cost: partCost(20, 'tank'),
	impactTolerance: 6,
	shape: { kind: 'cylinder', radius: 0.3125, height: 0.6 },
	visual: {
		kind: 'tank',
		palette: { primary: '#f2f2ee', secondary: '#2a2e35', accent: '#e3a61f' },
		params: { stripe: 0, bands: 1 }
	},
	attach: radial(0.3125),
	modules: [[ModuleResourceContainer, { contents: { [Monopropellant.id]: { capacity: 30 } } }]],
	stagingIcon: 'tank'
});

export const STOCK_RCS_PARTS = [
	PartRcsBlock,
	PartColdGasThruster,
	PartMonopropTank,
	PartMonopropRadial
] as const;
