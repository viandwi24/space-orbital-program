import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleEngine, ModuleResourceContainer } from '../modules.ts';
import { LiquidFuel, Oxidizer, SolidFuel } from '../resources.ts';
import { engineCost, engineMass, lfoxKg, tankDryMass } from './realism.ts';
import { BOOSTER_RADIUS, cylinder, stackNodes, WIDE_RADIUS } from './shared.ts';

/**
 * The LV-T30's dry mass (plan 380, ADR 0317): a first-tier engine, realistic for its era (V-2,
 * Redstone): heavy for its thrust.
 */
const LV_MASS = engineMass('kerolox-early', 215_000);
/** The KR-4's: four chambers on one plate (the RD-107 of 1957 reached 306 s; this one is a first-tier cluster). */
const CLUSTER_MASS = engineMass('kerolox-early', 340_000, 4);
/** The LB-1's: a bare early 0.8 m tank of its 2.5 t of propellant and its 150 kN engine. */
const LIQUID_BOOSTER_MASS =
	tankDryMass(lfoxKg(225), 0.8, 'early') + engineMass('kerolox-early', 150_000);
/** The LV-909's: an early storable vacuum engine (AJ10-104 class). */
const VACUUM_MASS = engineMass('hypergolic-early', 60_000);
/** The RE-I5's: a Merlin 1D class engine. */
const WIDE_MASS = engineMass('kerolox-sl', 650_000);

