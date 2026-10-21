/**
 * Robotic parts (plan 306, ADR 0269): hinges, rotation servos, a rotor and pistons. Each moves the
 * parts on its top node; the base stays with what it sits on. Titles follow ADR 0255 and 0268.
 */
import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleRobotic, type RoboticConfig } from '../robotics.ts';
import { stackNodes } from './shared.ts';

const ROBOT = { primary: '#e9ebee', secondary: '#2a2e35', accent: '#e3a61f' };

type Joint = Partial<RoboticConfig> & Pick<RoboticConfig, 'kind'>;

function robotic(spec: {
	id: string;
	title: string;
	massKg: number;
	shape:
		| { kind: 'box'; size: [number, number, number] }
		| { kind: 'cylinder'; radius: number; height: number };
	node: number;
	visual: 'hinge-joint' | 'rotary-joint' | 'piston-joint';
	params?: Record<string, number>;
	articulation: 'hinge' | 'spin' | 'slide';
	joint: Joint;
}) {
	const height = spec.shape.kind === 'box' ? spec.shape.size[1] : spec.shape.height;
	return definePart({
		id: spec.id,
		title: spec.title,
		mass: kg(spec.massKg),
		cost: partCost(spec.massKg, 'command'),
		impactTolerance: 10,
		shape: spec.shape,
		visual: {
			kind: spec.visual,
			palette: ROBOT,
			...(spec.params ? { params: spec.params } : {}),
			articulation: { module: ModuleRobotic.id, field: 'pose', mode: spec.articulation }
		},
		// a hinge's plates are not round: its nodes carry no size (no seam ring, no shroud)
		attach:
			spec.shape.kind === 'box'
				? {
						top: { pos: [0, height / 2, 0], dir: [0, 1, 0] },
						bottom: { pos: [0, -height / 2, 0], dir: [0, -1, 0] }
					}
				: stackNodes(height, spec.node),
		modules: [[ModuleRobotic, spec.joint]]
	});
}

export const PartHingeSmall = robotic({
	id: 'stock.hinge-s',
	title: 'OrbitX RH-1 "Knuckle"',
	massKg: 40,
	shape: { kind: 'box', size: [0.5, 0.4, 0.3] },
	node: 0.625,
	visual: 'hinge-joint',
	articulation: 'hinge',
	joint: { kind: 'hinge', min: -90, max: 90, speed: 30, power: 0.4 }
});

export const PartHingeMedium = robotic({
	id: 'stock.hinge-m',
	title: 'OrbitX RH-2 "Elbow"',
	massKg: 160,
	shape: { kind: 'box', size: [1.1, 0.8, 0.6] },
	node: 1.25,
	visual: 'hinge-joint',
	articulation: 'hinge',
	joint: { kind: 'hinge', min: -90, max: 90, speed: 20, power: 1.5 }
});

export const PartServoSmall = robotic({
	id: 'stock.servo-s',
	title: 'OrbitX RS-1 "Swivel"',
	massKg: 50,
	shape: { kind: 'cylinder', radius: 0.3125, height: 0.3 },
	node: 0.625,
	visual: 'rotary-joint',
	articulation: 'spin',
	joint: { kind: 'servo', min: -180, max: 180, speed: 40, power: 0.4 }
});

export const PartServoMedium = robotic({
	id: 'stock.servo-m',
	title: 'OrbitX RS-2 "Turntable"',
	massKg: 180,
	shape: { kind: 'cylinder', radius: 0.625, height: 0.45 },
	node: 1.25,
	visual: 'rotary-joint',
	articulation: 'spin',
	joint: { kind: 'servo', min: -180, max: 180, speed: 25, power: 1.5 }
});

export const PartRotorSmall = robotic({
	id: 'stock.rotor-s',
	title: 'OrbitX RR-1 "Spinner"',
	massKg: 70,
	shape: { kind: 'cylinder', radius: 0.3125, height: 0.35 },
	node: 0.625,
	visual: 'rotary-joint',
	params: { rotor: 1 },
	articulation: 'spin',
	joint: { kind: 'rotor', speed: 30, power: 1 }
});

export const PartPistonSmall = robotic({
	id: 'stock.piston-s',
	title: 'OrbitX RP-1 "Ram"',
	massKg: 45,
	shape: { kind: 'cylinder', radius: 0.3125, height: 0.8 },
	node: 0.625,
	visual: 'piston-joint',
	params: { travel: 0.65 },
	articulation: 'slide',
	joint: { kind: 'piston', min: 0, max: 0.6, speed: 0.25, power: 0.4 }
});

export const PartPistonMedium = robotic({
	id: 'stock.piston-m',
	title: 'OrbitX RP-2 "Jack"',
	massKg: 170,
	shape: { kind: 'cylinder', radius: 0.625, height: 1.4 },
	node: 1.25,
	visual: 'piston-joint',
	params: { travel: 1.2 },
	articulation: 'slide',
	joint: { kind: 'piston', min: 0, max: 1.1, speed: 0.2, power: 1.5 }
});

export const STOCK_ROBOTIC_PARTS = [
	PartHingeSmall,
	PartHingeMedium,
	PartServoSmall,
	PartServoMedium,
	PartRotorSmall,
	PartPistonSmall,
	PartPistonMedium
];
