/**
 * @orbital/mod-stock — stock content, written against @orbital/sdk like any third-party mod.
 * If stock content needs a "back door" into core, the SDK is incomplete: fix the SDK, not this package.
 */
import { definePlugin } from '@orbital/sdk';
import { HomeBody, MoonBody } from './bodies.ts';
import { engineOutput, ispAt, propellantRates } from './engine.ts';
import {
	ModuleCommand,
	ModuleControlSurface,
	ModuleDecoupler,
	ModuleEngine,
	ModuleFin,
	ModuleHeatShield,
	ModuleLandingLeg,
	ModuleReactionWheel,
	ModuleResourceContainer,
	ModuleWing,
	deposit,
	withdraw
} from './modules.ts';
import {
	PartBooster,
	PartCommandPod,
	PartControlSurface,
	PartDecoupler,
	PartEngineCluster,
	PartEngineLV,
	PartFin,
	PartFuelLine,
	PartHeatShield,
	PartLandingLegs,
	PartNoseCone,
	PartRadialDecoupler,
	PartReactionWheel,
	PartStrut,
	PartTankMedium,
	PartTankSmall,
	PartDataDrive,
	STOCK_SCIENCE_PARTS,
	STOCK_COMMS_PARTS,
	PartWing
} from './parts.ts';
import { Ablator, ElectricCharge, LiquidFuel, Oxidizer } from './resources.ts';
import { STOCK_PRESETS, STOCK_RULES } from './rules.ts';
import { STOCK_CHARGES } from './charges.ts';
import { STOCK_BUILDINGS } from './buildings.ts';
import { ModuleDataStorage, STOCK_DATA_KINDS } from './data.ts';
import { STOCK_SITE_TEMPLATES } from './site-templates.ts';
import { STOCK_CREW_NAMES, STOCK_CREW_TRAITS } from './crew.ts';
import { STOCK_ACTION_GROUPS } from './action-groups.ts';
import { STOCK_OBJECTIVES } from './objectives.ts';
import { ModuleExperiment, STOCK_EXPERIMENTS, STOCK_SITUATIONS } from './science.ts';
import { ModuleAntenna, STOCK_ANTENNAS } from './comms.ts';

/** Pure helpers other plugins and the sim can use through `ctx.stock` (a `depends: [Stock]` plugin). */
export const stockApi = { engineOutput, ispAt, propellantRates, withdraw, deposit };

export const Stock = definePlugin({
	meta: { id: 'stock', version: '0.1.0', api: '^0.1', title: 'Orbital stock content' },
	contributes: {} as { stock: typeof stockApi },
	setup(ctx) {
		ctx.resources.register(LiquidFuel);
		ctx.resources.register(Oxidizer);
		ctx.resources.register(ElectricCharge);
		ctx.resources.register(Ablator);

		ctx.modules.register(ModuleCommand);
		ctx.modules.register(ModuleResourceContainer);
		ctx.modules.register(ModuleEngine);
		ctx.modules.register(ModuleDecoupler);
		ctx.modules.register(ModuleReactionWheel);
		ctx.modules.register(ModuleLandingLeg);
		ctx.modules.register(ModuleHeatShield);
		ctx.modules.register(ModuleFin);
		ctx.modules.register(ModuleControlSurface);
		ctx.modules.register(ModuleWing);

		for (const kind of STOCK_DATA_KINDS) ctx.dataKinds.register(kind);
		ctx.modules.register(ModuleDataStorage);
		for (const template of STOCK_SITE_TEMPLATES) ctx.siteTemplates.register(template);
		for (const trait of STOCK_CREW_TRAITS) ctx.crewTraits.register(trait);
		ctx.crewNames.register(STOCK_CREW_NAMES);
		for (const group of STOCK_ACTION_GROUPS) ctx.actionGroups.register(group);
		for (const objective of STOCK_OBJECTIVES) ctx.objectives.register(objective);
		for (const situation of STOCK_SITUATIONS) ctx.situations.register(situation);
		for (const experiment of STOCK_EXPERIMENTS) ctx.experiments.register(experiment);
		ctx.modules.register(ModuleExperiment);
		for (const antenna of STOCK_ANTENNAS) ctx.antennas.register(antenna);
		ctx.modules.register(ModuleAntenna);

		ctx.parts.register(PartCommandPod);
		ctx.parts.register(PartReactionWheel);
		ctx.parts.register(PartTankSmall);
		ctx.parts.register(PartTankMedium);
		ctx.parts.register(PartEngineLV);
		ctx.parts.register(PartEngineCluster);
		ctx.parts.register(PartDecoupler);
		ctx.parts.register(PartLandingLegs);
		ctx.parts.register(PartHeatShield);
		ctx.parts.register(PartRadialDecoupler);
		ctx.parts.register(PartBooster);
		ctx.parts.register(PartNoseCone);
		ctx.parts.register(PartFin);
		ctx.parts.register(PartControlSurface);
		ctx.parts.register(PartWing);
		ctx.parts.register(PartStrut);
		ctx.parts.register(PartFuelLine);
		ctx.parts.register(PartDataDrive);
		for (const part of STOCK_SCIENCE_PARTS) ctx.parts.register(part);
		for (const part of STOCK_COMMS_PARTS) ctx.parts.register(part);

		ctx.bodies.register(HomeBody);
		ctx.bodies.register(MoonBody);

		for (const rule of STOCK_RULES) ctx.rules.register(rule);
		for (const preset of STOCK_PRESETS) ctx.presets.register(preset);
		for (const charge of STOCK_CHARGES) ctx.charges.register(charge);
		for (const building of STOCK_BUILDINGS) ctx.buildings.register(building);

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
export * from './rules.ts';
export * from './costs.ts';
export * from './charges.ts';
export * from './buildings.ts';
export * from './data.ts';
export * from './site-templates.ts';
export * from './crew.ts';
export * from './action-groups.ts';
export * from './objectives.ts';
export * from './science.ts';
export * from './comms.ts';
