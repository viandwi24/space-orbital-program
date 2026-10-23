/**
 * Parts for the famous-mission blueprints (plans 276, 280, 281, 295–300; ADRs 0255, 0257, 0259–0261):
 * surface-mounted power, comms and science; bays and structure; capsules, cabins and station
 * modules; a lunar lander; satellites and a telescope; the shuttle; engine plates and the escape
 * tower. Titles follow ADR 0255 (`OrbitX <code> "<nickname>"`).
 */
import { definePart, kg } from '@orbital/sdk';
import { ModulePaint } from '../paint.ts';
import { ModuleAnimate, ModuleBay, ModuleCoverShell, ModuleFuelCell } from '../animate.ts';
import { AntennaDish, AntennaWhip, ModuleAntenna } from '../comms.ts';
import { partCost } from '../costs.ts';
import { ModuleDataStorage } from '../data.ts';
import {
	ModuleCommand,
	ModuleDecoupler,
	ModuleEngine,
	ModuleLandingLeg,
	ModuleProbeComputer,
	ModuleReactionWheel,
	ModuleResourceContainer,
	ModuleScrubber,
	ModuleWing
} from '../modules.ts';
import { ModuleParachute } from '../parachute.ts';
import {
	ElectricCharge,
	Food,
	LiquidFuel,
	Monopropellant,
	Oxidizer,
	SolidFuel,
	Supplies,
	Oxygen,
	Water
} from '../resources.ts';
import {
	ExperimentAtmosphereSample,
	ExperimentGoo,
	ExperimentMagnetometer,
	ExperimentMaterials,
	ExperimentObservation,
	ExperimentPressure,
	ExperimentSeismic,
	ExperimentSurfaceSample,
	ExperimentTemperature,
	ModuleExperiment
} from '../science.ts';
import { ModuleRtg, ModuleSolarPanel } from '../solar.ts';
import {
	engineCost,
	engineMass,
	lfoxKg,
	tankCost,
	tankDryMass,
	type EngineKind
} from './realism.ts';
import { stackNodes, type Vec3Tuple } from './shared.ts';

const WHITE = { primary: '#e9ebee', secondary: '#2a2e35', accent: '#e0572b' };
const radialAt = (x: number) => ({
	radial: { pos: [-x, 0, 0] as Vec3Tuple, dir: [-1, 0, 0] as Vec3Tuple }
});
const box = (x: number, y: number, z: number) => ({
	kind: 'box' as const,
	size: [x, y, z] as [number, number, number]
});
const cyl = (radius: number, height: number) => ({ kind: 'cylinder' as const, radius, height });
const bottomOnly = (height: number, size: number) => ({
	bottom: { pos: [0, -height / 2, 0] as Vec3Tuple, dir: [0, -1, 0] as Vec3Tuple, size }
});
const LFOX = (fuel: number) => ({
	[LiquidFuel.id]: { capacity: fuel },
	[Oxidizer.id]: { capacity: Math.round((fuel * 11) / 9) }
});
const lfox = [
	{ resource: LiquidFuel.id, ratio: 0.9 },
	{ resource: Oxidizer.id, ratio: 1.1 }
];

// ---- power (plan 280, ADR 0259) -------------------------------------------------------------

export const PartSolarFlat = definePart({
	id: 'stock.solar-flat',
	title: 'OrbitX SD-1 "Slate"',
	mass: kg(10),
	cost: partCost(10, 'command'),
	impactTolerance: 8,
	shape: box(0.04, 0.5, 0.5),
	visual: {
		kind: 'solar-flat',
		palette: { primary: '#d5d8dc', secondary: '#2b2f36', accent: '#7a8aa6' }
	},
	attach: radialAt(0.02),
	modules: [[ModuleSolarPanel, { rate: 0.35, deployable: false, normal: [1, 0, 0] }]]
});

export const PartSolarFold = definePart({
	id: 'stock.solar-fold',
	title: 'OrbitX SD-6 "Wing"',
	mass: kg(25),
	cost: partCost(25, 'command'),
	impactTolerance: 6,
	shape: box(0.12, 0.5, 0.3),
	visual: {
		kind: 'solar-fold',
		palette: { primary: '#d5d8dc', secondary: '#2b2f36', accent: '#e3a61f' },
		params: { reach: 0.3, panel: 0.42, panels: 3 },
		deploy: { module: ModuleSolarPanel.id, flag: 'deployed', seconds: 2.5 }
	},
	attach: radialAt(0.06),
	modules: [[ModuleSolarPanel, { rate: 1.6, normal: [1, 0, 0] }]]
});

export const PartSolarArrayXl = definePart({
	id: 'stock.solar-array-xl',
	title: 'OrbitX SD-24 "Span"',
	mass: kg(300),
	cost: partCost(300, 'command'),
	impactTolerance: 5,
	shape: box(0.24, 0.7, 0.36),
	visual: {
		kind: 'solar-array',
		palette: { primary: '#d5d8dc', secondary: '#2b2f36', accent: '#e3a61f' },
		params: { mast: 0.6, wing: 2.4, width: 0.9 },
		deploy: { module: ModuleSolarPanel.id, flag: 'deployed', seconds: 5 }
	},
	attach: radialAt(0.12),
	modules: [[ModuleSolarPanel, { rate: 8.25, mode: 'track' }]]
});

export const PartSolarWings = definePart({
	id: 'stock.solar-wings',
	title: 'OrbitX SD-W "Flap"',
	mass: kg(120),
	cost: partCost(120, 'command'),
	impactTolerance: 6,
	shape: cyl(0.625, 0.35),
	visual: {
		kind: 'solar-wings',
		palette: { primary: '#d5d8dc', secondary: '#2b2f36', accent: '#e3a61f' },
		params: { panel: 0.7, panels: 4 },
		deploy: { module: ModuleSolarPanel.id, flag: 'deployed', seconds: 4 }
	},
	attach: stackNodes(0.35),
	modules: [[ModuleSolarPanel, { rate: 3, normal: [0, 0, 1], stageable: true }]]
});

export const PartBatteryRadial = definePart({
	id: 'stock.battery-radial',
	title: 'OrbitX BA-1R "Cell"',
	mass: kg(5),
	cost: partCost(5, 'command'),
	impactTolerance: 8,
	shape: box(0.08, 0.3, 0.2),
	visual: {
		kind: 'battery',
		palette: { primary: '#d5d8dc', secondary: '#2b2f36', accent: '#e3a61f' },
		params: { radial: true }
	},
	attach: radialAt(0.04),
	modules: [[ModuleResourceContainer, { contents: { [ElectricCharge.id]: { capacity: 100 } } }]]
});

