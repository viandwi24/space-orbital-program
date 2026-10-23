import { defineTechNode } from '@orbital/sdk';

/**
 * The stock tech tree (plan 105, ADR 0154 point 5; laid out for every part by plan 231, ADR 0231
 * point 1): Basics hold the reference rockets' parts and what a KSP-style first flight needs; the
 * next tiers open with the first orbit of Home, a Cinder flyby and a landing on Cinder. Each tier's
 * total is set against the science those flights yield (the pacing test in `test/tech.test.ts`), and
 * every stock part sits in exactly one node (`test/tech-coverage.test.ts`).
 */
export const STOCK_TECH = [
	// ---- tier 0: the first flight ----
	defineTechNode({
		id: 'stock.basics',
		label: 'Basics',
		tier: 0,
		cost: 0,
		description: 'A pod, a tank, an engine, a small solid booster and the parts to stage them.',
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
			'stock.launch-clamp',
			// a first hop on a solid motor (plan 231)
			'stock.srb-small'
		]
	}),
	// ---- tier 1: 25 science, one first ascent ----
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
			'stock.thermometer-radial',
			'stock.barometer-radial',
			'stock.data-drive-radial'
		]
	}),
	defineTechNode({
		id: 'stock.experiments',
		label: 'Experiments',
		tier: 1,
		cost: 5,
		requires: ['stock.basics'],
		description: 'Goo and materials that react to where they fly.',
		unlocks: [
			'stock.goo-canister',
			'stock.materials-bay',
			'stock.goo-radial',
			'stock.materials-radial',
			'stock.atmosphere-radial'
		]
	}),
	defineTechNode({
		id: 'stock.structures',
		label: 'Structures',
		tier: 1,
		cost: 5,
		requires: ['stock.basics'],
		description: 'A bigger tank, side mounts and the links between them.',
		unlocks: [
			'stock.tank-medium',
			'stock.radial-decoupler',
			'stock.strut',
			'stock.fuel-line',
			// a small tank for probes (plan 289)
			'stock.tank-0625',
			'stock.truss',
			'stock.coupler-2',
			'stock.coupler-3',
			'stock.coupler-4',
			'stock.service-bay'
		]
	}),
	defineTechNode({
		id: 'stock.shapes',
		label: 'Shapes and adapters',
		tier: 1,
		cost: 5,
		requires: ['stock.basics'],
		description: 'Cones for every size and the adapters between sizes.',
		unlocks: [
			'stock.adapter-small',
			'stock.adapter-large',
			'stock.nose-cone-small',
			'stock.nose-cone-medium',
			'stock.nose-cone-large',
			'stock.tail-cone-small',
			'stock.tail-cone-medium',
			'stock.tail-cone-large'
		]
	}),
	// ---- tier 2: 60 science, after the first orbit ----
	defineTechNode({
		id: 'stock.propulsion',
		label: 'Propulsion',
		tier: 2,
		cost: 15,
		requires: ['stock.structures'],
		milestone: 'orbit:home',
		description: 'More thrust: the cluster engine and the bigger boosters.',
		unlocks: ['stock.engine-cluster', 'stock.booster', 'stock.srb-large', 'stock.booster-liquid']
	}),
	defineTechNode({
		id: 'stock.orbital-engines',
		label: 'Orbital engines',
		tier: 2,
		cost: 10,
		requires: ['stock.structures'],
		milestone: 'orbit:home',
		description: 'A light engine made for vacuum, for transfers and landings.',
		unlocks: ['stock.engine-vacuum']
	}),
	defineTechNode({
		id: 'stock.probes',
		label: 'Probes',
		tier: 2,
		cost: 12,
		requires: ['stock.instruments'],
		milestone: 'orbit:home',
		description: 'Fly without crew: a probe core and a whip antenna.',
		unlocks: [
			'stock.probe-core',
			'stock.whip-antenna',
			'stock.antenna-whip-radial',
			'stock.satellite-bus'
		]
	}),
	defineTechNode({
		id: 'stock.power',
		label: 'Electrics',
		tier: 2,
		cost: 10,
		requires: ['stock.instruments'],
		milestone: 'orbit:home',
		description: 'Solar panels, batteries and lights to keep a probe alive.',
		unlocks: [
			'stock.solar-panel',
			'stock.solar-panel-fixed',
			'stock.battery-small',
			'stock.battery-medium',
			'stock.light-spot',
			'stock.light-flood',
			// plan 311
			'stock.light-panel',
			'stock.light-angled',
			'stock.light-nav-red',
			'stock.light-nav-green',
			'stock.light-nav-white',
			'stock.solar-flat',
			'stock.solar-fold',
			'stock.battery-radial'
		]
	}),
	defineTechNode({
		id: 'stock.aerodynamics',
		label: 'Aerodynamics',
		tier: 2,
		cost: 8,
		requires: ['stock.shapes'],
		milestone: 'orbit:home',
		description: 'Wings, control surfaces and wheels.',
		unlocks: ['stock.wing', 'stock.control-surface', 'stock.wheel', 'stock.wheel-steer']
	}),
	defineTechNode({
		id: 'stock.recovery',
		label: 'Recovery',
		tier: 2,
		cost: 5,
		requires: ['stock.basics'],
		milestone: 'orbit:home',
		description:
			'More parachutes: a radial one, a drogue for fast descents, and a ring of mains that leaves the apex free for a docking port.',
		unlocks: [
			'stock.radial-parachute',
			'stock.drogue-chute',
			'stock.parachute-ring',
			'stock.capsule-sphere',
			'stock.capsule-cone'
		]
	}),
	// ---- tier 3: 490 science, after a Cinder flyby ----
	defineTechNode({
		id: 'stock.landing',
		label: 'Landing',
		tier: 3,
		cost: 120,
		requires: ['stock.orbital-engines'],
		milestone: 'flyby:moon',
		description: 'Legs and a ladder for the ground of another world.',
		unlocks: [
			'stock.landing-legs',
			'stock.ladder',
			'stock.lander-descent',
			'stock.lander-ascent',
			'stock.landing-leg-single',
			'stock.lander-can'
		]
	}),
	defineTechNode({
		id: 'stock.surface-science',
		label: 'Surface science',
		tier: 3,
		cost: 100,
		requires: ['stock.experiments'],
		milestone: 'flyby:moon',
		description: 'The instruments that need solid ground.',
		unlocks: [
			'stock.seismometer',
			'stock.surface-sampler',
			'stock.seismometer-radial',
			'stock.surface-sampler-radial'
		]
	}),
	defineTechNode({
		id: 'stock.deep-space',
		label: 'Deep-space comms',
		tier: 3,
		cost: 110,
		requires: ['stock.probes'],
		milestone: 'flyby:moon',
		description: 'A dish for long links and an air sampler.',
		unlocks: [
			'stock.dish-antenna',
			'stock.atmosphere-sampler',
			'stock.antenna-dish-fold',
			'stock.antenna-relay',
			'stock.telescope',
			'stock.magnetometer-boom'
		]
	}),
	defineTechNode({
		id: 'stock.rcs',
		label: 'Reaction control',
		tier: 3,
		cost: 80,
		requires: ['stock.probes'],
		milestone: 'flyby:moon',
		description: 'Thrusters that push without turning, and their monopropellant.',
		unlocks: [
			'stock.rcs-block',
			'stock.rcs-block-5',
			'stock.rcs-pair',
			'stock.rcs-linear',
			'stock.rcs-cold-gas',
			'stock.monoprop-tank',
			'stock.monoprop-radial'
		]
	}),
	defineTechNode({
		id: 'stock.heavy-lift',
		label: 'Heavy lift',
		tier: 3,
		cost: 80,
		requires: ['stock.propulsion'],
		milestone: 'flyby:moon',
		description:
			'The 1.875 m and 2.5 m classes: wide tanks, the wide engine, their decouplers, shields and adapters.',
		unlocks: [
			'stock.tank-wide-short',
			'stock.tank-wide',
			'stock.engine-wide',
			'stock.decoupler-wide',
			'stock.heat-shield-wide',
			// the 1.875 m class (plan 289)
			'stock.tank-1875-short',
			'stock.tank-1875',
			'stock.decoupler-1875',
			'stock.adapter-1250-1875',
			'stock.adapter-1875-2500',
			'stock.nose-cone-1875',
			'stock.heat-shield-1875',
			'stock.lattice-interstage',
			'stock.engine-plate-8',
			'stock.engine-vacuum-xl',
			'stock.pod-3',
			'stock.escape-tower',
			'stock.descent-module',
			'stock.orbital-module'
		]
	}),
	// ---- tier 4: 300 science, after a landing on Cinder ----
	defineTechNode({
		id: 'stock.docking',
		label: 'Docking',
		tier: 4,
		cost: 100,
		requires: ['stock.rcs'],
		milestone: 'landing:moon',
		description: 'Ports in three sizes to join vessels in orbit.',
		unlocks: [
			'stock.docking-port-small',
			'stock.docking-port',
			'stock.docking-port-large',
			'stock.docking-port-3750',
			'stock.docking-port-side',
			'stock.hub',
			'stock.crew-cabin'
		]
	}),
	defineTechNode({
		id: 'stock.fairings',
		label: 'Fairings',
		tier: 4,
		cost: 60,
		requires: ['stock.heavy-lift'],
		milestone: 'landing:moon',
		description: 'Shells that keep a payload out of the air on the way up.',
		unlocks: [
			'stock.fairing-base-small',
			'stock.fairing-base',
			'stock.fairing-base-large',
			'stock.fairing-base-1875',
			'stock.fairing-base-3750',
			'stock.service-bay-wide',
			'stock.cargo-bay',
			'stock.payload-petals'
		]
	}),
	defineTechNode({
		id: 'stock.life-support',
		label: 'Life support',
		tier: 4,
		cost: 100,
		requires: ['stock.landing'],
		milestone: 'landing:moon',
		description: 'Long flights with crew, and a collar to float.',
		unlocks: [
			'stock.life-support-pack',
			'stock.scrubber',
			'stock.flotation-collar',
			'stock.life-support-radial',
			'stock.scrubber-radial',
			'stock.hab-module',
			'stock.lab-module',
			'stock.airlock',
			'stock.cupola'
		]
	}),
	defineTechNode({
		id: 'stock.advanced-power',
		label: 'Advanced electrics',
		tier: 4,
		cost: 40,
		requires: ['stock.power'],
		milestone: 'landing:moon',
		description: 'A large solar array and a large battery.',
		unlocks: [
			'stock.solar-array-large',
			'stock.battery-large',
			'stock.solar-array-xl',
			'stock.solar-wings',
			'stock.fuel-cell',
			'stock.radiator'
		]
	}),
	// ---- tier 5 ----
	defineTechNode({
		id: 'stock.surface-operations',
		label: 'Surface operations',
		tier: 5,
		cost: 320,
		requires: ['stock.life-support'],
		milestone: 'landing:moon',
		description:
			'A base kit to found a site on another body, a drill for its outposts (plan 128), and hinges, servos, rotors and pistons (plan 306).',
		unlocks: [
			'stock.base-kit',
			'stock.drill',
			'stock.rover-cab',
			// plan 307: rover
			'stock.rover-chassis',
			'stock.rover-wheel-s',
			'stock.rover-wheel-s-steer',
			'stock.rover-wheel-m',
			'stock.rover-wheel-m-steer',
			'stock.rover-wheel-l',
			// plan 306: robotics
			'stock.hinge-s',
			'stock.hinge-m',
			'stock.servo-s',
			'stock.servo-m',
			'stock.rotor-s',
			'stock.piston-s',
			'stock.piston-m',
			// plan 313: tethers
			'stock.winch',
			'stock.tether-socket'
		]
	}),
	defineTechNode({
		id: 'stock.nuclear-power',
		label: 'Nuclear power',
		tier: 5,
		cost: 250,
		requires: ['stock.advanced-power'],
		milestone: 'landing:moon',
		description: 'A radioisotope generator: power far from the star, day and night.',
		unlocks: ['stock.rtg', 'stock.rtg-radial']
	}),
	defineTechNode({
		id: 'stock.super-heavy-lift',
		label: 'Super-heavy lift',
		tier: 5,
		cost: 300,
		requires: ['stock.heavy-lift'],
		milestone: 'landing:moon',
		description:
			'The 3.75, 5 and 7.5 m classes: tanks, decouplers, adapters, nose cones, shields and fairing bases (plan 289).',
		unlocks: [
			'stock.tank-3750-short',
			'stock.tank-3750',
			'stock.tank-3750-long',
			'stock.tank-5000-short',
			'stock.tank-5000',
			'stock.tank-5000-long',
			'stock.tank-7500',
			'stock.tank-7500-long',
			'stock.decoupler-3750',
			'stock.decoupler-5000',
			'stock.decoupler-7500',
			'stock.adapter-2500-3750',
			'stock.adapter-3750-5000',
			'stock.adapter-5000-7500',
			'stock.nose-cone-3750',
			'stock.nose-cone-5000',
			'stock.nose-cone-7500',
			'stock.heat-shield-3750',
			'stock.heat-shield-5000',
			'stock.fairing-base-5000',
			'stock.fairing-base-7500',
			'stock.engine-plate-5',
			'stock.engine-plate-9',
			'stock.external-tank',
			'stock.srb-xl',
			'stock.orbiter-nose',
			'stock.orbiter-aft',
			'stock.orbiter-bay',
			// plan 361
			'stock.orbiter-gear',
			'stock.orbiter-gear-nose',
			'stock.drag-chute',
			'stock.wing-delta'
		]
	})
];
