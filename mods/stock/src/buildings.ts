/**
 * Stock buildings (plan 090, ADRs 0097 and 0115). Sizes in 10 m cells (east × north at rotation
 * 0), entrances on the south edge unless a pad or runway needs another side. Costs, build days and
 * upkeep per level from plan 096 (ADR 0123 point 7): a level's cost is what building or upgrading
 * to it costs, upkeep about 1 % of the level's cost per 30 days.
 */
import { defineBuilding, type BuildingLevel } from '@orbital/sdk';
import { STOCK_BASE_BUILDINGS } from './bases.ts';

type Three = [number, number, number];

/** Three levels: capacity per level, cost (funds) and build days per level, power. */
const levels = (
	capacity: Record<string, Three>,
	cost: Three,
	buildDays: Three,
	power = 0
): BuildingLevel[] =>
	[0, 1, 2].map((k) => ({
		cost: cost[k]!,
		buildDays: buildDays[k]!,
		upkeep: Math.round(cost[k]! * 0.01),
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
	levels: levels({ hangar: [30, 120, 255] }, [40_000, 90_000, 250_000], [10, 20, 30]),
	provides: ['hangar'],
	placement: 'home',
	category: 'stock.infrastructure',
	description: 'Builds and stores vessel designs; its level sets the part count.',
	visual: gen('hangar')
});

const pad = (id: string, label: string, n: number, hazard: number, mass: Three, cost: Three) =>
	defineBuilding({
		id,
		label,
		size: { w: n, d: n },
		entrances: [{ i: Math.floor(n / 2), j: n - 1, side: 'north' }],
		levels: levels({ 'launch-pad': mass }, cost, [5, 12, 20]),
		provides: ['launch-pad'],
		placement: 'home',
		hazardRadius: hazard,
		category: 'stock.launch',
		description: 'A vertical launch pad; its level sets the heaviest vessel it takes.',
		visual: gen('launch-pad')
	});
export const BuildingLaunchpadS = pad(
	'stock.launchpad-s',
	'Launchpad S',
	3,
	40,
	[18, 30, 45],
	[20_000, 60_000, 150_000]
);
export const BuildingLaunchpadM = pad(
	'stock.launchpad-m',
	'Launchpad M',
	5,
	80,
	[60, 100, 150],
	[80_000, 160_000, 300_000]
);
export const BuildingLaunchpadL = pad(
	'stock.launchpad-l',
	'Launchpad L',
	7,
	140,
	[180, 300, 500],
	[200_000, 300_000, 400_000]
);

export const BuildingRunway = defineBuilding({
	id: 'stock.runway',
	label: 'Runway',
	size: { w: 4, d: 120 },
	entrances: [{ i: 3, j: 0, side: 'east' }],
	levels: levels({ runway: [1_200, 1_800, 2_400] }, [60_000, 120_000, 200_000], [8, 15, 25]),
	provides: ['runway'],
	placement: 'home',
	hazardRadius: 30,
	category: 'stock.launch',
	description: 'A runway for horizontal take-off and landing; its level sets its length.',
	visual: gen('runway')
});

export const BuildingMissionCenter = defineBuilding({
	id: 'stock.mission-center',
	label: 'Mission Center',
	size: { w: 4, d: 2 },
	entrances: southDoor(4),
	levels: levels({ 'mission-control': [3, 6, 12] }, [30_000, 90_000, 200_000], [6, 14, 24]),
	provides: ['mission-control'],
	placement: 'home',
	category: 'stock.administration',
	description: 'Tracks vessels and runs missions; its level sets how many at once.',
	visual: gen('control')
});
export const BuildingAstronautComplex = defineBuilding({
	id: 'stock.astronaut-complex',
	label: 'Astronaut Complex',
	size: { w: 4, d: 3 },
	entrances: southDoor(4),
	levels: levels({ crew: [5, 12, 30] }, [30_000, 80_000, 180_000], [6, 12, 20]),
	provides: ['crew'],
	placement: 'home',
	category: 'stock.crew',
	description: 'Hires and trains astronauts; its level sets the roster size.',
	visual: gen('office')
});
export const BuildingResearch = defineBuilding({
	id: 'stock.research',
	label: 'R&D',
	size: { w: 5, d: 4 },
	entrances: southDoor(5),
	levels: levels({ lab: [1, 2, 3] }, [50_000, 120_000, 250_000], [8, 16, 28]),
	provides: ['lab'],
	placement: 'home',
	category: 'stock.science',
	description: 'Researches the tech tree and analyses science.',
	visual: gen('office')
});
export const BuildingAdministration = defineBuilding({
	id: 'stock.administration',
	label: 'Administration',
	size: { w: 5, d: 3 },
	entrances: southDoor(5),
	levels: levels({ admin: [1, 3, 5] }, [30_000, 90_000, 200_000], [6, 14, 24]),
	provides: ['admin'],
	placement: 'home',
	category: 'stock.administration',
	description: 'Contracts and strategies; its level sets their slots.',
	visual: gen('office')
});
export const BuildingTrackingDish = defineBuilding({
	id: 'stock.tracking-dish',
	label: 'Tracking dish',
	size: { w: 2, d: 2 },
	entrances: southDoor(2),
	levels: levels({ 'comms-node': [1, 2, 3] }, [20_000, 60_000, 150_000], [2, 6, 12], 20),
	provides: ['comms-node'],
	placement: 'home',
	category: 'stock.comms',
	description: 'A ground station for the comms network; its level sets range and rate.',
	visual: gen('dish')
});
export const BuildingPropellantPlant = defineBuilding({
	id: 'stock.propellant-plant',
	label: 'Propellant plant',
	size: { w: 4, d: 4 },
	entrances: southDoor(4),
	levels: levels(
		{ production: [1, 2, 4], storage: [20_000, 50_000, 120_000] },
		[80_000, 160_000, 320_000],
		[10, 18, 28],
		150
	),
	provides: ['production', 'storage'],
	placement: 'home',
	hazardRadius: 30,
	category: 'stock.production',
	description: 'Makes and stores propellant at the site.',
	visual: gen('tanks')
});
export const BuildingTestStand = defineBuilding({
	id: 'stock.test-stand',
	label: 'Test stand',
	size: { w: 3, d: 3 },
	entrances: southDoor(3),
	levels: levels({ 'test-stand': [1, 2, 3] }, [30_000, 70_000, 150_000], [4, 10, 18]),
	provides: ['test-stand'],
	placement: 'home',
	hazardRadius: 40,
	category: 'stock.science',
	description: 'Fires engines and tests parts on the ground.',
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
	BuildingTestStand,
	// off-world bases (plan 128, ADR 0125)
	...STOCK_BASE_BUILDINGS
] as const;
