/**
 * @orbital/mod-stock — stock content, written against @orbital/sdk like any third-party mod.
 * If stock content needs a "back door" into core, the SDK is incomplete: fix the SDK, not this package.
 */
import { definePlugin } from '@orbital/sdk';
import { HomeBody } from './bodies.ts';
import { engineOutput, ispAt, propellantRates } from './engine.ts';
import {
	ModuleCommand,
	ModuleDecoupler,
	ModuleEngine,
	ModuleLandingLeg,
	ModuleReactionWheel,
	ModuleResourceContainer,
	deposit,
	withdraw
} from './modules.ts';
import {
	PartCommandPod,
	PartDecoupler,
	PartEngineLV,
	PartLandingLegs,
	PartReactionWheel,
	PartTankMedium,
	PartTankSmall
} from './parts.ts';
import { ElectricCharge, LiquidFuel, Oxidizer } from './resources.ts';

/** Pure helpers other plugins and the sim can use through `ctx.stock` (a `depends: [Stock]` plugin). */
export const stockApi = { engineOutput, ispAt, propellantRates, withdraw, deposit };

export const Stock = definePlugin({
	meta: { id: 'stock', version: '0.1.0', api: '^0.1', title: 'Orbital stock content' },
	contributes: {} as { stock: typeof stockApi },
	setup(ctx) {
		ctx.resources.register(LiquidFuel);
		ctx.resources.register(Oxidizer);
		ctx.resources.register(ElectricCharge);

		ctx.modules.register(ModuleCommand);
		ctx.modules.register(ModuleResourceContainer);
		ctx.modules.register(ModuleEngine);
		ctx.modules.register(ModuleDecoupler);
		ctx.modules.register(ModuleReactionWheel);
		ctx.modules.register(ModuleLandingLeg);

		ctx.parts.register(PartCommandPod);
		ctx.parts.register(PartReactionWheel);
		ctx.parts.register(PartTankSmall);
		ctx.parts.register(PartTankMedium);
		ctx.parts.register(PartEngineLV);
		ctx.parts.register(PartDecoupler);
		ctx.parts.register(PartLandingLegs);

		ctx.bodies.register(HomeBody);

		ctx.provide('stock', stockApi);
	}
});
export default Stock;

export { API_VERSION } from '@orbital/sdk';
export * from './resources.ts';
export * from './modules.ts';
export * from './parts.ts';
export * from './bodies.ts';
export * from './engine.ts';
