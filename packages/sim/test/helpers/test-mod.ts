/** A test mod: the stock engine without gimbal, for comparing flights with and without thrust vector control. */
import Stock, { ModuleEngine, ModuleFin } from '@orbital/mod-stock';
import { definePart, definePlugin, kg } from '@orbital/sdk';
import { createSim, type Sim } from '../../src/index.ts';
import { rapier } from './vessels.ts';

export const THRUST = 215_000;

const engineConfig = () => ({
	thrust: THRUST,
	ispVacuum: 300,
	ispSeaLevel: 280,
	propellants: [
		{ resource: 'stock.liquid-fuel', ratio: 0.9 },
		{ resource: 'stock.oxidizer', ratio: 1.1 }
	]
});

/** The stock engine without gimbal, for comparisons. */
export const FixedEngine = definePart({
	id: 'test.engine-fixed',
	title: 'Fixed engine',
	mass: kg(1_250),
	shape: { kind: 'cylinder', radius: 0.625, height: 1.2 },
	attach: {
		top: { pos: [0, 0.6, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -0.6, 0], dir: [0, -1, 0] }
	},
	crossfeed: false,
	modules: [[ModuleEngine, engineConfig()]]
});
/** The stock fin without the added damping (ADR 0046): the plan-026 force. */
export const UndampedFin = definePart({
	id: 'test.fin-undamped',
	title: 'Undamped fin',
	mass: kg(30),
	shape: { kind: 'box', size: [1.1, 1.8, 0.06] },
	attach: { radial: { pos: [-0.55, 0, 0], dir: [-1, 0, 0] } },
	crossfeed: false,
	modules: [
		[ModuleFin, { area: 1.5, liftSlope: 2, crossflow: 1.2, centre: [0, -0.15, 0], damping: 0 }]
	]
});

export const TestMod = definePlugin({
	meta: { id: 'test', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.parts.register(FixedEngine);
		ctx.parts.register(UndampedFin);
	}
});

export const newTestSim = (): Promise<Sim> =>
	createSim({ plugins: [Stock, TestMod], backendFactory: rapier(), seed: 1 });