export const PartRtgRadial = definePart({
	id: 'stock.rtg-radial',
	title: 'OrbitX SD-R "Hearth"',
	mass: kg(80),
	cost: partCost(80, 'engine'),
	impactTolerance: 8,
	shape: box(0.36, 0.6, 0.36),
	visual: { kind: 'rtg', palette: { primary: '#3b4047', secondary: '#e3a61f', accent: '#d9552b' } },
	attach: radialAt(0.18),
	modules: [[ModuleRtg, {}]]
});

export const PartFuelCell = definePart({
	id: 'stock.fuel-cell',
	title: 'OrbitX SD-F "Ember"',
	mass: kg(50),
	cost: partCost(50, 'command'),
	impactTolerance: 8,
	shape: box(0.2, 0.35, 0.3),
	visual: { kind: 'fuel-cell', palette: WHITE },
	attach: radialAt(0.1),
	modules: [[ModuleFuelCell, { rate: 1.5 }]]
});

// ---- comms (plan 280) -------------------------------------------------------------------------

export const PartWhipRadial = definePart({
	id: 'stock.antenna-whip-radial',
	title: 'OrbitX GC-16 "Whip"',
	mass: kg(5),
	cost: partCost(5, 'command'),
	impactTolerance: 6,
	shape: box(0.08, 0.12, 0.08),
	visual: {
		kind: 'antenna-whip',
		palette: WHITE,
		params: { length: 1.2 },
		deploy: { module: ModuleAntenna.id, flag: 'enabled', seconds: 1.5 }
	},
	attach: radialAt(0.04),
	modules: [[ModuleAntenna, { antenna: AntennaWhip.id }]]
});

export const PartDishFold = definePart({
	id: 'stock.antenna-dish-fold',
	title: 'OrbitX GC-5 "Umbrella"',
	mass: kg(60),
	cost: partCost(60, 'command'),
	impactTolerance: 6,
	shape: box(0.14, 0.3, 0.3),
	visual: {
		kind: 'antenna-dish',
		palette: WHITE,
		params: { dish: 0.45, arm: 0.35 },
		deploy: { module: ModuleAntenna.id, flag: 'enabled', seconds: 2.5 }
	},
	attach: radialAt(0.07),
	modules: [[ModuleAntenna, { antenna: AntennaDish.id }]]
});

export const PartRelayDish = definePart({
	id: 'stock.antenna-relay',
	title: 'OrbitX GC-88 "Dish"',
	mass: kg(200),
	cost: partCost(200, 'command'),
	impactTolerance: 5,
	shape: cyl(0.9, 1.0),
	visual: { kind: 'antenna-relay', palette: WHITE },
	attach: bottomOnly(1.0, 1.25),
	modules: [[ModuleAntenna, { antenna: AntennaDish.id }]]
});

// ---- science and containers (plan 280) -------------------------------------------------------

function radialInstrument(
	id: string,
	title: string,
	massKg: number,
	experiment: string,
	label: string,
	kind: string,
	size: [number, number, number],
	held = false
) {
	const doors = kind === 'goo' || kind === 'materials';
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'command'),
		impactTolerance: 8,
		shape: box(...size),
		visual: {
			kind: 'instrument',
			palette: WHITE,
			params: { kind },
			...(doors ? { deploy: { module: ModuleAnimate.id, flag: 'open', seconds: 1.5 } } : {})
		},
		attach: radialAt(size[0] / 2),
		modules: [
			[ModuleExperiment, { experiment, label, ...(held ? { held: true } : {}) }],
			...(doors ? [[ModuleAnimate, { label: 'Doors' }] as const] : [])
		]
	});
}

export const PartThermometerRadial = radialInstrument(
	'stock.thermometer-radial',
	'OrbitX SI-T "Thermo"',
	10,
	ExperimentTemperature.id,
	'Log temperature',
	'thermometer',
	[0.12, 0.2, 0.14]
);
export const PartBarometerRadial = radialInstrument(
	'stock.barometer-radial',
	'OrbitX SI-P "Baro"',
	10,
	ExperimentPressure.id,
	'Log pressure',
	'barometer',
	[0.14, 0.18, 0.18]
);
export const PartSeismometerRadial = radialInstrument(
	'stock.seismometer-radial',
	'OrbitX SI-S "Tremor"',
	20,
	ExperimentSeismic.id,
	'Log seismic activity',
	'seismometer',
	[0.2, 0.2, 0.2]
);
export const PartAtmosphereRadial = radialInstrument(
	'stock.atmosphere-radial',
	'OrbitX SI-A "Sniffer"',
	15,
	ExperimentAtmosphereSample.id,
	'Take air sample',
	'atmosphere',
	[0.22, 0.2, 0.2]
);
export const PartSurfaceRadial = radialInstrument(
	'stock.surface-sampler-radial',
	'OrbitX SI-G "Scoop"',
	30,
	ExperimentSurfaceSample.id,
	'Take surface sample',
	'surface',
	[0.2, 0.3, 0.2]
);
export const PartGooRadial = radialInstrument(
	'stock.goo-radial',
	'OrbitX SI-L "Goo"',
	50,
	ExperimentGoo.id,
	'Observe goo',
	'goo',
	[0.3, 0.4, 0.3],
	true
);
export const PartMaterialsRadial = radialInstrument(
	'stock.materials-radial',
	'OrbitX SI-M "Mini Lab"',
	200,
	ExperimentMaterials.id,
	'Study materials',
	'materials',
	[0.45, 0.7, 0.6],
	true
);
export const PartMagnetometer = definePart({
	id: 'stock.magnetometer-boom',
	title: 'OrbitX SI-B "Fieldfinder"',
	mass: kg(25),
	cost: partCost(25, 'command'),
	impactTolerance: 6,
	shape: box(1.4, 0.12, 0.12),
	visual: { kind: 'boom', palette: WHITE },
	attach: radialAt(0.7),
	modules: [[ModuleExperiment, { experiment: ExperimentMagnetometer.id, label: 'Scan the field' }]]
});

