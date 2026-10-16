import { definePart, kg, type PartShape } from '@orbital/sdk';
import {
	ModuleCommand,
	ModuleControlSurface,
	ModuleDecoupler,
	ModuleEngine,
	ModuleFin,
	ModuleHeatShield,
	ModuleLandingLeg,
	ModuleReactionWheel,
	ModuleResourceContainer
} from './modules.ts';
import { ElectricCharge, LiquidFuel, Oxidizer } from './resources.ts';

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

export const PartTankSmall = definePart({
	id: 'stock.tank-small',
	title: 'Small Fuel Tank',
	mass: kg(250),
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

export const PartDecoupler = definePart({
	id: 'stock.decoupler',
	title: 'Stack Decoupler',
	mass: kg(50),
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
