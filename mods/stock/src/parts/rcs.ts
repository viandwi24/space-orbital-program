import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ColdGas } from '../eva.ts';
import { ModuleResourceContainer } from '../modules.ts';
import { ModuleRcs } from '../rcs.ts';
import { LiquidFuel, Monopropellant, Oxidizer } from '../resources.ts';
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
/** Plan 277: the four-way cross plus one nozzle out of the front (an Apollo-style quad). */
const BLOCK5_NOZZLES: Array<{ pos: Vec3Tuple; dir: Vec3Tuple }> = [
	{ pos: [-0.01, 0.14, 0], dir: [0, -1, 0] },
	{ pos: [-0.01, -0.14, 0], dir: [0, 1, 0] },
	{ pos: [-0.01, 0, 0.14], dir: [0, 0, -1] },
	{ pos: [-0.01, 0, -0.14], dir: [0, 0, 1] },
	{ pos: [0.13, 0, 0], dir: [-1, 0, 0] }
];
/** Plan 277: up and down along the hull only. */
const PAIR_NOZZLES: Array<{ pos: Vec3Tuple; dir: Vec3Tuple }> = [
	{ pos: [0.03, 0.14, 0], dir: [0, -1, 0] },
	{ pos: [0.03, -0.14, 0], dir: [0, 1, 0] }
];
/** Plan 277: one monopropellant nozzle straight out of the hull. */
const LINEAR_NOZZLES: Array<{ pos: Vec3Tuple; dir: Vec3Tuple }> = [
	{ pos: [0.05, 0, 0], dir: [-1, 0, 0] }
];

/** A monopropellant thruster part (plan 277) on the RCS block's numbers: 1 kN per nozzle, Isp 240 / 100 s. */
function monopropThruster(spec: {
	id: string;
	title: string;
	massKg: number;
	size: [number, number, number];
	nozzles: Array<{ pos: Vec3Tuple; dir: Vec3Tuple }>;
}) {
	return definePart({
		id: spec.id,
		title: spec.title,
		mass: kg(spec.massKg),
		cost: partCost(spec.massKg, 'engine'),
		impactTolerance: 8,
		shape: { kind: 'box', size: spec.size },
		visual: {
			kind: 'rcs-block',
			palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e3a61f' },
			params: { nozzles: spec.nozzles.length },
			puffs: { module: ModuleRcs.id, field: 'firing', nozzles: spec.nozzles, length: 0.6 }
		},
		attach: radial(spec.size[0] / 2),
		crossfeed: false,
		modules: [
			[
				ModuleRcs,
				{
					nozzles: spec.nozzles,
					thrust: 1_000,
					ispVacuum: 240,
					ispSeaLevel: 100,
					propellant: Monopropellant.id
				}
			]
		],
		stagingIcon: 'rcs'
	});
}

const radial = (half: number) => ({
	radial: { pos: [-half, 0, 0] as Vec3Tuple, dir: [-1, 0, 0] as Vec3Tuple }
});

/**
 * A four-way RCS block on the side of a stack: four 1 kN monopropellant nozzles (the KSP reference,
 * Isp 240 s in vacuum, 100 s at sea level) pushing along the hull and around it.
 */
export const PartRcsBlock = definePart({
	id: 'stock.rcs-block',
	title: 'OrbitX RCS-4 "Compass"',
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
	title: 'OrbitX CG-1 "Puff"',
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

/** Plan 277: the four-way block with a fifth nozzle out of the front, as on a service module's quads. */
export const PartRcsBlock5 = monopropThruster({
	id: 'stock.rcs-block-5',
	title: 'OrbitX RCS-5 "Star"',
	massKg: 60,
	size: [0.26, 0.3, 0.3],
	nozzles: BLOCK5_NOZZLES
});

/** Plan 277: two nozzles along the hull, for translation fore and aft and pitch or yaw. */
export const PartRcsPair = monopropThruster({
	id: 'stock.rcs-pair',
	title: 'OrbitX RCS-2 "Pair"',
	massKg: 30,
	size: [0.16, 0.3, 0.2],
	nozzles: PAIR_NOZZLES
});

/** Plan 277: a single nozzle set into the hull, pushing the vessel inward. */
export const PartRcsLinear = monopropThruster({
	id: 'stock.rcs-linear',
	title: 'OrbitX RCS-1 "Single"',
	massKg: 20,
	size: [0.1, 0.16, 0.16],
	nozzles: LINEAR_NOZZLES
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

/** Plan 299: a bronze four-way block that burns liquid fuel and oxidizer, 12 kN in all (KSP's Vernor kind). */
const VERNOR_NOZZLES: Array<{ pos: Vec3Tuple; dir: Vec3Tuple }> = [
	{ pos: [0.1, 0.2, 0], dir: [0, -1, 0] },
	{ pos: [0.1, -0.2, 0], dir: [0, 1, 0] },
	{ pos: [0.1, 0, 0.2], dir: [0, 0, -1] },
	{ pos: [0.1, 0, -0.2], dir: [0, 0, 1] }
];
export const PartRcsBipropellant = definePart({
	id: 'stock.rcs-bipropellant',
	title: 'OrbitX RV-12 "Vernier"',
	mass: kg(90),
	cost: partCost(90, 'engine'),
	impactTolerance: 8,
	shape: { kind: 'box', size: [0.3, 0.45, 0.45] },
	visual: {
		kind: 'rcs-block',
		palette: { primary: '#b0793a', secondary: '#2a2e35', accent: '#e8c27a' },
		params: { nozzles: 4 },
		puffs: { module: ModuleRcs.id, field: 'firing', nozzles: VERNOR_NOZZLES, length: 0.9 }
	},
	attach: radial(0.15),
	crossfeed: false,
	modules: [
		[
			ModuleRcs,
			{
				nozzles: VERNOR_NOZZLES,
				// 3 kN a nozzle, 12 kN in all; liquid propellant burns at the engines' mix (9 : 11 by volume)
				thrust: 3_000,
				ispVacuum: 290,
				ispSeaLevel: 120,
				propellants: [
					{ resource: LiquidFuel.id, ratio: 0.9 },
					{ resource: Oxidizer.id, ratio: 1.1 }
				]
			}
		]
	],
	stagingIcon: 'rcs'
});

export const STOCK_RCS_PARTS = [
	PartRcsBlock,
	PartRcsBlock5,
	PartRcsPair,
	PartRcsLinear,
	PartColdGasThruster,
	PartRcsBipropellant,
	PartMonopropTank,
	PartMonopropRadial
] as const;