export const PartEngineLV = definePart({
	id: 'stock.engine-lv',
	title: 'LV-T30 Liquid Engine',
	mass: kg(LV_MASS),
	cost: engineCost('kerolox-early', 215_000),
	impactTolerance: 4,
	shape: cylinder(1.2),
	visual: {
		kind: 'engine',
		palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
		// Thrust along +Y, so the exhaust leaves the bell exit (bottom face) downwards.
		plume: {
			template: { propellant: 'kerolox', chamberPressure: 70 },
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
				ispVacuum: 250,
				ispSeaLevel: 215,
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
	mass: kg(CLUSTER_MASS),
	cost: engineCost('kerolox-early', 340_000),
	impactTolerance: 4,
	shape: cylinder(1.2),
	visual: {
		kind: 'engine-cluster',
		palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
		params: { bells: 4, ring: 0.31, bellExit: 0.2 },
		plume: {
			template: { propellant: 'kerolox', brightness: 0.9, lengthScale: 0.9, chamberPressure: 90 },
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
				ispVacuum: 265,
				ispSeaLevel: 230,
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

/** A solid rocket motor (plan 210, ADR 0203): its own solid fuel, no throttle, no shutdown. */
function solidBooster(spec: {
	id: string;
	title: string;
	/** Dry mass, kg. */
	dry: number;
	radius: number;
	height: number;
	thrust: number;
	ispVacuum: number;
	ispSeaLevel: number;
	/** Solid fuel, u (7.5 kg each). */
	fuel: number;
	bellExit: number;
	plumeLength: number;
}) {
	const h2 = spec.height / 2;
	return definePart({
		id: spec.id,
		title: spec.title,
		mass: kg(spec.dry),
		cost: partCost(spec.dry, 'engine'),
		impactTolerance: 5,
		shape: { kind: 'cylinder', radius: spec.radius, height: spec.height },
		visual: {
			kind: 'booster',
			palette: { primary: '#ecebe6', secondary: '#23272d', accent: '#d9552b' },
			// white with black bands, as solid motors are painted (plan 291 livery)
			params: { bellExit: spec.bellExit, livery: 'bands' },
			plume: {
				template: { propellant: 'solid' },
				module: ModuleEngine.id,
				nozzle: [0, -h2, 0],
				exitRadius: spec.bellExit,
				length: spec.plumeLength,
				exitPressure: 90_000
			}
		},
		attach: {
			top: { pos: [0, h2, 0], dir: [0, 1, 0], size: spec.radius * 2 },
			radial: { pos: [-spec.radius, 0, 0], dir: [-1, 0, 0] }
		},
		crossfeed: false,
		modules: [
			[
				ModuleEngine,
				{
					thrust: spec.thrust,
					ispVacuum: spec.ispVacuum,
					ispSeaLevel: spec.ispSeaLevel,
					propellants: [{ resource: SolidFuel.id, ratio: 1 }],
					solid: true
				}
			],
			[ModuleResourceContainer, { contents: { [SolidFuel.id]: { capacity: spec.fuel } } }]
		],
		stagingIcon: 'engine'
	});
}

/**
 * The BST-1 side booster, a solid motor since plan 210 (ADR 0203; rancangan §15 #8). About the
 * mass of the old liquid one: 330 u of solid fuel, 150 kN, about 33 s at full limiter. It hangs on
 * a radial decoupler's `outer` node or straight on a stack part's side, and takes a nose cone.
 */
export const PartBooster = solidBooster({
	id: 'stock.booster',
	title: 'BST-1 Solid Booster',
	dry: 450,
	radius: BOOSTER_RADIUS,
	height: 3.2,
	thrust: 150_000,
	ispVacuum: 240,
	ispSeaLevel: 215,
	fuel: 330,
	bellExit: 0.3,
	plumeLength: 6
});

/**
 * The liquid side booster (plan 210): the BST-1 as it was before it went solid, a tank and an
 * engine in one part. It takes fuel lines, so it is the asparagus booster.
 */
export const PartBoosterLiquid = definePart({
	id: 'stock.booster-liquid',
	title: 'LB-1 Liquid Booster',
	mass: kg(LIQUID_BOOSTER_MASS),
	cost: partCost(LIQUID_BOOSTER_MASS, 'engine'),
	impactTolerance: 5,
	shape: { kind: 'cylinder', radius: BOOSTER_RADIUS, height: 3.2 },
	visual: {
		kind: 'booster',
		palette: { primary: '#e8ecef', secondary: '#2a4f7a', accent: '#e3a61f' },
		plume: {
			template: { propellant: 'kerolox', chamberPressure: 55 },
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
				ispVacuum: 255,
				ispSeaLevel: 220,
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

/** A small solid motor (plan 210): a kick for light stacks or a separation motor. */
export const PartSrbSmall = solidBooster({
	id: 'stock.srb-small',
	title: 'BST-0 Small Solid Booster',
	dry: 180,
	radius: BOOSTER_RADIUS,
	height: 1.6,
	thrust: 70_000,
	ispVacuum: 230,
	ispSeaLevel: 210,
	fuel: 110,
	bellExit: 0.24,
	plumeLength: 4
});

/** A large 1.25 m solid motor (plan 210): stack or side, 300 kN for about 45 s. */
export const PartSrbLarge = solidBooster({
	id: 'stock.srb-large',
	title: 'BST-3 Large Solid Booster',
	dry: 1_100,
	radius: 0.625,
	height: 6,
	thrust: 300_000,
	ispVacuum: 250,
	ispSeaLevel: 225,
	fuel: 870,
	bellExit: 0.45,
	plumeLength: 9
});

/** A vacuum upper-stage engine (plan 210): high Isp in vacuum, poor at sea level, short and light. */
export const PartEngineVacuum = definePart({
	id: 'stock.engine-vacuum',
	title: 'LV-909 Vacuum Engine',
	mass: kg(VACUUM_MASS),
	cost: engineCost('hypergolic-early', 60_000),
	impactTolerance: 4,
	shape: cylinder(0.9),
	visual: {
		kind: 'engine',
		palette: { primary: '#2d3138', secondary: '#c9ced4', accent: '#3d7fb0' },
		params: { bellExit: 0.5, throat: 0.1 },
		plume: {
			template: { propellant: 'hydrolox', chamberPressure: 30 },
			module: ModuleEngine.id,
			nozzle: [0, -0.45, 0],
			exitRadius: 0.5,
			length: 9,
			exitPressure: 8_000
		},
		articulation: { module: ModuleEngine.id, field: 'gimbal', mode: 'gimbal' }
	},
	attach: stackNodes(0.9),
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 60_000,
				ispVacuum: 280,
				ispSeaLevel: 100,
				propellants: [
					{ resource: LiquidFuel.id, ratio: 0.9 },
					{ resource: Oxidizer.id, ratio: 1.1 }
				],
				gimbal: { range: 4, rate: 20 }
			}
		]
	],
	stagingIcon: 'engine'
});

/** The 2.5 m class main engine (plan 210). */
export const PartEngineWide = definePart({
	id: 'stock.engine-wide',
	title: 'RE-I5 Wide Engine',
	mass: kg(WIDE_MASS),
	cost: engineCost('kerolox-sl', 650_000),
	impactTolerance: 4,
	shape: cylinder(1.8, WIDE_RADIUS),
	visual: {
		kind: 'engine',
		palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
		params: { bellExit: 0.95, throat: 0.3 },
		plume: {
			template: { propellant: 'methalox', chamberPressure: 80 },
			module: ModuleEngine.id,
			nozzle: [0, -0.9, 0],
			exitRadius: 0.95,
			length: 12,
			exitPressure: 90_000
		},
		articulation: { module: ModuleEngine.id, field: 'gimbal', mode: 'gimbal' }
	},
	attach: stackNodes(1.8, 2.5),
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 650_000,
				ispVacuum: 311,
				ispSeaLevel: 282,
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
