/**
 * Rover parts (plan 307): wheels in three sizes, fixed and steering, with their motors on, and a
 * flat chassis with a battery. The wheel module is the landing gear's (ADR 0161, plan 260): the
 * tyre rolls along the part's +Y, so a rover is built nose along +Y and launched lying level.
 */
import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleResourceContainer, ModuleWheel } from '../modules.ts';
import { ElectricCharge } from '../resources.ts';

const ROVER = { primary: '#e9ebee', secondary: '#2a2e35', accent: '#e3a61f' };

function roverWheel(spec: {
	id: string;
	title: string;
	massKg: number;
	radius: number;
	width: number;
	reach: number;
	steer: number;
	drive: number;
	charge: number;
	topSpeed: number;
}) {
	const mount: [number, number, number] = [
		Math.max(0.3, spec.radius * 0.6),
		spec.radius * 0.8,
		spec.width + 0.1
	];
	return definePart({
		id: spec.id,
		title: spec.title,
		mass: kg(spec.massKg),
		cost: partCost(spec.massKg, 'gear'),
		impactTolerance: 10,
		shape: { kind: 'box', size: mount },
		visual: {
			kind: 'rover-wheel',
			palette: ROVER,
			params: { offset: spec.reach, radius: spec.radius, width: spec.width }
		},
		attach: { radial: { pos: [-mount[0] / 2, 0, 0], dir: [-1, 0, 0] } },
		crossfeed: false,
		modules: [
			[
				ModuleWheel,
				{
					radius: spec.radius,
					width: spec.width,
					offset: [spec.reach, 0, 0],
					steer: spec.steer,
					grip: 1,
					rolling: 0.03,
					driveForce: spec.drive,
					driveCharge: spec.charge,
					topSpeed: spec.topSpeed,
					motorOn: true
				}
			]
		],
		stagingIcon: 'legs'
	});
}

export const PartRoverWheelSmall = roverWheel({
	id: 'stock.rover-wheel-s',
	title: 'OrbitX RW-1 "Pebble"',
	massKg: 60,
	radius: 0.25,
	width: 0.16,
	reach: 0.45,
	steer: 0,
	drive: 500,
	charge: 0.4,
	topSpeed: 8
});

export const PartRoverWheelSmallSteer = roverWheel({
	id: 'stock.rover-wheel-s-steer',
	title: 'OrbitX RW-1S "Pebble"',
	massKg: 65,
	radius: 0.25,
	width: 0.16,
	reach: 0.45,
	steer: 25,
	drive: 500,
	charge: 0.4,
	topSpeed: 8
});

export const PartRoverWheelMedium = roverWheel({
	id: 'stock.rover-wheel-m',
	title: 'OrbitX RW-2 "Trekker"',
	massKg: 150,
	radius: 0.42,
	width: 0.26,
	reach: 0.7,
	steer: 0,
	drive: 1_200,
	charge: 1,
	topSpeed: 12
});

export const PartRoverWheelMediumSteer = roverWheel({
	id: 'stock.rover-wheel-m-steer',
	title: 'OrbitX RW-2S "Trekker"',
	massKg: 160,
	radius: 0.42,
	width: 0.26,
	reach: 0.7,
	steer: 22,
	drive: 1_200,
	charge: 1,
	topSpeed: 12
});

export const PartRoverWheelLarge = roverWheel({
	id: 'stock.rover-wheel-l',
	title: 'OrbitX RW-3 "Hauler"',
	massKg: 420,
	radius: 0.75,
	width: 0.42,
	reach: 1.15,
	steer: 15,
	drive: 4_000,
	charge: 2.5,
	topSpeed: 10
});

/** A flat rover deck: nose along +Y, a battery inside, wheels hung under its sides. */
export const PartRoverChassis = definePart({
	id: 'stock.rover-chassis',
	title: 'OrbitX RV-C "Deck"',
	mass: kg(350),
	cost: partCost(350, 'structure'),
	impactTolerance: 12,
	shape: { kind: 'box', size: [1.6, 2.6, 0.35] },
	visual: { kind: 'rover-chassis', palette: ROVER },
	attach: {
		top: { pos: [0, 1.3, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -1.3, 0], dir: [0, -1, 0] },
		deck: { pos: [0, 0, 0.175], dir: [0, 0, 1] }
	},
	modules: [[ModuleResourceContainer, { contents: { [ElectricCharge.id]: { capacity: 600 } } }]]
});

export const STOCK_ROVER_PARTS = [
	PartRoverChassis,
	PartRoverWheelSmall,
	PartRoverWheelSmallSteer,
	PartRoverWheelMedium,
	PartRoverWheelMediumSteer,
	PartRoverWheelLarge
];
