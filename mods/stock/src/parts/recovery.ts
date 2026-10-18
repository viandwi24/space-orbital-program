import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleHeatShield } from '../modules.ts';
import { cylinder, stackNodes } from './shared.ts';

/**
 * An ablative heat shield, 1.25 m class. Mount it at the end that faces the airflow in a
 * re-entry; it covers that end of the part above it (ADR 0023).
 */
export const PartHeatShield = definePart({
	id: 'stock.heat-shield',
	title: 'Heat Shield',
	mass: kg(80),
	cost: partCost(80, 'gear'),
	impactTolerance: 8,
	maxTemperature: 3_000,
	shape: cylinder(0.2),
	visual: { kind: 'heat-shield', palette: { primary: '#3a2d27' } },
	attach: stackNodes(0.2),
	crossfeed: false,
	modules: [[ModuleHeatShield, {}]],
	stagingIcon: 'shield'
});

/**
 * A flotation collar (plan 067, ADR 0182 point 8): a wide, light ring of about 2.9 m³ that keeps a
 * capsule afloat and upright.
 */
export const PartFlotationCollar = definePart({
	id: 'stock.flotation-collar',
	title: 'Flotation Collar',
	mass: kg(40),
	cost: partCost(40, 'gear'),
	impactTolerance: 12,
	maxTemperature: 900,
	shape: { kind: 'cylinder', radius: 1.25, height: 0.6 },
	visual: {
		kind: 'tank',
		palette: { primary: '#f2a03d', secondary: '#2a2e35', accent: '#e9ebee' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: stackNodes(0.6)
});
