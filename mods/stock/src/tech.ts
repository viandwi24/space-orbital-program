import { defineTechNode } from '@orbital/sdk';

/**
 * The stock tech tree (plan 105, ADR 0154 point 5): Basics hold the reference rockets' parts, the
 * next tiers open with the first orbit of Home, a Cinder flyby and a landing on Cinder. Costs are
 * set against the science those flights yield (the pacing test in `test/tech.test.ts`).
 */
export const STOCK_TECH = [
	defineTechNode({
		id: 'stock.basics',
		label: 'Basics',
		tier: 0,
		cost: 0,
		description: 'A pod, a tank, an engine and the parts to stage them.',
		unlocks: [
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.tank-small',
			'stock.engine-lv',
			'stock.decoupler',
			'stock.nose-cone',
			'stock.fin',
			'stock.heat-shield'
		]
	}),
	defineTechNode({
		id: 'stock.instruments',
		label: 'Science instruments',
		tier: 1,
		cost: 10,
		requires: ['stock.basics'],
		description: 'Measure temperature and pressure on the way up, and keep the data.',
		unlocks: ['stock.thermometer', 'stock.barometer', 'stock.data-drive']
	}),
	defineTechNode({
		id: 'stock.structures',
		label: 'Structures',
		tier: 1,
		cost: 15,
		requires: ['stock.basics'],
		description: 'Bigger tanks, side mounts and the links between them.',
		unlocks: ['stock.tank-medium', 'stock.radial-decoupler', 'stock.strut', 'stock.fuel-line']
	}),
	defineTechNode({
		id: 'stock.propulsion',
		label: 'Propulsion',
		tier: 2,
		cost: 25,
		requires: ['stock.structures'],
		milestone: 'orbit:stock.home',
		description: 'More thrust: the cluster engine and solid boosters.',
		unlocks: ['stock.engine-cluster', 'stock.booster']
	}),
	defineTechNode({
		id: 'stock.probes',
		label: 'Probes',
		tier: 2,
		cost: 20,
		requires: ['stock.instruments'],
		milestone: 'orbit:stock.home',
		description: 'Fly without crew: a probe core and a whip antenna.',
		unlocks: ['stock.probe-core', 'stock.whip-antenna', 'stock.solar-panel']
	}),
	defineTechNode({
		id: 'stock.aerodynamics',
		label: 'Aerodynamics',
		tier: 2,
		cost: 15,
		requires: ['stock.structures'],
		milestone: 'orbit:stock.home',
		description: 'Wings and control surfaces.',
		unlocks: ['stock.wing', 'stock.control-surface', 'stock.wheel', 'stock.wheel-steer']
	}),
	defineTechNode({
		id: 'stock.landing',
		label: 'Landing',
		tier: 3,
		cost: 220,
		requires: ['stock.propulsion'],
		milestone: 'flyby:stock.cinder',
		description: 'Legs and the instruments that need solid ground.',
		unlocks: ['stock.landing-legs', 'stock.seismometer', 'stock.surface-sampler']
	}),
	defineTechNode({
		id: 'stock.deep-space',
		label: 'Deep-space comms',
		tier: 3,
		cost: 190,
		requires: ['stock.probes'],
		milestone: 'flyby:stock.cinder',
		description: 'A dish for long links and an air sampler.',
		unlocks: ['stock.dish-antenna', 'stock.atmosphere-sampler']
	}),
	defineTechNode({
		id: 'stock.life-support',
		label: 'Life support',
		tier: 4,
		cost: 300,
		requires: ['stock.landing'],
		milestone: 'landing:stock.cinder',
		description: 'Long flights with crew, and a collar to float.',
		unlocks: ['stock.life-support-pack', 'stock.scrubber', 'stock.flotation-collar']
	}),
	defineTechNode({
		id: 'stock.surface-operations',
		label: 'Surface operations',
		tier: 5,
		cost: 320,
		requires: ['stock.life-support'],
		milestone: 'landing:stock.cinder',
		description:
			'A base kit to found a site on another body, and a drill for its outposts (plan 128).',
		unlocks: ['stock.base-kit', 'stock.drill']
	})
];
