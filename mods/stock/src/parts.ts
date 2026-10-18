import { definePart, kg, type PartShape } from '@orbital/sdk';
import { partCost } from './costs.ts';
import {
	ModuleCommand,
	ModuleControlSurface,
	ModuleDecoupler,
	ModuleEngine,
	ModuleFin,
	ModuleHeatShield,
	ModuleLandingLeg,
	ModuleWheel,
	ModuleReactionWheel,
	ModuleResourceContainer,
	ModuleScrubber,
	ModuleWing
} from './modules.ts';
import {
	ElectricCharge,
	Food,
	LiquidFuel,
	Oxidizer,
	Oxygen,
	Supplies,
	Water
} from './resources.ts';
import { ModuleDataStorage } from './data.ts';
import {
	ExperimentAtmosphereSample,
	ExperimentPressure,
	ExperimentSeismic,
	ExperimentSurfaceSample,
	ExperimentTemperature,
	ModuleExperiment
} from './science.ts';
import { AntennaDish, AntennaWhip, ModuleAntenna } from './comms.ts';

/** Every stock part is a 1.25 m class cylinder: radius in metres. */
const RADIUS = 0.625;

type Vec3Tuple = [number, number, number];

/**
 * Stack parts attach end to end along local Y: `top` faces +Y, `bottom` faces -Y, both on the
 * axis at half the part height. `dir` points away from the part.
 */
function stackNodes(height: number): Record<'top' | 'bottom', { pos: Vec3Tuple; dir: Vec3Tuple }> {
	return {
		top: { pos: [0, height / 2, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -height / 2, 0], dir: [0, -1, 0] }
	};
}

/** Defaults of the landing-leg module; the leg visual must match its colliders (tested). */
export const LEG_SPREAD = 2;
export const LEG_DROP = 0.4;
export const LEG_FOOT_SIZE = 0.3;

const cylinder = (height: number): PartShape => ({ kind: 'cylinder', radius: RADIUS, height });

export const PartCommandPod = definePart({
	id: 'stock.command-pod',
	title: 'Command Pod',
	mass: kg(840),
	crewCapacity: 1,
	cost: partCost(840, 'command'),
	impactTolerance: 10,
	maxTemperature: 1000,
	shape: cylinder(1),
	visual: {
		kind: 'capsule',
		palette: { primary: '#e9ebee', secondary: '#2b2f36', accent: '#e0572b' }
	},
	attach: stackNodes(1),
	modules: [
		[ModuleCommand],
		[ModuleResourceContainer, { contents: { [ElectricCharge.id]: { capacity: 50 } } }]
	],
	stagingIcon: 'command'
});

export const PartReactionWheel = definePart({
	id: 'stock.reaction-wheel',
	title: 'Reaction Wheel',
	mass: kg(100),
	cost: partCost(100, 'command'),
	impactTolerance: 6,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'reaction-wheel',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#2f8fa3' }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleReactionWheel, { torque: 5_000, chargeRate: 0.6 }]],
	stagingIcon: 'wheel'
});

/** A data drive: 64 Mbit of storage for data items (plan 083). */
export const PartDataDrive = definePart({
	id: 'stock.data-drive',
	title: 'Data Drive',
	mass: kg(20),
	cost: partCost(20, 'command'),
	impactTolerance: 8,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#2a2e35', secondary: '#d5d8dc', accent: '#2f8fa3' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleDataStorage, { capacity: 64 * 1024 * 1024 }]]
});

export const PartTankSmall = definePart({
	id: 'stock.tank-small',
	title: 'Small Fuel Tank',
	mass: kg(250),
	cost: partCost(250, 'tank'),
	impactTolerance: 5,
	maxTemperature: 900,
	shape: cylinder(2),
	visual: {
		kind: 'tank',
		palette: { primary: '#eceee9', secondary: '#23272d', accent: '#e0572b' },
		params: { stripe: 0.3, bands: 1 }
	},
	attach: stackNodes(2),
	modules: [
		[
			ModuleResourceContainer,
			{
				contents: {
					[LiquidFuel.id]: { capacity: 400 },
					[Oxidizer.id]: { capacity: 490 }
				}
			}
		]
	],
	stagingIcon: 'tank'
});

export const PartTankMedium = definePart({
	id: 'stock.tank-medium',
	title: 'Medium Fuel Tank',
	mass: kg(500),
	cost: partCost(500, 'tank'),
	impactTolerance: 5,
	maxTemperature: 900,
	shape: cylinder(4),
	visual: {
		kind: 'tank',
		palette: { primary: '#e6e3da', secondary: '#d9602a', accent: '#23272d' },
		params: { stripe: 0.55, bands: 3 }
	},
	attach: stackNodes(4),
	modules: [
		[
			ModuleResourceContainer,
			{
				contents: {
					[LiquidFuel.id]: { capacity: 800 },
					[Oxidizer.id]: { capacity: 980 }
				}
			}
		]
	],
	stagingIcon: 'tank'
});

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

