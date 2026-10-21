import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import {
	ExperimentAtmosphereSample,
	ExperimentGoo,
	ExperimentMaterials,
	ExperimentPressure,
	ExperimentSeismic,
	ExperimentSurfaceSample,
	ExperimentTemperature,
	ModuleExperiment
} from '../science.ts';
import { cylinder, stackNodes } from './shared.ts';

// Science instruments (plan 103, ADR 0178): small stack parts, each running one experiment.

function instrument(
	id: string,
	title: string,
	massKg: number,
	experiment: string,
	label: string,
	accent: string,
	extra: { held?: boolean; height?: number } = {}
) {
	const height = extra.height ?? 0.4;
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'command'),
		impactTolerance: 8,
		shape: cylinder(height),
		visual: {
			kind: 'tank',
			palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent },
			params: { stripe: 0.5, bands: 1 }
		},
		// stack parts from before plan 280, kept for old designs (ADR 0259)
		catalog: { hidden: true },
		attach: stackNodes(height),
		modules: [[ModuleExperiment, { experiment, label, ...(extra.held ? { held: true } : {}) }]]
	});
}

export const PartThermometer = instrument(
	'stock.thermometer',
	'Thermometer',
	10,
	ExperimentTemperature.id,
	'Log temperature',
	'#d9552b'
);
export const PartBarometer = instrument(
	'stock.barometer',
	'Barometer',
	10,
	ExperimentPressure.id,
	'Log pressure',
	'#2f8fa3'
);
export const PartSeismometer = instrument(
	'stock.seismometer',
	'Seismometer',
	20,
	ExperimentSeismic.id,
	'Log seismic activity',
	'#8a6d3b'
);
export const PartSurfaceSampler = instrument(
	'stock.surface-sampler',
	'Surface Sampler',
	30,
	ExperimentSurfaceSample.id,
	'Take surface sample',
	'#6b8e23'
);
export const PartAtmosphereSampler = instrument(
	'stock.atmosphere-sampler',
	'Atmosphere Sampler',
	15,
	ExperimentAtmosphereSample.id,
	'Take air sample',
	'#7b68ee'
);

/** Plan 210: the goo canister, its result held in the part (KSP's Mystery Goo). */
export const PartGooCanister = instrument(
	'stock.goo-canister',
	'Goo Canister',
	50,
	ExperimentGoo.id,
	'Observe goo',
	'#3fae49',
	{ held: true }
);
/** Plan 210: the materials bay, its result held in the part (KSP's Materials Bay). */
export const PartMaterialsBay = instrument(
	'stock.materials-bay',
	'Materials Bay',
	200,
	ExperimentMaterials.id,
	'Study materials',
	'#c9a227',
	{ held: true, height: 0.8 }
);

export const STOCK_SCIENCE_PARTS = [
	PartThermometer,
	PartBarometer,
	PartSeismometer,
	PartSurfaceSampler,
	PartAtmosphereSampler,
	PartGooCanister,
	PartMaterialsBay
] as const;