export const PartSuppliesRadial = definePart({
	id: 'stock.life-support-radial',
	title: 'OrbitX LS-1 "Ration"',
	mass: kg(40),
	// stores, like the LS-0 pack: the tank rate, not a pod's (system audit #25, plan 380)
	cost: partCost(40, 'tank'),
	impactTolerance: 8,
	shape: box(0.3, 0.6, 0.3),
	visual: { kind: 'container', palette: WHITE, params: { kind: 'supplies' } },
	attach: radialAt(0.15),
	modules: [
		[
			ModuleResourceContainer,
			{
				contents: {
					[Supplies.id]: { capacity: 6 },
					[Oxygen.id]: { capacity: 6 },
					[Water.id]: { capacity: 6 },
					[Food.id]: { capacity: 6 }
				}
			}
		]
	]
});
export const PartScrubberRadial = definePart({
	id: 'stock.scrubber-radial',
	title: 'OrbitX LS-2 "Filter"',
	mass: kg(30),
	cost: partCost(30, 'command'),
	impactTolerance: 8,
	shape: box(0.2, 0.4, 0.3),
	visual: { kind: 'container', palette: WHITE, params: { kind: 'scrubber' } },
	attach: radialAt(0.1),
	modules: [[ModuleScrubber, { crew: 3, charge: 10 }]]
});
export const PartDataRadial = definePart({
	id: 'stock.data-drive-radial',
	title: 'OrbitX NA-D "Archive"',
	mass: kg(20),
	cost: partCost(20, 'command'),
	impactTolerance: 8,
	shape: box(0.16, 0.3, 0.24),
	visual: { kind: 'container', palette: WHITE, params: { kind: 'data' } },
	attach: radialAt(0.08),
	modules: [[ModuleDataStorage, { capacity: 64 * 1024 * 1024 }]]
});

// ---- bays and structure (plan 281, ADR 0261) ---------------------------------------------------

function bay(
	id: string,
	title: string,
	size: number,
	height: number,
	massKg: number,
	cargo: boolean
) {
	const r = size / 2;
	const inner = r * 0.9;
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'structure'),
		impactTolerance: 8,
		shape: cyl(r, height),
		visual: {
			kind: 'service-bay',
			palette: WHITE,
			params: { doors: cargo ? 2 : 4, cargo },
			deploy: { module: ModuleBay.id, flag: 'open', seconds: cargo ? 6 : 2 }
		},
		// a cargo bay has a seat on its floor, facing up, for the payload it carries
		attach: cargo
			? {
					...stackNodes(height, size),
					inner: {
						pos: [0, -height / 2 + 0.06, 0] as Vec3Tuple,
						dir: [0, 1, 0] as Vec3Tuple,
						size: 1.25
					}
				}
			: stackNodes(height, size),
		modules: [
			[
				ModuleBay,
				{
					profile: [
						{ y: -height / 2 + 0.05, r: inner },
						{ y: height / 2 - 0.05, r: inner }
					]
				}
			]
		]
	});
}
export const PartServiceBay = bay(
	'stock.service-bay',
	'OrbitX RS-SB12 "Bay"',
	1.25,
	0.8,
	120,
	false
);
export const PartServiceBayWide = bay(
	'stock.service-bay-wide',
	'OrbitX RS-SB25 "Bay"',
	2.5,
	1.2,
	400,
	false
);
export const PartCargoBay = bay('stock.cargo-bay', 'OrbitX RS-CB25 "Hold"', 2.5, 4, 1_500, true);

/** The petals' four panels as debris once thrown off (plan 345), one per quarter from +Z round. */
const PETAL_PANELS = [0, 1, 2, 3].map((i) =>
	definePart({
		id: `stock.petal-panel-${i}`,
		title: 'Petal panel',
		mass: kg(225),
		cost: 0,
		impactTolerance: 8,
		shape: { kind: 'box', size: [0.4, 3.3, 2.4] },
		visual: {
			kind: 'petal-panel',
			palette: WHITE,
			params: { quarter: i, radius: 1.875, top: 1.25 }
		},
		catalog: { hidden: true }
	})
);

export const PartPayloadPetals = definePart({
	id: 'stock.payload-petals',
	title: 'OrbitX RS-PL "Petal"',
	// the ring; the four panels' 900 kg ride on the bay until they are thrown off (plan 345)
	mass: kg(300),
	cost: partCost(1_200, 'structure'),
	impactTolerance: 8,
	shape: cyl(1.875, 3.5),
	visual: {
		kind: 'petals',
		palette: WHITE,
		params: { top: 1.25 },
		deploy: { module: ModuleBay.id, flag: 'open', seconds: 3, gone: 'jettisoned' }
	},
	// `inner`: a seat inside, on the floor, facing up: the lander rides there (Apollo's SLA)
	attach: {
		...stackNodes(3.5, 2.5, 3.75),
		inner: { pos: [0, -1.7, 0], dir: [0, 1, 0], size: 1.25 }
	},
	modules: [
		[
			ModuleBay,
			{
				profile: [
					{ y: -1.7, r: 1.7 },
					{ y: 1.7, r: 1.15 }
				],
				stageable: true,
				// single use, as the Apollo SLA: opening throws the four panels off
				jettison: {
					panels: PETAL_PANELS.map((p) => p.id),
					mass: 900,
					radius: 1.875 + 0.45,
					push: 0.8
				}
			}
		]
	],
	stagingIcon: 'decoupler'
});

function couplerPart(ways: 2 | 3 | 4) {
	const h = 0.6;
	const child = 1.25;
	const off = ways === 2 ? 0.625 : 0.72;
	const nodes: Record<string, { pos: Vec3Tuple; dir: Vec3Tuple; size: number }> = {
		top: { pos: [0, h / 2, 0], dir: [0, 1, 0], size: 2.5 }
	};
	for (let i = 0; i < ways; i++) {
		const a = (i / ways) * Math.PI * 2 + (ways === 2 ? Math.PI / 2 : 0);
		nodes[i === 0 ? 'bottom' : `bottom${i + 1}`] = {
			pos: [
				Math.round(Math.sin(a) * off * 1e6) / 1e6,
				-h / 2,
				Math.round(Math.cos(a) * off * 1e6) / 1e6
			],
			dir: [0, -1, 0],
			size: child
		};
	}
	return definePart({
		id: `stock.coupler-${ways}`,
		title: `OrbitX RS-C${ways} "Branch"`,
		mass: kg(100 * ways),
		cost: partCost(100 * ways, 'structure'),
		impactTolerance: 8,
		shape: cyl(Math.max(1.25, off + child / 2), h),
		visual: {
			kind: 'coupler',
			palette: WHITE,
			params: { ways, child: child / 2, offset: off, top: 1.25 }
		},
		attach: nodes
	});
}
export const PartCoupler2 = couplerPart(2);
export const PartCoupler3 = couplerPart(3);
export const PartCoupler4 = couplerPart(4);

