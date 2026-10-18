import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleControlSurface, ModuleFin, ModuleWing } from '../modules.ts';
import { BOOSTER_RADIUS } from './shared.ts';

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
