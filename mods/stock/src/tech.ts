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
			'stock.heat-shield',
			// the starter capsule comes home on one (plan 209, ADR 0203 point 5)
			'stock.parachute',
			// launch clamps from the start, as in KSP (plan 210)
			'stock.launch-clamp'
		]
	}),
	defineTechNode({
		id: 'stock.instruments',
		label: 'Science instruments',
		tier: 1,
		cost: 10,
		requires: ['stock.basics'],
		description: 'Measure temperature and pressure on the way up, and keep the data.',
		unlocks: [
			'stock.thermometer',
			'stock.barometer',
			'stock.data-drive',
			// basic experiments (plan 210); plan 231 may move them
			'stock.goo-canister',
			'stock.materials-bay'
		]
	}),
	defineTechNode({
		id: 'stock.structures',
		label: 'Structures',
		tier: 1,
		cost: 15,
		requires: ['stock.basics'],
		description: 'Bigger tanks, side mounts and the links between them.',
		unlocks: [
			'stock.tank-medium',
			'stock.radial-decoupler',
			'stock.strut',
			'stock.fuel-line',
			// size adapters and cones (plan 207); plan 231 may move them
			'stock.adapter-small',
			'stock.adapter-large',
			'stock.nose-cone-small',
			'stock.nose-cone-medium',
			'stock.nose-cone-large',
			'stock.tail-cone-small',
			'stock.tail-cone-medium',
			'stock.tail-cone-large',
			// fairings (plan 219); plan 231 may move them
			'stock.fairing-base-small',
			'stock.fairing-base',
			'stock.fairing-base-large',
			// the 2.5 m class (plan 210); plan 231 may move them
			'stock.tank-wide-short',
			'stock.tank-wide',
			'stock.engine-wide',
			'stock.decoupler-wide',
			'stock.heat-shield-wide'
		]
	}),
	defineTechNode({
		id: 'stock.propulsion',
		label: 'Propulsion',
		tier: 2,
		cost: 25,
		requires: ['stock.structures'],
		milestone: 'orbit:stock.home',
		description: 'More thrust: the cluster engine and solid boosters.',
		unlocks: [
			'stock.engine-cluster',
			'stock.booster',
			// solid motors and the vacuum engine (plan 210); plan 231 may move them
			'stock.srb-small',
			'stock.srb-large',
			'stock.booster-liquid',
			'stock.engine-vacuum'
		]
	}),
	defineTechNode({
		id: 'stock.probes',
		label: 'Probes',
		tier: 2,
		cost: 20,
		requires: ['stock.instruments'],
		milestone: 'orbit:stock.home',
		description: 'Fly without crew: a probe core and a whip antenna.',
		unlocks: [
			'stock.probe-core',
			'stock.whip-antenna',
			'stock.solar-panel',
			'stock.solar-panel-fixed',
			'stock.battery-small',
			'stock.battery-medium',
			// reaction control (plan 211); plan 231 may move them
			'stock.rcs-block',
			'stock.rcs-cold-gas',
			'stock.monoprop-tank',
			'stock.monoprop-radial',
			// docking (plan 222); plan 231 may move them
			'stock.docking-port-small',
			'stock.docking-port',
			'stock.docking-port-large'
		]
	}),
	defineTechNode({
		id: 'stock.aerodynamics',
		label: 'Aerodynamics',
		tier: 2,
		cost: 15,
		requires: ['stock.structures'],
		milestone: 'orbit:stock.home',
		description: 'Wings, control surfaces and more parachutes.',
		unlocks: [
			'stock.wing',
			'stock.control-surface',
			'stock.wheel',
			'stock.wheel-steer',
			// plan 209; plan 231 may move them
			'stock.radial-parachute',
			'stock.drogue-chute'
		]
	}),
	defineTechNode({
		id: 'stock.landing',
		label: 'Landing',
		tier: 3,
		cost: 260,
		requires: ['stock.propulsion'],
		milestone: 'flyby:stock.cinder',
		description: 'Legs and the instruments that need solid ground.',
		unlocks: ['stock.landing-legs', 'stock.seismometer', 'stock.surface-sampler', 'stock.ladder']
	}),
	defineTechNode({
		id: 'stock.deep-space',
		label: 'Deep-space comms',
		tier: 3,
		cost: 230,
		requires: ['stock.probes'],
		milestone: 'flyby:stock.cinder',
		description: 'A dish for long links and an air sampler.',
		unlocks: [
			'stock.dish-antenna',
			'stock.atmosphere-sampler',
			'stock.battery-large',
			'stock.solar-array-large',
			'stock.rtg'
		]
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