export const PartTruss = definePart({
	id: 'stock.truss',
	title: 'OrbitX RS-T "Frame"',
	mass: kg(150),
	cost: partCost(150, 'structure'),
	impactTolerance: 10,
	shape: box(1, 2, 1),
	visual: {
		kind: 'truss',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e3a61f' }
	},
	attach: {
		top: { pos: [0, 1, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -1, 0], dir: [0, -1, 0] }
	}
});

export const PartHub = definePart({
	id: 'stock.hub',
	title: 'OrbitX RS-H6 "Node"',
	mass: kg(400),
	cost: partCost(400, 'structure'),
	impactTolerance: 10,
	shape: cyl(1.5, 1.6),
	visual: { kind: 'hub', palette: WHITE, params: { port: 0.625 } },
	attach: {
		...stackNodes(1.6),
		east: { pos: [1.35, 0, 0], dir: [1, 0, 0], size: 1.25 },
		west: { pos: [-1.35, 0, 0], dir: [-1, 0, 0], size: 1.25 },
		north: { pos: [0, 0, 1.35], dir: [0, 0, 1], size: 1.25 },
		south: { pos: [0, 0, -1.35], dir: [0, 0, -1], size: 1.25 }
	}
});

export const PartLatticeInterstage = definePart({
	id: 'stock.lattice-interstage',
	title: 'OrbitX RS-LI "Lattice"',
	mass: kg(200),
	cost: partCost(200, 'structure'),
	impactTolerance: 8,
	shape: cyl(1.25, 1.2),
	visual: {
		kind: 'lattice',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e3a61f' }
	},
	attach: stackNodes(1.2, 2.5),
	// an open lattice: the stage below can fire through it, and fuel does not pass
	crossfeed: false
});

// ---- crew and command (plans 297, 300) --------------------------------------------------------

const pod = (opts: {
	id: string;
	title: string;
	massKg: number;
	crew: number;
	shape: { kind: 'cylinder'; radius: number; height: number };
	kind: string;
	params?: Record<string, number | string | boolean>;
	attach: Record<string, { pos: Vec3Tuple; dir: Vec3Tuple; size?: number }>;
	command?: boolean;
	chutes?: number;
	heat?: boolean;
}) =>
	definePart({
		id: opts.id,
		title: opts.title,
		mass: kg(opts.massKg),
		crewCapacity: opts.crew,
		cost: partCost(opts.massKg, 'command'),
		impactTolerance: 10,
		maxTemperature: opts.heat ? 2_400 : 1_400,
		shape: opts.shape,
		...(opts.heat
			? { centerOfMass: [0, -opts.shape.height * 0.12, 0] as Vec3Tuple, bluntBase: 0.35 }
			: {}),
		visual: {
			kind: opts.kind,
			palette: WHITE,
			...(opts.params ? { params: opts.params } : {}),
			...(opts.chutes
				? { deploy: { module: ModuleParachute.id, flag: 'canopy', seconds: 1.5 } }
				: {}),
			// the Hangar's Paint setting (plan 355): white, or the bare metal of a command module
			paramsFrom: ModulePaint.id
		},
		attach: opts.attach,
		hatch: { pos: [0, 0, opts.shape.radius * 0.98], dir: [0, 0, 1] },
		modules: [
			[ModulePaint, { offers: ['default', 'steel'] }] as const,
			...(opts.command === false ? [] : [[ModuleCommand, {}] as const]),
			[
				ModuleResourceContainer,
				{
					contents: {
						[ElectricCharge.id]: { capacity: 50 * opts.crew + 50 },
						// full at build (plan 309): a crewed ship's RCS flies on it
						[Monopropellant.id]: { capacity: 10 * opts.crew }
					}
				}
			],
			...(opts.chutes
				? [
						[
							ModuleParachute,
							{
								// a reefed canopy, as the stock chute's 10 of 480 (plan 309: was 10× the full one)
								semiDragArea: opts.chutes / 40,
								fullDragArea: opts.chutes,
								anchor: [0, opts.shape.height / 2, 0] as [number, number, number]
							}
						] as const
					]
				: [])
		],
		stagingIcon: opts.chutes ? 'parachute' : 'command'
	});

export const PartPod3 = pod({
	id: 'stock.pod-3',
	title: 'OrbitX PC-3 "Bell"',
	massKg: 2_700,
	crew: 3,
	shape: cyl(1.25, 1.7),
	kind: 'capsule',
	params: { collarRadius: 0.625, collarHeight: 0.14, drumTop: -0.35, chutes: true, canopy: 16 },
	attach: stackNodes(1.7, 1.25, 2.5),
	chutes: 1_400,
	heat: true
});
export const PartDescentModule = pod({
	id: 'stock.descent-module',
	title: 'OrbitX PC-D "Lantern"',
	massKg: 2_200,
	crew: 3,
	shape: cyl(0.9375, 1.5),
	kind: 'headlight',
	params: { top: 0.3125 },
	attach: stackNodes(1.5, 0.625, 1.875),
	heat: true
});
export const PartOrbitalModule = pod({
	id: 'stock.orbital-module',
	title: 'OrbitX PC-O "Orb"',
	massKg: 900,
	crew: 2,
	shape: cyl(0.75, 1.5),
	kind: 'sphere-capsule',
	params: { bottom: 0.3125, top: 0.3125 },
	attach: stackNodes(1.5, 0.625),
	command: false
});
export const PartSphereCapsule = pod({
	id: 'stock.capsule-sphere',
	title: 'OrbitX PC-1S "Orient"',
	massKg: 1_300,
	crew: 1,
	shape: cyl(0.625, 1.25),
	kind: 'sphere-capsule',
	params: { bottom: 0.3125, top: 0.3125 },
	attach: stackNodes(1.25, 0.625),
	heat: true
});
export const PartConeCapsule = pod({
	id: 'stock.capsule-cone',
	title: 'OrbitX PC-1K "Quicksilver"',
	massKg: 1_000,
	crew: 1,
	shape: cyl(0.625, 1.4),
	kind: 'cone-capsule',
	params: { top: 0.3125 },
	attach: stackNodes(1.4, 0.625, 1.25),
	heat: true
});
export const PartLanderCan = pod({
	id: 'stock.lander-can',
	title: 'OrbitX PC-L1 "Can"',
	massKg: 600,
	crew: 1,
	shape: cyl(0.625, 1.0),
	kind: 'crew-can',
	params: { kind: 'lander' },
	attach: stackNodes(1.0)
});
export const PartCrewCabin = pod({
	id: 'stock.crew-cabin',
	title: 'OrbitX PC-K2 "Cabin"',
	massKg: 1_000,
	crew: 2,
	shape: cyl(0.625, 1.6),
	kind: 'crew-can',
	params: { kind: 'cabin' },
	attach: stackNodes(1.6),
	command: false
});
export const PartHabModule = pod({
	id: 'stock.hab-module',
	title: 'OrbitX ST-H "Home"',
	massKg: 6_000,
	crew: 4,
	shape: cyl(1.25, 4),
	kind: 'crew-can',
	params: { kind: 'hab' },
	attach: stackNodes(4, 2.5),
	command: false
});
export const PartLabModule = pod({
	id: 'stock.lab-module',
	title: 'OrbitX ST-L "Workshop"',
	massKg: 7_000,
	crew: 2,
	shape: cyl(1.25, 4),
	kind: 'crew-can',
	params: { kind: 'lab' },
	attach: stackNodes(4, 2.5),
	command: false
});
export const PartAirlock = pod({
	id: 'stock.airlock',
	title: 'OrbitX ST-A "Gate"',
	massKg: 500,
	crew: 1,
	shape: cyl(0.625, 1.0),
	kind: 'crew-can',
	params: { kind: 'cabin', top: 0.3125 },
	attach: stackNodes(1.0, 0.625, 1.25),
	command: false
});
export const PartCupola = pod({
	id: 'stock.cupola',
	title: 'OrbitX ST-C "Window"',
	massKg: 1_000,
	crew: 1,
	shape: cyl(0.625, 0.9),
	kind: 'cupola',
	attach: bottomOnly(0.9, 1.25)
});
export const PartRoverCab = pod({
	id: 'stock.rover-cab',
	title: 'OrbitX RV-2 "Ranger"',
	massKg: 700,
	crew: 2,
	shape: cyl(0.625, 1.0),
	kind: 'crew-can',
	params: { kind: 'lander' },
	attach: stackNodes(1.0)
});