export const PartDecoupler = definePart({
	id: 'stock.decoupler',
	title: 'Stack Decoupler',
	mass: kg(50),
	cost: partCost(50, 'structure'),
	impactTolerance: 8,
	maxTemperature: 1000,
	shape: cylinder(0.2),
	visual: {
		kind: 'decoupler',
		palette: { primary: '#3b4047', accent: '#e3a61f' }
	},
	attach: stackNodes(0.2),
	// Stages are separated by decouplers: no propellant crosses them.
	crossfeed: false,
	modules: [[ModuleDecoupler, { separates: 'top', ejectionImpulse: 2_000 }]],
	stagingIcon: 'decoupler'
});

/**
 * A ring of four landing legs under the stack. Retracted it is a thin disc; deployed (action or
 * stage) it adds four feet 2 m from the axis, which carry the vessel and tolerate hard landings.
 */
export const PartLandingLegs = definePart({
	id: 'stock.landing-legs',
	title: 'Landing Legs',
	mass: kg(150),
	cost: partCost(150, 'gear'),
	impactTolerance: 12,
	maxTemperature: 1000,
	shape: cylinder(0.3),
	visual: {
		kind: 'landing-legs',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35' },
		params: { spread: LEG_SPREAD, drop: LEG_DROP, footSize: LEG_FOOT_SIZE },
		deploy: { module: ModuleLandingLeg.id, flag: 'deployed', seconds: 1.2 }
	},
	attach: stackNodes(0.3),
	modules: [[ModuleLandingLeg, {}]],
	stagingIcon: 'legs'
});

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

/** Radius of the radial booster and the nose cone that caps it, m. */
const BOOSTER_RADIUS = 0.4;

/**
 * A plate that bolts to the side of a stack part (radial attachment, ADR 0034) and carries a
 * booster on its `outer` face. Staged, it fires the `radial` link: it leaves with the booster.
 * Boosters are staged with symmetric copies, so the pushes cancel.
 */
