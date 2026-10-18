/**
 * EVA (plan 109, ADR 0120): the suit a crew member steps out in, its jetpack propellant, and the
 * flag a suit plants. The suit is a vessel of one part: a seat, a command module, a small
 * life-support pack, a jetpack (the stock engine on its own propellant), a reaction wheel and a
 * surface sampler.
 */
import { defineModule, definePart, defineResource, kg, type PartShape } from '@orbital/sdk';
import { AntennaSuitRadio, ModuleAntenna } from './comms.ts';
import { partCost } from './costs.ts';
import {
	ModuleCommand,
	ModuleEngine,
	ModuleReactionWheel,
	ModuleResourceContainer
} from './modules.ts';
import { ElectricCharge, Food, Oxygen, Supplies, Water } from './resources.ts';
import { ExperimentSurfaceSample, ModuleExperiment } from './science.ts';

/**
 * Cold gas for the suit's jetpack and cold-gas RCS: 1 u is 1 kg. It was `stock.eva-propellant`
 * before plan 208; save format 9 renames it (ADR 0203 point 2).
 */
export const ColdGas = defineResource({
	id: 'stock.cold-gas',
	density: 1,
	flowMode: 'vessel',
	unit: 'u',
	price: 0.5
});
/** The old name of `ColdGas`, kept for mods written against it. */
export const EvaPropellant = ColdGas;

/** Jetpack figures (ADR 0120 point 4): 50 N at 60 s, 5 kg of propellant. */
export const JETPACK = { thrust: 50, isp: 60, propellant: 5 } as const;

const SUIT: PartShape = { kind: 'box', size: [0.7, 1.8, 0.5] };

export const PartEvaSuit = definePart({
	id: 'stock.eva-suit',
	title: 'EVA Suit',
	mass: kg(85),
	crewCapacity: 1,
	cost: partCost(85, 'command'),
	impactTolerance: 8,
	maxTemperature: 800,
	shape: SUIT,
	walk: { speed: 1.5 },
	visual: {
		kind: 'suit',
		palette: { primary: '#f1f2f4', secondary: '#2a2e35', accent: '#e0572b' }
	},
	attach: {
		top: { pos: [0, 0.9, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -0.9, 0], dir: [0, -1, 0] }
	},
	modules: [
		[ModuleCommand, {}],
		[
			ModuleResourceContainer,
			{
				contents: {
					[ElectricCharge.id]: { capacity: 20 },
					[ColdGas.id]: { capacity: JETPACK.propellant },
					// half a day of everything a crew member needs (ADR 0181)
					[Supplies.id]: { capacity: 0.5 },
					[Oxygen.id]: { capacity: 0.5 },
					[Water.id]: { capacity: 0.5 },
					[Food.id]: { capacity: 0.5 }
				}
			}
		],
		[
			ModuleEngine,
			{
				thrust: JETPACK.thrust,
				ispVacuum: JETPACK.isp,
				ispSeaLevel: JETPACK.isp,
				propellants: [{ resource: ColdGas.id, ratio: 1 }]
			}
		],
		[ModuleReactionWheel, { torque: 20, chargeRate: 0.01 }],
		[ModuleExperiment, { experiment: ExperimentSurfaceSample.id, label: 'Take surface sample' }],
		// relayed by a crewed vessel in sight (plan 121, ADR 0193 point 1)
		[ModuleAntenna, { antenna: AntennaSuitRadio.id }]
	]
});

/** A planted flag never goes away as debris (ADR 0120 point 5). */
export const ModuleFlag = defineModule({ id: 'stock.flag', keep: true });

export const PartFlag = definePart({
	id: 'stock.flag',
	title: 'Flag',
	mass: kg(10),
	cost: partCost(10, 'structure'),
	impactTolerance: 20,
	maxTemperature: 1200,
	// a wide footprint so the pole stands; the figure is drawn thin
	shape: { kind: 'box', size: [0.8, 2, 0.8] },
	visual: {
		kind: 'flag',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#3e6ae1' }
	},
	attach: {
		top: { pos: [0, 1, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -1, 0], dir: [0, -1, 0] }
	},
	modules: [[ModuleFlag]]
});

export const STOCK_EVA_PARTS = [PartEvaSuit, PartFlag] as const;
