/**
 * Off-world bases (plan 128, ADR 0125): the base kit that founds a site, the drill an outpost runs,
 * the buildings a base may hold, ice and the one ISRU step.
 */
import { defineBuilding, defineCommodity, defineModule, definePart, defineRecipe, kg, z, type BuildingLevel } from '@orbital/sdk';
import { partCost } from './costs.ts';

/** A landed vessel with this module can found a base with `deploy-base` (ADR 0125 point 2). */
export const ModuleBaseKit = defineModule({ id: 'stock.base-kit', keep: true });

/** Ice per day while its vessel is a landed member of a site (ADR 0125 point 4). */
export const ModuleDrill = defineModule({
	id: 'stock.drill',
	config: z.object({ perDay: z.number().positive().default(50) })
});

const cylinder = (height: number) => ({ kind: 'cylinder' as const, radius: 0.625, height });
const nodes = (height: number) => ({
	top: { pos: [0, height / 2, 0] as [number, number, number], dir: [0, 1, 0] as [number, number, number] },
	bottom: { pos: [0, -height / 2, 0] as [number, number, number], dir: [0, -1, 0] as [number, number, number] }
});

export const PartBaseKit = definePart({
	id: 'stock.base-kit',
	title: 'Base Kit',
	mass: kg(1_200),
	cost: partCost(1_200, 'command'),
	impactTolerance: 8,
	maxTemperature: 1200,
	shape: cylinder(1.2),
	visual: {
		kind: 'tank',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e0a33e' },
		params: { stripe: 0.5, bands: 3 }
	},
	attach: nodes(1.2),
	modules: [[ModuleBaseKit]]
});

export const PartDrill = definePart({
	id: 'stock.drill',
	title: 'Surface Drill',
	mass: kg(250),
	cost: partCost(250, 'engine'),
	impactTolerance: 8,
	maxTemperature: 1200,
	shape: cylinder(0.6),
	visual: {
		kind: 'tank',
		palette: { primary: '#2a2e35', secondary: '#d5d8dc', accent: '#e0a33e' },
		params: { stripe: 0.5, bands: 1 }
	},
	attach: nodes(0.6),
	modules: [[ModuleDrill, { perDay: 50 }]]
});

/** Three levels: capacity per level, cost and build days per level (ADR 0123 point 7's rule). */
const levels = (
	capacity: Record<string, [number, number, number]>,
	cost: [number, number, number],
	buildDays: [number, number, number]
): BuildingLevel[] =>
	[0, 1, 2].map((k) => ({
		cost: cost[k]!,
		buildDays: buildDays[k]!,
		upkeep: Math.round(cost[k]! * 0.01),
		power: 0,
		capacity: Object.fromEntries(Object.entries(capacity).map(([id, v]) => [id, v[k]!]))
	}));
const gen = (generator: string) => ({ kind: 'generator' as const, generator });
const southDoor = (w: number) => [{ i: Math.floor(w / 2), j: 0, side: 'south' as const }];

/** What `deploy-base` stands up at the new site's centre; its storage takes the first ice. */
export const BuildingBaseHub = defineBuilding({
	id: 'stock.base-hub',
	label: 'Base hub',
	size: { w: 3, d: 3 },
	entrances: southDoor(3),
	levels: levels({ storage: [5_000, 15_000, 40_000] }, [40_000, 90_000, 200_000], [6, 14, 24]),
	provides: ['storage'],
	placement: 'off-world',
	visual: gen('office')
});
export const BuildingIsruPlant = defineBuilding({
	id: 'stock.isru-plant',
	label: 'ISRU plant',
	size: { w: 4, d: 4 },
	entrances: southDoor(4),
	levels: levels({ production: [1, 2, 4] }, [60_000, 120_000, 240_000], [8, 16, 28]),
	provides: ['production'],
	placement: 'off-world',
	hazardRadius: 30,
	visual: gen('tanks')
});
export const BuildingStorageModule = defineBuilding({
	id: 'stock.storage-module',
	label: 'Storage module',
	size: { w: 3, d: 2 },
	entrances: southDoor(3),
	levels: levels({ storage: [20_000, 50_000, 120_000] }, [25_000, 60_000, 140_000], [4, 10, 18]),
	provides: ['storage'],
	placement: 'off-world',
	visual: gen('tanks')
});

export const CommodityIce = defineCommodity({
	id: 'stock.ice',
	label: 'Ice',
	unit: 'u',
	basePrice: 0.1,
	market: 'fixed'
});

/** 100 u of ice to 40 u of liquid fuel and 49 u of oxidizer a day at factor 1 (ADR 0125 point 5). */
export const RecipeIceElectrolysis = defineRecipe({
	id: 'stock.ice-electrolysis',
	label: 'Ice electrolysis',
	building: 'stock.isru-plant',
	inputs: { 'stock.ice': 100, power: 120 },
	outputs: { 'stock.liquid-fuel': 40, 'stock.oxidizer': 49 }
});

export const STOCK_BASE_PARTS = [PartBaseKit, PartDrill] as const;
export const STOCK_BASE_BUILDINGS = [BuildingBaseHub, BuildingIsruPlant, BuildingStorageModule] as const;