export const PartRadiator = definePart({
	id: 'stock.radiator',
	title: 'OrbitX TH-R "Fin"',
	mass: kg(50),
	cost: partCost(50, 'structure'),
	impactTolerance: 6,
	shape: box(0.6, 1.4, 0.1),
	visual: { kind: 'radiator', palette: WHITE },
	attach: radialAt(0.3)
});

// ---- satellites (plan 298) ---------------------------------------------------------------------

export const PartSatelliteBus = definePart({
	id: 'stock.satellite-bus',
	title: 'OrbitX NA-S "Carrier"',
	mass: kg(400),
	cost: partCost(400, 'command'),
	impactTolerance: 8,
	shape: cyl(0.9, 1.2),
	visual: { kind: 'satellite-bus', palette: WHITE, params: { node: 1.25 } },
	attach: stackNodes(1.2, 1.25),
	modules: [
		[ModuleCommand, {}],
		[ModuleProbeComputer, {}],
		[ModuleReactionWheel, { torque: 5_000, chargeRate: 0.6 }],
		[
			ModuleResourceContainer,
			{
				contents: {
					[ElectricCharge.id]: { capacity: 400 },
					// a bus carries its thrusters' propellant (owner, 2026-10-21: RCS said "no propellant")
					[Monopropellant.id]: { capacity: 60 }
				}
			}
		]
	],
	stagingIcon: 'command'
});

export const PartTelescope = definePart({
	id: 'stock.telescope',
	title: 'OrbitX SI-X "Spyglass"',
	mass: kg(2_000),
	cost: partCost(2_000, 'command'),
	impactTolerance: 6,
	shape: cyl(1.25, 5),
	visual: {
		kind: 'telescope',
		palette: WHITE,
		params: { node: 1.25 },
		deploy: { module: ModuleAnimate.id, flag: 'open', seconds: 4 }
	},
	attach: bottomOnly(5, 1.25),
	modules: [
		[ModuleExperiment, { experiment: ExperimentObservation.id, label: 'Observe' }],
		[ModuleAnimate, { label: 'Aperture door' }]
	]
});

// ---- lunar lander (plan 296) -------------------------------------------------------------------

export const PartLanderDescent = definePart({
	id: 'stock.lander-descent',
	title: 'OrbitX LD-1 "Footing"',
	mass: kg(2_000),
	cost: partCost(2_000, 'engine'),
	impactTolerance: 8,
	shape: cyl(1.25, 1.6),
	visual: {
		kind: 'descent-stage',
		palette: WHITE,
		params: { top: 0.625 },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -0.8, 0],
			exitRadius: 0.44,
			length: 3,
			exitPressure: 20_000
		}
	},
	attach: {
		top: { pos: [0, 0.8, 0], dir: [0, 1, 0], size: 1.25 },
		// where it sits in its adapter (a payload seat) before the flight
		bottom: { pos: [0, -0.8, 0], dir: [0, -1, 0], size: 1.25 }
	},
	modules: [
		[
			ModuleEngine,
			{
				thrust: 45_000,
				ispVacuum: 311,
				ispSeaLevel: 120,
				propellants: lfox,
				gimbal: { range: 3, rate: 10 }
			}
		],
		[ModuleResourceContainer, { contents: LFOX(900) }]
	],
	stagingIcon: 'engine'
});

export const PartLanderAscent = definePart({
	id: 'stock.lander-ascent',
	title: 'OrbitX LD-2 "Hopper"',
	mass: kg(1_800),
	crewCapacity: 2,
	cost: partCost(1_800, 'command'),
	impactTolerance: 8,
	shape: cyl(1.0, 1.6),
	visual: {
		kind: 'ascent-cabin',
		palette: WHITE,
		params: { top: 0.3125, bottom: 0.625 },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -0.8, 0],
			exitRadius: 0.2,
			length: 2,
			exitPressure: 20_000
		}
	},
	attach: stackNodes(1.6, 0.625, 1.25),
	hatch: { pos: [0, -0.3, 0.95], dir: [0, 0, 1] },
	modules: [
		[ModuleCommand, {}],
		[ModuleEngine, { thrust: 16_000, ispVacuum: 311, ispSeaLevel: 120, propellants: lfox }],
		[
			ModuleResourceContainer,
			{
				contents: {
					...LFOX(250),
					[ElectricCharge.id]: { capacity: 150 },
					[Monopropellant.id]: { capacity: 40 }
				}
			}
		]
	],
	stagingIcon: 'engine'
});

