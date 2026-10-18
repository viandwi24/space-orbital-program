import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleEngine, ModuleResourceContainer } from '../modules.ts';
import { LiquidFuel, Oxidizer } from '../resources.ts';
import { BOOSTER_RADIUS, cylinder, stackNodes } from './shared.ts';

export const PartEngineLV = definePart({
	id: 'stock.engine-lv',
	title: 'LV-T30 Liquid Engine',
	mass: kg(1_250),
	cost: partCost(1_250, 'engine'),
	impactTolerance: 4,
	maxTemperature: 1800,
	shape: cylinder(1.2),
	visual: {
		kind: 'engine',
		palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
		// Thrust along +Y, so the exhaust leaves the bell exit (bottom face) downwards.
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -0.6, 0],
			exitRadius: 0.46,
			length: 7,
			exitPressure: 90_000
		},
		// The bell and chamber swing with the thrust vector (ADR 0045).
		articulation: { module: ModuleEngine.id, field: 'gimbal', mode: 'gimbal' }
	},
	attach: stackNodes(1.2),
	// An engine draws propellant but does not pass it through to whatever hangs below it.
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 215_000,
				ispVacuum: 300,
				ispSeaLevel: 280,
				propellants: [
					{ resource: LiquidFuel.id, ratio: 0.9 },
					{ resource: Oxidizer.id, ratio: 1.1 }
				],
				gimbal: { range: 3, rate: 20 }
			}
		]
	],
	stagingIcon: 'engine'
});

/**
 * A cluster of four small bells on one thrust plate (plan 040, ADR 0081): more thrust than the
 * LV-T30 for a little more mass, and each bell has its own plume. The bells swing together.
 * `visual.plume.nozzles` must equal the renderer's `clusterLayout(4, 0.31, -0.6)` (a test pins it).
 */
export const PartEngineCluster = definePart({
	id: 'stock.engine-cluster',
	title: 'KR-4 Cluster Engine',
	mass: kg(1_850),
	cost: partCost(1_850, 'engine'),
	impactTolerance: 4,
	maxTemperature: 1800,
	shape: cylinder(1.2),
	visual: {
		kind: 'engine-cluster',
		palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
		params: { bells: 4, ring: 0.31, bellExit: 0.2 },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -0.6, 0],
			nozzles: [
				[0.219203, -0.6, 0.219203],
				[-0.219203, -0.6, 0.219203],
				[-0.219203, -0.6, -0.219203],
				[0.219203, -0.6, -0.219203]
			],
			exitRadius: 0.2,
			length: 5.5,
			exitPressure: 90_000
		},
		articulation: { module: ModuleEngine.id, field: 'gimbal', mode: 'gimbal' }
	},
	attach: stackNodes(1.2),
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 340_000,
				ispVacuum: 295,
				ispSeaLevel: 272,
				propellants: [
					{ resource: LiquidFuel.id, ratio: 0.9 },
					{ resource: Oxidizer.id, ratio: 1.1 }
				],
				gimbal: { range: 2, rate: 16 }
			}
		]
	],
	stagingIcon: 'engine'
});

/**
 * A side booster: a tank and an engine in one part, 3.2 m tall. It feeds only its own engine
 * (`crossfeed: false`), hangs on a radial decoupler's `outer` node or straight on a stack part's
 * side, and can be capped with a nose cone.
 */
export const PartBooster = definePart({
	id: 'stock.booster',
	title: 'BST-1 Booster',
	mass: kg(450),
	cost: partCost(450, 'engine'),
	impactTolerance: 5,
	maxTemperature: 1500,
	shape: { kind: 'cylinder', radius: BOOSTER_RADIUS, height: 3.2 },
	visual: {
		kind: 'booster',
		palette: { primary: '#ecebe6', secondary: '#23272d', accent: '#d9552b' },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -1.6, 0],
			exitRadius: 0.3,
			length: 6,
			exitPressure: 90_000
		}
	},
	attach: {
		top: { pos: [0, 1.6, 0], dir: [0, 1, 0], size: BOOSTER_RADIUS * 2 },
		radial: { pos: [-BOOSTER_RADIUS, 0, 0], dir: [-1, 0, 0] }
	},
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 150_000,
				ispVacuum: 270,
				ispSeaLevel: 250,
				propellants: [
					{ resource: LiquidFuel.id, ratio: 0.9 },
					{ resource: Oxidizer.id, ratio: 1.1 }
				]
			}
		],
		[
			ModuleResourceContainer,
			{ contents: { [LiquidFuel.id]: { capacity: 225 }, [Oxidizer.id]: { capacity: 275 } } }
		]
	],
	stagingIcon: 'engine'
});