export const PartRadialDecoupler = definePart({
	id: 'stock.radial-decoupler',
	title: 'Radial Decoupler',
	mass: kg(40),
	cost: partCost(40, 'structure'),
	impactTolerance: 8,
	maxTemperature: 1000,
	shape: { kind: 'box', size: [0.2, 0.6, 0.45] },
	visual: {
		kind: 'radial-decoupler',
		palette: { primary: '#3b4047', accent: '#e3a61f' }
	},
	attach: {
		radial: { pos: [-0.1, 0, 0], dir: [-1, 0, 0] },
		outer: { pos: [0.1, 0, 0], dir: [1, 0, 0] }
	},
	crossfeed: false,
	modules: [[ModuleDecoupler, { separates: 'radial', ejectionImpulse: 4_000 }]],
	stagingIcon: 'decoupler'
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
		top: { pos: [0, 1.6, 0], dir: [0, 1, 0] },
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

/** A cone for the top of a booster. Less drag than a flat cap (`dragCoefficient`). */
export const PartNoseCone = definePart({
	id: 'stock.nose-cone',
	title: 'Nose Cone',
	mass: kg(25),
	cost: partCost(25, 'structure'),
	impactTolerance: 6,
	maxTemperature: 1200,
	dragCoefficient: 0.12,
	shape: { kind: 'cylinder', radius: BOOSTER_RADIUS, height: 0.9 },
	visual: { kind: 'nose-cone', palette: { primary: '#d9552b', secondary: '#23272d' } },
	attach: { bottom: { pos: [0, -0.45, 0], dir: [0, -1, 0] } },
	crossfeed: false,
	stagingIcon: 'cone'
});

/**
 * A fixed fin, 1.1 m span, 1.8 m root chord (about 1.5 m² of plate), attached radially (span outwards). Four of them near the
 * bottom of a rocket move its centre of pressure behind the centre of mass (ADR 0035).
 */
export const PartFin = definePart({
	id: 'stock.fin',
	title: 'Fin',
	mass: kg(30),
	cost: partCost(30, 'structure'),
	impactTolerance: 4,
	maxTemperature: 1000,
	shape: { kind: 'box', size: [1.1, 1.8, 0.06] },
	visual: { kind: 'fin', palette: { primary: '#d5d8dc', secondary: '#23272d', accent: '#d9552b' } },
	attach: { radial: { pos: [-0.55, 0, 0], dir: [-1, 0, 0] } },
	crossfeed: false,
	modules: [[ModuleFin, { area: 1.5, liftSlope: 2, crossflow: 1.2, centre: [0, -0.15, 0] }]],
	stagingIcon: 'fin'
});

/**
 * A control surface: a fin whose plate turns by the attitude demand (ADR 0045), 1 m span, 1.6 m
 * chord, attached radially. Placed behind the centre of mass like a fin it also stabilises; a pair
 * on opposite sides steers pitch or yaw, all four roll.
 */
export const PartControlSurface = definePart({
	id: 'stock.control-surface',
	title: 'Control Surface',
	mass: kg(45),
	cost: partCost(45, 'structure'),
	impactTolerance: 4,
	maxTemperature: 1000,
	shape: { kind: 'box', size: [1, 1.6, 0.07] },
	visual: {
		kind: 'control-surface',
		palette: { primary: '#d5d8dc', secondary: '#23272d', accent: '#2f8fa3' },
		articulation: { module: ModuleControlSurface.id, field: 'deflection', mode: 'hinge' }
	},
	attach: { radial: { pos: [-0.5, 0, 0], dir: [-1, 0, 0] } },
	crossfeed: false,
	modules: [
		[
			ModuleControlSurface,
			{
				area: 1.2,
				liftSlope: 2,
				crossflow: 1.2,
				centre: [0, -0.1, 0],
				maxDeflection: 25,
				deflectionRate: 60
			}
		]
	],
	stagingIcon: 'fin'
});

/**
 * A wing half, 3 m span and 1 m chord (3 m² of plate), attached radially (span outwards). A pair
 * on opposite sides is a 6 m wing of aspect ratio 6: lift slope 4.5 per radian, `(L/D)max` of the
 * wing alone about 14 (ADR 0075). The aerodynamic centre sits a quarter chord behind the leading
 * edge (+Y is the nose). Tilt it about its span for incidence; control surfaces hang on its
 * trailing edge.
 */
export const PartWing = definePart({
	id: 'stock.wing',
	title: 'Wing',
	mass: kg(90),
	cost: partCost(90, 'structure'),
	impactTolerance: 4,
	maxTemperature: 1000,
	// A thin section: the part drag of its faces is small (the module has its own parasite drag).
	dragCoefficient: 0.05,
	shape: { kind: 'box', size: [3, 1, 0.08] },
	visual: {
		kind: 'wing',
		palette: { primary: '#e4e6e8', secondary: '#23272d', accent: '#d9552b' }
	},
	attach: { radial: { pos: [-1.5, 0, 0], dir: [-1, 0, 0] } },
	crossfeed: false,
	modules: [
		[
			ModuleWing,
			// flaps (plan 063, ADR 0161 point 4): +0.6 C_L, +0.05 C_D, 3 degrees of stall at full flap
			{ area: 3, aspectRatio: 6, centre: [0, 0.25, 0], flapLift: 0.6, flapDrag: 0.05, flapStall: 3 }
		]
	],
	stagingIcon: 'fin'
});

/** Radius of the connector parts' stubs, m. */
const CONNECTOR_RADIUS = 0.04;

const connectorNode = {
	end: { pos: [-CONNECTOR_RADIUS, 0, 0] as Vec3Tuple, dir: [-1, 0, 0] as Vec3Tuple }
};

/**
 * A strut: a rigid bar from the part it hangs on to a second part (ADR 0071). The vessel is one
 * rigid body (ADR 0018), so it adds no stiffness; it adds its mass and drag and is cut when a
 * separation puts its two ends on different vessels.
 */
export const PartStrut = definePart({
	id: 'stock.strut',
	title: 'Strut',
	mass: kg(20),
	cost: partCost(20, 'structure'),
	impactTolerance: 3,
	maxTemperature: 1000,
	connector: {},
	shape: { kind: 'cylinder', radius: CONNECTOR_RADIUS, height: 0.1 },
	visual: { kind: 'strut', palette: { primary: '#aeb4bc', secondary: '#23272d' } },
	attach: connectorNode,
	crossfeed: false
});

/**
 * A fuel line: propellant of the part it hangs on is drawn by whatever draws on the part its far
 * end lands on, ahead of that part's own (ADR 0071). One way: it does not carry fuel back.
 */
export const PartFuelLine = definePart({
	id: 'stock.fuel-line',
	title: 'Fuel Line',
	mass: kg(10),
	cost: partCost(10, 'structure'),
	impactTolerance: 3,
	maxTemperature: 1000,
	connector: { feeds: true },
	shape: { kind: 'cylinder', radius: CONNECTOR_RADIUS, height: 0.1 },
	visual: { kind: 'fuel-line', palette: { primary: '#d9552b', secondary: '#23272d' } },
	attach: connectorNode,
	crossfeed: false
});

// ---------------------------------------------------------------------------------------------
// Science instruments (plan 103, ADR 0178): small stack parts, each running one experiment.
// ---------------------------------------------------------------------------------------------

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
// Probe core and antennas (plan 114, ADR 0179)
// ---------------------------------------------------------------------------------------------

/** A probe core: a control source without seats, with a whip antenna and a small battery. */
export const PartProbeCore = definePart({
	id: 'stock.probe-core',
	title: 'Probe Core',
	mass: kg(50),
	cost: partCost(50, 'command'),
	impactTolerance: 8,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#2a2e35', secondary: '#d5d8dc', accent: '#e0572b' },
		params: { stripe: 0.5, bands: 2 }
	},
	attach: stackNodes(0.4),
	modules: [
		[ModuleCommand],
		[ModuleAntenna, { antenna: AntennaWhip.id }],
		[ModuleResourceContainer, { contents: { [ElectricCharge.id]: { capacity: 20 } } }]
	],
	stagingIcon: 'command'
});

function antennaPart(id: string, title: string, massKg: number, antenna: string, accent: string) {
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'command'),
		impactTolerance: 6,
		maxTemperature: 1000,
		shape: cylinder(0.4),
		visual: {
			kind: 'tank',
			palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent },
			params: { stripe: 0.5, bands: 1 }
		},
		attach: stackNodes(0.4),
		modules: [[ModuleAntenna, { antenna }]]
	});
}