export const PartSingleLeg = definePart({
	id: 'stock.landing-leg-single',
	title: 'OrbitX LD-K "Stilt"',
	mass: kg(60),
	cost: partCost(60, 'gear'),
	impactTolerance: 14,
	shape: box(0.2, 0.5, 0.2),
	visual: {
		kind: 'single-leg',
		palette: WHITE,
		params: { spread: 1.0, drop: 1.0, footSize: 0.35 },
		deploy: { module: ModuleLandingLeg.id, flag: 'deployed', seconds: 1.5 }
	},
	attach: radialAt(0.1),
	modules: [[ModuleLandingLeg, { spread: 1.0, drop: 1.0, footSize: 0.35, layout: 'single' }]],
	stagingIcon: 'legs'
});

// ---- engines (plan 276) ------------------------------------------------------------------------

/** Bell exit centres of a cluster plate: one on the axis when `centre`, the rest on a ring (the renderer's `clusterLayout`). */
export function plateNozzles(count: number, ring: number, y: number, centre: boolean): Vec3Tuple[] {
	const out: Vec3Tuple[] = centre ? [[0, y, 0]] : [];
	const n = centre ? count - 1 : count;
	for (let k = 0; k < n; k++) {
		const a = Math.PI / n + (2 * Math.PI * k) / n;
		out.push([
			Math.round(ring * Math.cos(a) * 1e6) / 1e6,
			y,
			Math.round(ring * Math.sin(a) * 1e6) / 1e6
		]);
	}
	return out;
}

function enginePlate(opts: {
	id: string;
	title: string;
	size: number;
	height: number;
	bells: number;
	ring: number;
	exit: number;
	thrust: number;
	centre: boolean;
	/** The plate's engine kind and Isp (plan 380: its real counterpart's). */
	kind: EngineKind;
	ispVacuum: number;
	ispSeaLevel: number;
}) {
	const massKg = engineMass(opts.kind, opts.thrust, opts.bells);
	const h2 = opts.height / 2;
	return definePart({
		id: opts.id,
		title: opts.title,
		mass: kg(massKg),
		cost: engineCost(opts.kind, opts.thrust),
		impactTolerance: 4,
		shape: cyl(opts.size / 2, opts.height),
		visual: {
			kind: 'engine-cluster',
			palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
			params: { bells: opts.bells, ring: opts.ring, bellExit: opts.exit, centre: opts.centre },
			plume: {
				module: ModuleEngine.id,
				nozzle: [0, -h2, 0],
				nozzles: plateNozzles(opts.bells, opts.ring, -h2, opts.centre),
				exitRadius: opts.exit,
				length: opts.height * 5,
				exitPressure: 90_000
			},
			articulation: { module: ModuleEngine.id, field: 'gimbal', mode: 'gimbal' },
			// the Hangar's Paint setting (plan 355): bare bells or wrapped in foil blankets
			paramsFrom: ModulePaint.id
		},
		attach: stackNodes(opts.height, opts.size),
		crossfeed: false,
		modules: [
			[ModulePaint, { offers: ['default', 'foil-engines'] }],
			[
				ModuleEngine,
				{
					thrust: opts.thrust,
					ispVacuum: opts.ispVacuum,
					ispSeaLevel: opts.ispSeaLevel,
					propellants: lfox,
					// big first-stage engines gimbal 5–10° (F-1 6°, RS-25 10.5°; plan 309)
					gimbal: { range: 5, rate: 10 }
				}
			]
		],
		stagingIcon: 'engine'
	});
}
export const PartEnginePlate5 = enginePlate({
	id: 'stock.engine-plate-5',
	title: 'OrbitX GP-F5 "Titan"',
	size: 5,
	height: 3,
	bells: 5,
	ring: 1.45,
	exit: 0.75,
	thrust: 7_000_000,
	centre: true,
	// the F-1's figures (S-IC)
	kind: 'kerolox-sl',
	ispVacuum: 304,
	ispSeaLevel: 263
});
export const PartEnginePlate9 = enginePlate({
	id: 'stock.engine-plate-9',
	title: 'OrbitX GP-M9 "Hawk"',
	size: 3.75,
	height: 2.2,
	bells: 9,
	ring: 1.15,
	exit: 0.42,
	thrust: 4_000_000,
	centre: true,
	// the Merlin 1D's (Falcon 9)
	kind: 'kerolox-sl',
	ispVacuum: 311,
	ispSeaLevel: 282
});
export const PartEnginePlate8 = enginePlate({
	id: 'stock.engine-plate-8',
	title: 'OrbitX GP-R8 "Octet"',
	size: 3.75,
	height: 2.2,
	bells: 8,
	ring: 1.25,
	exit: 0.4,
	thrust: 3_200_000,
	centre: false,
	// hydrolox, the RS-25's (the Shuttle's mains; Kronos V's third stage)
	kind: 'hydrolox-sl',
	ispVacuum: 452,
	ispSeaLevel: 366
});

/**
 * The S-IC's five F-1s at their real thrust (plan 380, ADR 0317): a 7.5 m plate for a Saturn V the
 * real size, under the 7.5 m tanks. 38.85 MN in vacuum, 33.6 MN at sea level.
 */
export const PartEnginePlateF1 = enginePlate({
	id: 'stock.engine-plate-f1',
	title: 'OrbitX GP-F1X "Colossus"',
	size: 7.5,
	height: 4.5,
	bells: 5,
	ring: 2.2,
	exit: 1.1,
	thrust: 5 * 7_770_000,
	centre: true,
	kind: 'kerolox-sl',
	ispVacuum: 304,
	ispSeaLevel: 263
});
/** The S-II's five J-2s (plan 380): a 5 m hydrolox plate, 5.17 MN in vacuum. */
export const PartEnginePlateJ2 = enginePlate({
	id: 'stock.engine-plate-j2',
	title: 'OrbitX GP-J5 "Quintet"',
	size: 5,
	height: 3.4,
	bells: 5,
	ring: 1.5,
	exit: 0.62,
	thrust: 5 * 1_033_000,
	centre: true,
	kind: 'hydrolox-vac',
	ispVacuum: 421,
	ispSeaLevel: 200
});

export const PartEngineVacuumXl = definePart({
	id: 'stock.engine-vacuum-xl',
	title: 'OrbitX GP-J2 "Void"',
	mass: kg(engineMass('hydrolox-vac', 1_000_000)),
	cost: engineCost('hydrolox-vac', 1_000_000),
	impactTolerance: 4,
	shape: cyl(1.25, 2.6),
	visual: {
		kind: 'engine',
		palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
		params: { bellExit: 1.0, throat: 0.25 },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -1.3, 0],
			exitRadius: 1.0,
			length: 10,
			exitPressure: 10_000
		},
		articulation: { module: ModuleEngine.id, field: 'gimbal', mode: 'gimbal' }
	},
	attach: stackNodes(2.6, 2.5),
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 1_000_000,
				ispVacuum: 421,
				ispSeaLevel: 200,
				propellants: lfox,
				gimbal: { range: 3, rate: 10 }
			}
		]
	],
	stagingIcon: 'engine'
});

