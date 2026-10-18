import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import {
	ExperimentAtmosphereSample,
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
	accent: string
) {
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'command'),
		impactTolerance: 8,
		maxTemperature: 1000,
		shape: cylinder(0.4),
		visual: {
			kind: 'tank',
			palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent },
			params: { stripe: 0.5, bands: 1 }
		},
		attach: stackNodes(0.4),
		modules: [[ModuleExperiment, { experiment, label }]]
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

export const STOCK_SCIENCE_PARTS = [
	PartThermometer,
	PartBarometer,
	PartSeismometer,
	PartSurfaceSampler,
	PartAtmosphereSampler
] as const;
