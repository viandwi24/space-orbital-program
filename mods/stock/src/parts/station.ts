/**
 * Cargo and the deployable station (plan 284, ADR 0264): a locker an astronaut or a rover carries,
 * and the eight items of a field station. A station item is a small `cargo` part with
 * `deployable`: an astronaut sets it on the ground, and the items within reach of a control
 * station make one station, whose experiments yield science once a day while it has power and a
 * link.
 */
import { defineExperiment, definePart, kg } from '@orbital/sdk';
import { AntennaDish, ModuleAntenna } from '../comms.ts';
import { partCost } from '../costs.ts';
import { ModuleInventory, ModuleStationItem } from '../inventory.ts';
import { ModuleRtg, ModuleSolarPanel } from '../solar.ts';
import type { Vec3Tuple } from './shared.ts';

const WHITE = { primary: '#e9ebee', secondary: '#2a2e35', accent: '#e0572b' };
const KBIT = 1024;
const radialAt = (x: number) => ({
	radial: { pos: [-x, 0, 0] as Vec3Tuple, dir: [-1, 0, 0] as Vec3Tuple }
});
const box = (x: number, y: number, z: number) => ({
	kind: 'box' as const,
	size: [x, y, z] as [number, number, number]
});

/** What a station experiment draws while it works, EC/s: the station's power must cover them all. */
const stationExperiment = (id: string, label: string, baseValue: number, power: number) =>
	defineExperiment({
		id,
		label,
		kind: 'data',
		situations: ['stock.landed'],
		baseValue,
		repeatFactor: 0.8,
		duration: 0,
		power,
		bits: 32 * KBIT,
		transmitFactor: 0.8,
		station: true
	});

export const ExperimentStationGoo = stationExperiment('stock.station-goo', 'Goo monitor', 6, 0.05);
export const ExperimentStationWeather = stationExperiment(
	'stock.station-weather',
	'Weather station',
	10,
	0.1
);
export const ExperimentStationIonograph = stationExperiment(
	'stock.station-ionograph',
	'Ionograph',
	12,
	0.15
);
export const ExperimentStationSeismic = stationExperiment(
	'stock.station-seismic',
	'Passive seismometer',
	14,
	0.1
);
export const STOCK_STATION_EXPERIMENTS = [
	ExperimentStationGoo,
	ExperimentStationWeather,
	ExperimentStationIonograph,
	ExperimentStationSeismic
] as const;

/** A utility locker (plan 284): a container for cargo parts, on a hull's side or on a rover's deck. */
export const PartCargoLocker = definePart({
	id: 'stock.cargo-locker',
	title: 'OrbitX CL-1 "Locker"',
	mass: kg(30),
	cost: partCost(30, 'structure'),
	impactTolerance: 8,
	shape: box(0.3, 0.6, 0.5),
	visual: { kind: 'container', palette: WHITE, params: { kind: 'supplies' } },
	attach: radialAt(0.15),
	modules: [[ModuleInventory, { capacity: 60 }]]
});

function item(
	id: string,
	title: string,
	massKg: number,
	volume: number,
	size: [number, number, number],
	station: { role: 'control' | 'power' | 'antenna' | 'science'; experiment?: string },
	visual: { kind: string; params?: Record<string, number | string | boolean> },
	...modules: Array<readonly [never, unknown]>
) {
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'command'),
		impactTolerance: 8,
		shape: box(...size),
		visual: { palette: WHITE, ...visual },
		attach: radialAt(size[0] / 2),
		cargo: { volume, deployable: true },
		modules: [[ModuleStationItem, station] as never, ...modules]
	});
}

export const PartStationControl = item(
	'stock.station-control',
	'OrbitX FS-C "Hub"',
	40,
	10,
	[0.3, 0.3, 0.3],
	{ role: 'control' },
	{ kind: 'container', params: { kind: 'data' } }
);
export const PartStationRtg = item(
	'stock.station-rtg',
	'OrbitX FS-R "Ember"',
	30,
	8,
	[0.3, 0.3, 0.3],
	{ role: 'power' },
	{ kind: 'rtg' },
	[ModuleRtg, {}] as never
);
export const PartStationSolar = item(
	'stock.station-solar',
	'OrbitX FS-S "Sheet"',
	10,
	6,
	[0.04, 0.5, 0.5],
	{ role: 'power' },
	{ kind: 'solar-flat' },
	[ModuleSolarPanel, { rate: 0.35, deployable: false, normal: [1, 0, 0] }] as never
);
export const PartStationAntenna = item(
	'stock.station-antenna',
	'OrbitX FS-A "Dish"',
	15,
	8,
	[0.14, 0.3, 0.3],
	{ role: 'antenna' },
	{ kind: 'antenna-dish', params: { dish: 0.45, arm: 0.35 } },
	[ModuleAntenna, { antenna: AntennaDish.id }] as never
);
const science = (
	id: string,
	title: string,
	experiment: string,
	kind: string,
	size: [number, number, number]
) =>
	item(
		id,
		title,
		12,
		4,
		size,
		{ role: 'science', experiment },
		{
			kind: 'instrument',
			params: { kind }
		}
	);
export const PartStationGoo = science(
	'stock.station-goo',
	'OrbitX FS-G "Watcher"',
	ExperimentStationGoo.id,
	'goo',
	[0.45, 0.45, 0.45]
);
export const PartStationWeather = science(
	'stock.station-weather',
	'OrbitX FS-W "Vane"',
	ExperimentStationWeather.id,
	'barometer',
	[0.2, 0.3, 0.3]
);
export const PartStationIonograph = science(
	'stock.station-ionograph',
	'OrbitX FS-I "Sounder"',
	ExperimentStationIonograph.id,
	'atmosphere',
	[0.2, 0.3, 0.3]
);
export const PartStationSeismic = science(
	'stock.station-seismic',
	'OrbitX FS-Q "Listener"',
	ExperimentStationSeismic.id,
	'seismometer',
	[0.2, 0.2, 0.2]
);

export const STOCK_STATION_PARTS = [
	PartCargoLocker,
	PartStationControl,
	PartStationRtg,
	PartStationSolar,
	PartStationAntenna,
	PartStationGoo,
	PartStationWeather,
	PartStationIonograph,
	PartStationSeismic
] as const;