/** The launch escape tower (plan 276): a solid motor on a lattice that carries the pod away and separates from it. */
export const PartEscapeTower = definePart({
	id: 'stock.escape-tower',
	title: 'OrbitX PS-LES "Guardian"',
	mass: kg(900),
	cost: partCost(900, 'engine'),
	impactTolerance: 6,
	shape: cyl(0.65, 3.2),
	visual: {
		kind: 'escape-tower',
		palette: { primary: '#e9ebee', secondary: '#2a2e35', accent: '#d9552b' },
		params: { base: 0.625 },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -0.2, 0],
			exitRadius: 0.1,
			length: 3,
			exitPressure: 90_000
		}
	},
	attach: bottomOnly(3.2, 1.25),
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 750_000,
				ispVacuum: 180,
				ispSeaLevel: 160,
				propellants: [{ resource: SolidFuel.id, ratio: 1 }],
				solid: true
			}
		],
		[ModuleResourceContainer, { contents: { [SolidFuel.id]: { capacity: 40 } } }],
		[ModuleDecoupler, { separates: 'bottom', ejectionImpulse: 3_000 }]
	],
	stagingIcon: 'engine'
});

/** The boost cover's shell, m: its height, and how far below its top the port's face meets it. */
const COVER_HEIGHT = 1.55;
const COVER_SEAT = 0.6;

/**
 * Apollo's Boost Protective Cover (system audit D6): a shell over the capsule's nose that sits on
 * the docking port and carries the escape tower. The port's face meets the cover's `bottom` node
 * inside the shell (its neck and the port hidden under it), the tower stands on `top`; both sizes
 * fit. It leaves with the tower (its own joint fires with the tower's stage), and the port is then
 * free for docking.
 */
export const PartBoostCover = definePart({
	id: 'stock.boost-cover',
	title: 'OrbitX PS-BC "Hood"',
	mass: kg(320),
	cost: partCost(320, 'structure'),
	impactTolerance: 8,
	shape: cyl(0.72, COVER_HEIGHT),
	visual: {
		kind: 'boost-cover',
		palette: { primary: '#eef0f2', secondary: '#2a2e35', accent: '#d9552b' },
		params: { bottom: 0.72, top: 0.625, seat: COVER_HEIGHT / 2 - COVER_SEAT }
	},
	attach: {
		top: { pos: [0, COVER_HEIGHT / 2, 0], dir: [0, 1, 0], size: 1.25 },
		bottom: { pos: [0, COVER_HEIGHT / 2 - COVER_SEAT, 0], dir: [0, -1, 0], size: 0.625 }
	},
	modules: [
		[
			ModuleCoverShell,
			{
				profile: [
					{ y: -COVER_HEIGHT / 2, r: 0.72 },
					{ y: COVER_HEIGHT / 2, r: 0.66 }
				]
			}
		],
		[ModuleDecoupler, { separates: 'bottom', ejectionImpulse: 1_500 }]
	],
	stagingIcon: 'decoupler'
});

// ---- shuttle (plan 295) ------------------------------------------------------------------------

/** The external tank's dry mass: a modern tank of its size class (plan 380; the Shuttle's own was 3.5 %). */
const EXTERNAL_TANK_DRY = tankDryMass(lfoxKg(17_280), 3.75, 'modern');

export const PartOrbiterNose = definePart({
	id: 'stock.orbiter-nose',
	title: 'OrbitX UA-1 "Beak"',
	mass: kg(7_500),
	crewCapacity: 4,
	cost: partCost(7_500, 'command'),
	impactTolerance: 8,
	maxTemperature: 2_200,
	// a long nose that slopes into the windscreen (plan 356)
	shape: cyl(1.25, 4.2),
	visual: { kind: 'orbiter-nose', palette: WHITE },
	attach: bottomOnly(4.2, 2.5),
	hatch: { pos: [1.06, -1.2, 0], dir: [1, 0, 0] },
	modules: [
		[ModuleCommand, {}],
		// a 30 m orbiter turns slowly on 30 kN·m (owner, 2026-10-22: hard to manoeuvre)
		[ModuleReactionWheel, { torque: 90_000, chargeRate: 2.4 }],
		[
			ModuleResourceContainer,
			{
				contents: {
					[ElectricCharge.id]: { capacity: 1_000 },
					[Monopropellant.id]: { capacity: 300 }
				}
			}
		]
	],
	stagingIcon: 'command'
});

/**
 * The orbiter's cargo bay (plan 356): 9 m of fuselage with two clamshell doors on top (+Z) that
 * open along the length. Closed, it shields what it carries (ADR 0261). A keel node on the floor
 * faces up out of the bay, and a node on each inner bulkhead (fore, aft) faces into it, for docking
 * ports: the payload rides docked and leaves on Undock.
 */
export const PartOrbiterBay = definePart({
	id: 'stock.orbiter-bay',
	title: 'OrbitX UA-4 "Keel"',
	mass: kg(2_500),
	cost: partCost(2_500, 'structure'),
	impactTolerance: 6,
	maxTemperature: 2_000,
	shape: cyl(1.25, 9),
	visual: {
		kind: 'orbiter-bay',
		palette: WHITE,
		deploy: { module: ModuleBay.id, flag: 'open', seconds: 6 }
	},
	attach: {
		...stackNodes(9, 2.5),
		keel: { pos: [0, 0, -0.94] as Vec3Tuple, dir: [0, 0, 1] as Vec3Tuple, size: 1.25 },
		// ports on the inner bulkheads, fore and aft, facing into the bay (owner, 2026-10-22)
		fore: {
			pos: [0, 4.46, 0] as Vec3Tuple,
			dir: [0, -1, 0] as Vec3Tuple,
			size: 1.25,
			face: 'seat' as const
		},
		aft: { pos: [0, -4.46, 0] as Vec3Tuple, dir: [0, 1, 0] as Vec3Tuple, size: 1.25 }
	},
	modules: [
		[
			ModuleBay,
			{
				profile: [
					{ y: -4.4, r: 1 },
					{ y: 4.4, r: 1 }
				],
				// the section's flat sides are 1.05 m from the axis (a rounded square)
				walls: { x: 1.05, y: 4.5, z: 1.05 }
			}
		]
	]
});