export const PartWhipAntenna = antennaPart(
	'stock.whip-antenna',
	'Whip Antenna',
	5,
	AntennaWhip.id,
	'#f2c14e'
);
export const PartDishAntenna = antennaPart(
	'stock.dish-antenna',
	'Dish Antenna',
	60,
	AntennaDish.id,
	'#f28c28'
);

export const STOCK_COMMS_PARTS = [PartProbeCore, PartWhipAntenna, PartDishAntenna] as const;

// ---------------------------------------------------------------------------------------------
// Life support (plan 107, ADR 0181 point 10)
// ---------------------------------------------------------------------------------------------

/** Six crew-days of every consumable (supplies for `simple`; oxygen, water and food for `full`). */
export const PartLifeSupportPack = definePart({
	id: 'stock.life-support-pack',
	title: 'Life Support Pack',
	mass: kg(60),
	cost: partCost(60, 'tank'),
	impactTolerance: 6,
	maxTemperature: 900,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#e9ebee', secondary: '#2a2e35', accent: '#4caf6e' },
		params: { stripe: 0.5, bands: 2 }
	},
	attach: stackNodes(0.4),
	modules: [
		[
			ModuleResourceContainer,
			{
				contents: {
					[Supplies.id]: { capacity: 6 },
					[Oxygen.id]: { capacity: 6 },
					[Water.id]: { capacity: 6 },
					[Food.id]: { capacity: 6 }
				}
			}
		]
	]
});

/** A CO2 scrubber for three people. */
export const PartScrubber = definePart({
	id: 'stock.scrubber',
	title: 'CO2 Scrubber',
	mass: kg(40),
	cost: partCost(40, 'command'),
	impactTolerance: 6,
	maxTemperature: 1000,
	shape: cylinder(0.4),
	visual: {
		kind: 'tank',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#4caf6e' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: stackNodes(0.4),
	modules: [[ModuleScrubber, { crew: 3, charge: 10 }]]
});

export const STOCK_LIFE_SUPPORT_PARTS = [PartLifeSupportPack, PartScrubber] as const;

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

/**
 * Landing gear (plan 063, ADR 0161 point 2): a strut with a wheel at its outer end, hung radially
 * under a fuselage; the wheel rolls along the vessel's nose (+Y) and its brakes are a toggle.
 */
const wheelPart = (id: string, title: string, steer: number) =>
	definePart({
		id,
		title,
		mass: kg(40),
		cost: partCost(40, 'structure'),
		impactTolerance: 6,
		maxTemperature: 1200,
		shape: { kind: 'box', size: [0.4, 0.3, 0.2] },
		visual: {
			kind: 'gear',
			palette: { primary: '#2b2f36', secondary: '#c9ccd1', accent: '#d9552b' },
			params: { offset: 0.45, radius: 0.3, width: 0.15 }
		},
		attach: { radial: { pos: [-0.2, 0, 0], dir: [-1, 0, 0] } },
		crossfeed: false,
		modules: [[ModuleWheel, { radius: 0.3, width: 0.15, offset: [0.45, 0, 0], steer }]],
		stagingIcon: 'legs'
	});

export const PartWheel = wheelPart('stock.wheel', 'Wheel', 0);
export const PartWheelSteer = wheelPart('stock.wheel-steer', 'Steering wheel', 20);
