import { definePart, kg, type PartShape } from '@orbital/sdk';
import {
	ModuleCommand,
	ModuleDecoupler,
	ModuleEngine,
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

const cylinder = (height: number): PartShape => ({ kind: 'cylinder', radius: RADIUS, height });

export const PartCommandPod = definePart({
	id: 'stock.command-pod',
	title: 'Command Pod',
	mass: kg(840),
	shape: cylinder(1),
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
	shape: cylinder(0.4),
	attach: stackNodes(0.4),
	modules: [[ModuleReactionWheel, { torque: 5_000, chargeRate: 0.6 }]],
	stagingIcon: 'wheel'
});

export const PartTankSmall = definePart({
	id: 'stock.tank-small',
	title: 'Small Fuel Tank',
	mass: kg(250),
	shape: cylinder(2),
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
	shape: cylinder(4),
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
	shape: cylinder(1.2),
	attach: stackNodes(1.2),
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
				]
			}
		]
	],
	stagingIcon: 'engine'
});

export const PartDecoupler = definePart({
	id: 'stock.decoupler',
	title: 'Stack Decoupler',
	mass: kg(50),
	shape: cylinder(0.2),
	attach: stackNodes(0.2),
	modules: [[ModuleDecoupler, { separates: 'top', ejectionImpulse: 2_000 }]],
	stagingIcon: 'decoupler'
});
