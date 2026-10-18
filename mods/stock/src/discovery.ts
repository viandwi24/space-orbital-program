/**
 * Stock discovery fact kinds (plan 129, ADR 0192): what a body may hide, the instruments that
 * measure it and how precisely. Only used with `stock.science-depth` `discovery`.
 */
import { defineDiscoveryFact } from '@orbital/sdk';

export const FactPolarIce = defineDiscoveryFact({
	id: 'stock.polar-ice',
	label: 'Polar ice',
	unit: '% of the surface',
	chance: 0.4,
	range: [1, 30],
	tolerance: 4,
	resolution: 6,
	instruments: ['stock.temperature']
});
export const FactMagneticField = defineDiscoveryFact({
	id: 'stock.magnetic-field',
	label: 'Magnetic field',
	unit: 'μT',
	chance: 0.5,
	range: [5, 60],
	tolerance: 6,
	resolution: 12,
	instruments: ['stock.temperature', 'stock.pressure']
});
export const FactSubsurfaceOcean = defineDiscoveryFact({
	id: 'stock.subsurface-ocean',
	label: 'Subsurface ocean',
	unit: 'km deep',
	chance: 0.25,
	range: [10, 150],
	tolerance: 15,
	resolution: 40,
	instruments: ['stock.seismic']
});

export const STOCK_DISCOVERY_FACTS = [FactPolarIce, FactMagneticField, FactSubsurfaceOcean];
