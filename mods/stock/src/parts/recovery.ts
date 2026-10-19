import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleHeatShield } from '../modules.ts';
import { ModuleParachute } from '../parachute.ts';
import { cylinder, stackNodes, WIDE_RADIUS } from './shared.ts';

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
	maxTemperature: 3_300,
	shape: cylinder(0.2),
	visual: { kind: 'heat-shield', palette: { primary: '#3a2d27' } },
	attach: stackNodes(0.2),
	crossfeed: false,
	modules: [[ModuleHeatShield, {}]],
	stagingIcon: 'shield'
});

/** The 2.5 m heat shield (plan 210): four times the area, four times the ablator. */
export const PartHeatShieldWide = definePart({
	id: 'stock.heat-shield-wide',
	title: 'Wide Heat Shield',
	mass: kg(300),
	cost: partCost(300, 'gear'),
	impactTolerance: 8,
	maxTemperature: 3_000,
	shape: cylinder(0.3, WIDE_RADIUS),
	visual: { kind: 'heat-shield', palette: { primary: '#3a2d27' } },
	attach: stackNodes(0.3, 2.5),
	crossfeed: false,
	modules: [[ModuleHeatShield, { ablator: 480 }]],
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
	shape: { kind: 'cylinder', radius: 1.25, height: 0.6 },
	visual: {
		kind: 'tank',
		palette: { primary: '#f2a03d', secondary: '#2a2e35', accent: '#e9ebee' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: stackNodes(0.6)
});

/**
 * Parachutes (plan 209, ADR 0203 point 4). Numbers from KSP, scaled to our masses: one main chute
 * brings a 1 t capsule down at about 6 m/s at sea level (`v = √(2 m g / (ρ CdA))`). Semi-deployed,
 * a main streams at about a fiftieth of its full drag. The deploy flag the canopy visual follows is
 * `canopy` (0 stowed, 0.3 semi, 1 full).
 */
const canopy = { module: ModuleParachute.id, flag: 'canopy', seconds: 1.5 } as const;

/** The main chute that caps a capsule: 0.625 m, on the pod's top node. */
export const PartParachute = definePart({
	id: 'stock.parachute',
	title: 'Parachute',
	mass: kg(100),
	cost: partCost(100, 'gear'),
	impactTolerance: 12,
	shape: { kind: 'cylinder', radius: 0.3125, height: 0.32 },
	visual: {
		kind: 'parachute',
		palette: { primary: '#e9ebee', secondary: '#2a2e35', accent: '#e0572b' },
		params: { canopy: 11 },
		deploy: canopy
	},
	attach: { bottom: { pos: [0, -0.16, 0], dir: [0, -1, 0], size: 0.625 } },
	crossfeed: false,
	modules: [
		[
			ModuleParachute,
			{ semiDragArea: 10, fullDragArea: 480, anchor: [0, 0.16, 0] as [number, number, number] }
		]
	],
	stagingIcon: 'parachute'
});

/** A radial main chute: the same canopy on the side of a part, for capsules with a full top. */
export const PartRadialParachute = definePart({
	id: 'stock.radial-parachute',
	title: 'Radial Parachute',
	mass: kg(100),
	cost: partCost(100, 'gear'),
	impactTolerance: 12,
	shape: { kind: 'box', size: [0.24, 0.6, 0.36] },
	visual: {
		kind: 'parachute',
		palette: { primary: '#e9ebee', secondary: '#2a2e35', accent: '#e0572b' },
		params: { canopy: 11, radial: true },
		deploy: canopy
	},
	attach: { radial: { pos: [-0.12, 0, 0], dir: [-1, 0, 0] } },
	crossfeed: false,
	modules: [
		[
			ModuleParachute,
			{ semiDragArea: 10, fullDragArea: 480, anchor: [0, 0.3, 0] as [number, number, number] }
		]
	],
	stagingIcon: 'parachute'
});

/**
 * A drogue: a small, strong canopy that opens high and fast (0.02 atm, full at 2 500 m, Risky from
 * about 500 m/s) to slow a capsule before the mains; alone it lands far too fast.
 */
export const PartDrogueChute = definePart({
	id: 'stock.drogue-chute',
	title: 'Drogue Chute',
	mass: kg(60),
	cost: partCost(60, 'gear'),
	impactTolerance: 12,
	shape: { kind: 'cylinder', radius: 0.3125, height: 0.26 },
	visual: {
		kind: 'parachute',
		palette: { primary: '#d9552b', secondary: '#2a2e35', accent: '#e9ebee' },
		params: { canopy: 4 },
		deploy: canopy
	},
	attach: { bottom: { pos: [0, -0.13, 0], dir: [0, -1, 0], size: 0.625 } },
	crossfeed: false,
	modules: [
		[
			ModuleParachute,
			{
				minPressure: 0.02,
				deployHeight: 2_500,
				semiDragArea: 4,
				fullDragArea: 40,
				riskySpeed: 500,
				unsafeSpeed: 700,
				riskyQ: 120_000,
				unsafeQ: 200_000,
				anchor: [0, 0.13, 0] as [number, number, number]
			}
		]
	],
	stagingIcon: 'parachute'
});
