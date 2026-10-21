/**
 * @orbital/mod-stock — stock content, written against @orbital/sdk like any third-party mod.
 * If stock content needs a "back door" into core, the SDK is incomplete: fix the SDK, not this package.
 */
import { definePlugin } from '@orbital/sdk';
import { HomeBody, MoonBody, SunBody } from './bodies.ts';
import { ColdGas, ModuleFlag, ModuleHelmet, ModuleJetpack, STOCK_EVA_PARTS } from './eva.ts';
import { engineOutput, ispAt, propellantRates } from './engine.ts';
import {
	ModuleCommand,
	ModuleProbeComputer,
	ModuleControlSurface,
	ModuleDecoupler,
	ModuleEngine,
	ModuleFin,
	ModuleHeatShield,
	ModuleLandingLeg,
	ModuleWheel,
	ModuleReactionWheel,
	ModuleResourceContainer,
	ModuleWing,
	ModuleScrubber,
	deposit,
	withdraw
} from './modules.ts';
import {
	PartBooster,
	STOCK_PROPULSION_PACK,
	STOCK_FAIRING_PARTS,
	PartCommandPod,
	PartControlSurface,
	PartDecoupler,
	PartEngineCluster,
	PartEngineLV,
	PartFin,
	PartFuelLine,
	PartHeatShield,
	PartLandingLegs,
	PartWheel,
	PartWheelSteer,
	PartNoseCone,
	PartRadialDecoupler,
	PartReactionWheel,
	PartStrut,
	PartTankMedium,
	PartTankSmall,
	PartDataDrive,
	PartFlotationCollar,
	PartParachute,
	PartRadialParachute,
	PartDrogueChute,
	PartParachuteRing,
	STOCK_SCIENCE_PARTS,
	STOCK_COMMS_PARTS,
	STOCK_POWER_PARTS,
	STOCK_LIGHT_PARTS,
	STOCK_LIFE_SUPPORT_PARTS,
	PartWing,
	STOCK_ADAPTER_PARTS,
	STOCK_RCS_PARTS,
	STOCK_DOCKING_PARTS,
	STOCK_CONE_PARTS,
	STOCK_SIZE_CLASS_PARTS
} from './parts/index.ts';
import {
	Ablator,
	ElectricCharge,
	LIFE_SUPPORT_RESOURCES,
	LiquidFuel,
	Monopropellant,
	Oxidizer,
	SolidFuel
} from './resources.ts';
import { STOCK_PRESETS, STOCK_RULES } from './rules.ts';
import { STOCK_CHARGES } from './charges.ts';
import { RecipePropellantSynthesis, STOCK_COMMODITIES } from './market.ts';
import {
	CommodityIce,
	ModuleBaseKit,
	ModuleDrill,
	RecipeIceElectrolysis,
	STOCK_BASE_PARTS
} from './bases.ts';
import { STOCK_BUILDINGS } from './buildings.ts';
import { ModuleDataStorage, STOCK_DATA_KINDS } from './data.ts';
import { STOCK_SITE_TEMPLATES } from './site-templates.ts';
import { STOCK_BUILDING_CATEGORIES, STOCK_CATEGORIES } from './categories.ts';
import { STOCK_ACHIEVEMENTS } from './achievements.ts';
import { STOCK_FAILURE_MODES } from './reliability.ts';
import { STOCK_CREW_NAMES, STOCK_CREW_TRAITS } from './crew.ts';
import { STOCK_ACTION_GROUPS } from './action-groups.ts';
import { PanelScience } from './panels.ts';
import { ModuleLight } from './lights.ts';
import { ModuleRtg, ModuleSolarPanel } from './solar.ts';
import { ModuleRcs } from './rcs.ts';
import { ModuleDockingPort } from './docking.ts';
import { ModuleParachute } from './parachute.ts';
import { ModuleLaunchClamp } from './launch-clamp.ts';
import { ModuleFairing, ModuleFairingPanel } from './fairing.ts';
import { STOCK_OBJECTIVES } from './objectives.ts';
import { STOCK_MISSIONS } from './missions.ts';
import { STOCK_CONTRACT_TEMPLATES } from './contracts.ts';
import { STOCK_STRATEGIES } from './strategies.ts';
import { STOCK_AGENCIES } from './agencies.ts';
import { STOCK_DISCOVERY_FACTS } from './discovery.ts';
import { STOCK_TECH } from './tech.ts';
import {
	ModuleExperiment,
	STOCK_DOSSIER_ENTRIES,
	STOCK_EXPERIMENTS,
	STOCK_SITUATIONS
} from './science.ts';
import { ModuleAntenna, STOCK_ANTENNAS, STOCK_BANDS, STOCK_ROUTE_POLICIES } from './comms.ts';

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
		for (const resource of LIFE_SUPPORT_RESOURCES) ctx.resources.register(resource);
		ctx.resources.register(ColdGas);
		ctx.resources.register(Monopropellant);
		ctx.resources.register(SolidFuel);

		ctx.modules.register(ModuleCommand);
		ctx.modules.register(ModuleProbeComputer);
		ctx.modules.register(ModuleResourceContainer);
		ctx.modules.register(ModuleEngine);
		ctx.modules.register(ModuleDecoupler);
		ctx.modules.register(ModuleReactionWheel);
		ctx.modules.register(ModuleLandingLeg);
		ctx.modules.register(ModuleWheel);
		ctx.modules.register(ModuleHeatShield);
		ctx.modules.register(ModuleFin);
		ctx.modules.register(ModuleControlSurface);
		ctx.modules.register(ModuleWing);
		ctx.modules.register(ModuleScrubber);
		ctx.modules.register(ModuleSolarPanel);
		ctx.modules.register(ModuleRtg);
		ctx.modules.register(ModuleLight);
		ctx.modules.register(ModuleRcs);
		ctx.modules.register(ModuleDockingPort);
		ctx.modules.register(ModuleParachute);
		ctx.modules.register(ModuleLaunchClamp);
		ctx.modules.register(ModuleFairing);
		ctx.modules.register(ModuleFairingPanel);
		ctx.modules.register(ModuleFlag);
		ctx.modules.register(ModuleJetpack);
		ctx.modules.register(ModuleHelmet);

		for (const kind of STOCK_DATA_KINDS) ctx.dataKinds.register(kind);
		ctx.modules.register(ModuleDataStorage);
		for (const template of STOCK_SITE_TEMPLATES) ctx.siteTemplates.register(template);
		for (const category of [...STOCK_CATEGORIES, ...STOCK_BUILDING_CATEGORIES])
			ctx.categories.register(category);
		for (const achievement of STOCK_ACHIEVEMENTS) ctx.achievements.register(achievement);
		for (const mode of STOCK_FAILURE_MODES) ctx.failureModes.register(mode);
		for (const trait of STOCK_CREW_TRAITS) ctx.crewTraits.register(trait);
		ctx.crewNames.register(STOCK_CREW_NAMES);
		for (const group of STOCK_ACTION_GROUPS) ctx.actionGroups.register(group);
		ctx.panels.register(PanelScience);
		for (const objective of STOCK_OBJECTIVES) ctx.objectives.register(objective);
		for (const mission of STOCK_MISSIONS) ctx.missions.register(mission);
		for (const t of STOCK_CONTRACT_TEMPLATES) ctx.contractTemplates.register(t);
		for (const strategy of STOCK_STRATEGIES) ctx.strategies.register(strategy);
		for (const agency of STOCK_AGENCIES) ctx.agencies.register(agency);
		for (const fact of STOCK_DISCOVERY_FACTS) ctx.discoveryFacts.register(fact);
		for (const node of STOCK_TECH) ctx.techNodes.register(node);
		for (const situation of STOCK_SITUATIONS) ctx.situations.register(situation);
		for (const experiment of STOCK_EXPERIMENTS) ctx.experiments.register(experiment);
		ctx.modules.register(ModuleExperiment);
		for (const entry of STOCK_DOSSIER_ENTRIES) ctx.dossierEntries.register(entry);
		for (const antenna of STOCK_ANTENNAS) ctx.antennas.register(antenna);
		for (const band of STOCK_BANDS) ctx.bands.register(band);
		for (const policy of STOCK_ROUTE_POLICIES) ctx.routePolicies.register(policy);
		ctx.modules.register(ModuleAntenna);

		ctx.parts.register(PartCommandPod);
		ctx.parts.register(PartReactionWheel);
		ctx.parts.register(PartTankSmall);
		ctx.parts.register(PartTankMedium);
		ctx.parts.register(PartEngineLV);
		ctx.parts.register(PartEngineCluster);
		ctx.parts.register(PartDecoupler);
		ctx.parts.register(PartLandingLegs);
		ctx.parts.register(PartWheel);
		ctx.parts.register(PartWheelSteer);
		ctx.parts.register(PartHeatShield);
		ctx.parts.register(PartRadialDecoupler);
		ctx.parts.register(PartBooster);
		// solid motors, the vacuum engine and the 2.5 m class (plan 210)
		for (const part of STOCK_PROPULSION_PACK) ctx.parts.register(part);
		// procedural fairings (plan 219, ADR 0224)
		for (const part of STOCK_FAIRING_PARTS) ctx.parts.register(part);
		ctx.parts.register(PartNoseCone);
		ctx.parts.register(PartFin);
		ctx.parts.register(PartControlSurface);
		ctx.parts.register(PartWing);
		ctx.parts.register(PartStrut);
		ctx.parts.register(PartFuelLine);
		ctx.parts.register(PartDataDrive);
		ctx.parts.register(PartFlotationCollar);
		// size adapters and cones in every size class (plan 207, ADR 0212)
		for (const part of STOCK_ADAPTER_PARTS) ctx.parts.register(part);
		for (const part of STOCK_CONE_PARTS) ctx.parts.register(part);
		// reaction control (plan 211, ADR 0217)
		for (const part of STOCK_RCS_PARTS) ctx.parts.register(part);
		// docking ports (plan 222, ADR 0218)
		for (const part of STOCK_DOCKING_PARTS) ctx.parts.register(part);
		for (const part of STOCK_SCIENCE_PARTS) ctx.parts.register(part);
		for (const part of STOCK_COMMS_PARTS) ctx.parts.register(part);
		for (const part of STOCK_POWER_PARTS) ctx.parts.register(part);
		// lights (plan 242, ADR 0239)
		for (const part of STOCK_LIGHT_PARTS) ctx.parts.register(part);
		for (const part of STOCK_EVA_PARTS) ctx.parts.register(part);
		for (const part of STOCK_LIFE_SUPPORT_PARTS) ctx.parts.register(part);
		// parachutes (plan 209, ADR 0203 point 4)
		ctx.parts.register(PartParachute);
		ctx.parts.register(PartRadialParachute);
		ctx.parts.register(PartDrogueChute);
		ctx.parts.register(PartParachuteRing);

		// the Sun first: hosts list bodies in registration order and the tree's root comes first
		ctx.bodies.register(SunBody);
		ctx.bodies.register(HomeBody);
		ctx.bodies.register(MoonBody);

		for (const rule of STOCK_RULES) ctx.rules.register(rule);
		for (const preset of STOCK_PRESETS) ctx.presets.register(preset);
		for (const charge of STOCK_CHARGES) ctx.charges.register(charge);
		// one commodity chain first (plan 097, ADR 0124)
		for (const commodity of STOCK_COMMODITIES) ctx.commodities.register(commodity);
		ctx.recipes.register(RecipePropellantSynthesis);
		// off-world bases (plan 128, ADR 0125)
		ctx.modules.register(ModuleBaseKit);
		ctx.modules.register(ModuleDrill);
		for (const part of STOCK_BASE_PARTS) ctx.parts.register(part);
		// the size classes to 7.5 m (plan 289)
		for (const part of STOCK_SIZE_CLASS_PARTS) ctx.parts.register(part);
		ctx.commodities.register(CommodityIce);
		ctx.recipes.register(RecipeIceElectrolysis);
		for (const building of STOCK_BUILDINGS) ctx.buildings.register(building);

		ctx.provide('stock', stockApi);
	}
});
export default Stock;

export { API_VERSION } from '@orbital/sdk';
export * from './resources.ts';
export * from './modules.ts';
export * from './parts/index.ts';
export * from './bodies.ts';
export * from './eva.ts';
export * from './panels.ts';
export * from './lights.ts';
export * from './solar.ts';
export * from './rcs.ts';
export * from './launch-clamp.ts';
export * from './fairing.ts';
export * from './docking.ts';
export * from './parachute.ts';
export * from './engine.ts';
export * from './rules.ts';
export * from './costs.ts';
export * from './charges.ts';
export * from './buildings.ts';
export * from './data.ts';
export * from './site-templates.ts';
export * from './categories.ts';
export * from './achievements.ts';
export * from './reliability.ts';
export * from './crew.ts';
export * from './action-groups.ts';
export * from './objectives.ts';
export * from './missions.ts';
export * from './contracts.ts';
export * from './tech.ts';
export * from './science.ts';
export * from './comms.ts';
export * from './market.ts';
export * from './bases.ts';
export * from './strategies.ts';
export * from './agencies.ts';
export * from './discovery.ts';
