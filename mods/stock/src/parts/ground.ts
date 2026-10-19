import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleLaunchClamp } from '../launch-clamp.ts';
import { ModuleLandingLeg, ModuleWheel } from '../modules.ts';
import { cylinder, stackNodes } from './shared.ts';

/** Defaults of the landing-leg module; the leg visual must match its colliders (tested). */
export const LEG_SPREAD = 2;
export const LEG_DROP = 0.4;
export const LEG_FOOT_SIZE = 0.3;

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

/**
 * A launch clamp (plan 210, ADR 0203): bolts to the side of a stack, holds the rocket on the pad
 * and feeds it electric charge until staged. Its tower reaches down to the pad at the launch
 * (`extend` articulation); it stays on the pad when the rocket leaves.
 */
export const PartLaunchClamp = definePart({
	id: 'stock.launch-clamp',
	title: 'TT18 Launch Clamp',
	mass: kg(100),
	cost: partCost(100, 'structure'),
	impactTolerance: 50,
	shape: { kind: 'box', size: [0.4, 0.8, 0.4] },
	visual: {
		kind: 'launch-clamp',
		palette: { primary: '#d9a33a', secondary: '#2c3036', accent: '#9aa1aa' },
		articulation: { module: ModuleLaunchClamp.id, field: 'height', mode: 'extend' }
	},
	attach: { radial: { pos: [-0.2, 0, 0], dir: [-1, 0, 0] } },
	crossfeed: false,
	modules: [[ModuleLaunchClamp, {}]],
	stagingIcon: 'decoupler'
});