export const PartOrbiterAft = definePart({
	id: 'stock.orbiter-aft',
	title: 'OrbitX UA-3 "Tail"',
	mass: kg(8_500),
	cost: partCost(8_500, 'engine'),
	impactTolerance: 6,
	maxTemperature: 2_000,
	// wider than the 2.5 m fuselage by the tail fin standing up out of its top (+Z)
	shape: cyl(2.3, 3.5),
	visual: {
		kind: 'orbiter-aft',
		palette: WHITE,
		params: { body: 1.25 },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -1.75, 0],
			nozzles: [
				[0, -1.75, 0.375],
				[-0.45, -1.75, -0.25],
				[0.45, -1.75, -0.25]
			],
			exitRadius: 0.35,
			length: 9,
			exitPressure: 30_000
		}
	},
	attach: { top: { pos: [0, 1.75, 0], dir: [0, 1, 0], size: 2.5 } },
	modules: [
		[
			ModuleEngine,
			{
				thrust: 2_100_000,
				ispVacuum: 450,
				ispSeaLevel: 366,
				propellants: lfox,
				gimbal: { range: 6, rate: 12 }
			}
		],
		// the OMS pods' propellant (plan 356): with the tank gone it circularizes (about 600 m/s after
		// an ascent to 80 km), then deorbits and comes home
		[ModuleResourceContainer, { contents: LFOX(540) }]
	],
	stagingIcon: 'engine'
});

export const PartDeltaWing = definePart({
	id: 'stock.wing-delta',
	title: 'OrbitX UA-2 "Delta Wing"',
	mass: kg(2_500),
	cost: partCost(2_500, 'structure'),
	impactTolerance: 4,
	dragCoefficient: 0.05,
	maxTemperature: 2_000,
	shape: box(4, 6, 0.3),
	// the tiles' face is a Hangar setting (plan 356): the far wing of a pair has them on top
	visual: { kind: 'delta-wing', palette: WHITE, paramsFrom: ModuleWing.id },
	attach: radialAt(2),
	crossfeed: false,
	modules: [[ModuleWing, { area: 14, aspectRatio: 2.8, centre: [0, -0.8, 0], tiled: true }]],
	stagingIcon: 'fin'
});

export const PartExternalTank = definePart({
	id: 'stock.external-tank',
	title: 'OrbitX UA-T "Big Barrel"',
	mass: kg(EXTERNAL_TANK_DRY),
	cost: tankCost(lfoxKg(17_280)),
	impactTolerance: 5,
	shape: cyl(1.875, 20),
	visual: { kind: 'external-tank', palette: WHITE, params: { node: 3.75 } },
	// a radial node: the tank hangs on the orbiter's belly by a radial decoupler
	attach: { ...bottomOnly(20, 3.75), radial: { pos: [-1.875, 0, 0], dir: [-1, 0, 0] } },
	modules: [[ModuleResourceContainer, { contents: LFOX(17_280) }]],
	stagingIcon: 'tank'
});

export const PartSrbXl = definePart({
	id: 'stock.srb-xl',
	title: 'OrbitX PS-XL "Pillar"',
	mass: kg(9_000),
	cost: partCost(9_000, 'engine'),
	impactTolerance: 5,
	shape: cyl(0.9375, 16),
	visual: {
		kind: 'booster',
		palette: { primary: '#ecebe6', secondary: '#23272d', accent: '#d9552b' },
		params: { bellExit: 0.8, livery: 'bands' },
		plume: {
			module: ModuleEngine.id,
			nozzle: [0, -8, 0],
			exitRadius: 0.8,
			length: 14,
			exitPressure: 90_000
		}
	},
	attach: {
		top: { pos: [0, 8, 0], dir: [0, 1, 0], size: 1.875 },
		radial: { pos: [-0.9375, 0, 0], dir: [-1, 0, 0] }
	},
	crossfeed: false,
	modules: [
		[
			ModuleEngine,
			{
				thrust: 3_000_000,
				ispVacuum: 268,
				ispSeaLevel: 242,
				propellants: [{ resource: SolidFuel.id, ratio: 1 }],
				solid: true,
				// the shuttle's boosters steered the stack (8°, plan 309): an off-axis orbiter needs it
				gimbal: { range: 6, rate: 10 }
			}
		],
		[ModuleResourceContainer, { contents: { [SolidFuel.id]: { capacity: 9_000 } } }]
	],
	stagingIcon: 'engine'
});

/** Every part of this file, in registration order. */
export const STOCK_MISSION_PARTS = [
	PartSolarFlat,
	PartSolarFold,
	PartSolarArrayXl,
	PartSolarWings,
	PartBatteryRadial,
	PartRtgRadial,
	PartFuelCell,
	PartWhipRadial,
	PartDishFold,
	PartRelayDish,
	PartThermometerRadial,
	PartBarometerRadial,
	PartSeismometerRadial,
	PartAtmosphereRadial,
	PartSurfaceRadial,
	PartGooRadial,
	PartMaterialsRadial,
	PartMagnetometer,
	PartSuppliesRadial,
	PartScrubberRadial,
	PartDataRadial,
	PartServiceBay,
	PartServiceBayWide,
	PartCargoBay,
	PartPayloadPetals,
	...PETAL_PANELS,
	PartCoupler2,
	PartCoupler3,
	PartCoupler4,
	PartTruss,
	PartHub,
	PartLatticeInterstage,
	PartPod3,
	PartDescentModule,
	PartOrbitalModule,
	PartSphereCapsule,
	PartConeCapsule,
	PartLanderCan,
	PartCrewCabin,
	PartHabModule,
	PartLabModule,
	PartAirlock,
	PartCupola,
	PartRoverCab,
	PartRadiator,
	PartSatelliteBus,
	PartTelescope,
	PartLanderDescent,
	PartLanderAscent,
	PartSingleLeg,
	PartEnginePlate5,
	PartEnginePlate9,
	PartEnginePlate8,
	PartEngineVacuumXl,
	PartEscapeTower,
	PartOrbiterNose,
	PartOrbiterAft,
	PartDeltaWing,
	PartExternalTank,
	PartSrbXl,
	// plan 356, after every older part so their order stays
	PartOrbiterBay,
	// plan 380: the Saturn V's own engines, for Kronos V at real scale
	PartEnginePlateF1,
	PartEnginePlateJ2,
	// system audit D6: Apollo's Boost Protective Cover over the docking port
	PartBoostCover
] as const;
