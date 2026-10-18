/**
 * Stock buildings (plan 090, ADRs 0097 and 0115). Sizes in 10 m cells (east × north at rotation
 * 0), entrances on the south edge unless a pad or runway needs another side. Level costs, build
 * days and upkeep are 0 until plan 096 sets them; capacities are placeholders for 096 to tune.
 */
import { defineBuilding, type BuildingLevel } from '@orbital/sdk';

/** Three levels with the given capacity per level; costs come with plan 096. */
const levels = (capacity: Record<string, [number, number, number]>, power = 0): BuildingLevel[] =>
	[0, 1, 2].map((k) => ({
		cost: 0,
		buildDays: 0,
		upkeep: 0,
		power,
		capacity: Object.fromEntries(Object.entries(capacity).map(([id, v]) => [id, v[k]!]))
	}));
const gen = (generator: string) => ({ kind: 'generator' as const, generator });
/** The middle cell of the south edge. */
const southDoor = (w: number) => [{ i: Math.floor(w / 2), j: 0, side: 'south' as const }];

export const BuildingHangar = defineBuilding({
	id: 'stock.hangar',
	label: 'Hangar',
	size: { w: 8, d: 5 },
	entrances: southDoor(8),
	levels: levels({ hangar: [30, 80, 255] }),
	provides: ['hangar'],
	visual: gen('hangar')
});

const pad = (
	id: string,
	label: string,
	n: number,
	hazard: number,
	mass: [number, number, number]
) =>
	defineBuilding({
		id,
		label,
		size: { w: n, d: n },
		entrances: [{ i: Math.floor(n / 2), j: n - 1, side: 'north' }],
		levels: levels({ 'launch-pad': mass }),
		provides: ['launch-pad'],
		hazardRadius: hazard,
		visual: gen('launch-pad')
	});
export const BuildingLaunchpadS = pad('stock.launchpad-s', 'Launchpad S', 3, 40, [18, 30, 45]);
export const BuildingLaunchpadM = pad('stock.launchpad-m', 'Launchpad M', 5, 80, [60, 100, 150]);
export const BuildingLaunchpadL = pad('stock.launchpad-l', 'Launchpad L', 7, 140, [180, 300, 500]);

export const BuildingRunway = defineBuilding({
	id: 'stock.runway',
	label: 'Runway',
	size: { w: 4, d: 120 },
	entrances: [{ i: 3, j: 0, side: 'east' }],
	levels: levels({ runway: [1_200, 1_800, 2_400] }),
	provides: ['runway'],
	hazardRadius: 30,
	visual: gen('runway')
});

export const BuildingMissionCenter = defineBuilding({
	id: 'stock.mission-center',
	label: 'Mission Center',
	size: { w: 4, d: 2 },
	entrances: southDoor(4),
	levels: levels({ 'mission-control': [3, 6, 12] }),
	provides: ['mission-control'],
	visual: gen('control')
});
export const BuildingAstronautComplex = defineBuilding({
	id: 'stock.astronaut-complex',
	label: 'Astronaut Complex',
	size: { w: 4, d: 3 },
	entrances: southDoor(4),
	levels: levels({ crew: [5, 12, 30] }),
	provides: ['crew'],
	visual: gen('office')
});
export const BuildingResearch = defineBuilding({
	id: 'stock.research',
	label: 'R&D',
	size: { w: 5, d: 4 },
	entrances: southDoor(5),
	levels: levels({ lab: [1, 2, 3] }),
	provides: ['lab'],
	visual: gen('office')
});
export const BuildingAdministration = defineBuilding({
	id: 'stock.administration',
	label: 'Administration',
	size: { w: 5, d: 3 },
	entrances: southDoor(5),
	levels: levels({ admin: [1, 3, 5] }),
	provides: ['admin'],
	visual: gen('office')
});
export const BuildingTrackingDish = defineBuilding({
	id: 'stock.tracking-dish',
	label: 'Tracking dish',
	size: { w: 2, d: 2 },
	entrances: southDoor(2),
	levels: levels({ 'comms-node': [1, 2, 3] }, 20),
	provides: ['comms-node'],
	visual: gen('dish')
});
export const BuildingPropellantPlant = defineBuilding({
	id: 'stock.propellant-plant',
	label: 'Propellant plant',
	size: { w: 4, d: 4 },
	entrances: southDoor(4),
	levels: levels({ production: [1, 2, 4], storage: [20_000, 50_000, 120_000] }, 150),
	provides: ['production', 'storage'],
	hazardRadius: 30,
	visual: gen('tanks')
});
export const BuildingTestStand = defineBuilding({
	id: 'stock.test-stand',
	label: 'Test stand',
	size: { w: 3, d: 3 },
	entrances: southDoor(3),
	levels: levels({ 'test-stand': [1, 2, 3] }),
	provides: ['test-stand'],
	hazardRadius: 40,
	visual: gen('tanks')
});

export const STOCK_BUILDINGS = [
	BuildingHangar,
	BuildingLaunchpadS,
	BuildingLaunchpadM,
	BuildingLaunchpadL,
	BuildingRunway,
	BuildingMissionCenter,
	BuildingAstronautComplex,
	BuildingResearch,
	BuildingAdministration,
	BuildingTrackingDish,
	BuildingPropellantPlant,
	BuildingTestStand
] as const;
