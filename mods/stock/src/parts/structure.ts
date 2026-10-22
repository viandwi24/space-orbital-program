import { ModuleStrut } from '../tether.ts';
import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleFairing, ModuleFairingPanel } from '../fairing.ts';
import { ModuleDecoupler } from '../modules.ts';
import { cylinder, stackNodes, WIDE_RADIUS, type Vec3Tuple } from './shared.ts';

export const PartDecoupler = definePart({
	id: 'stock.decoupler',
	title: 'Stack Decoupler',
	mass: kg(50),
	cost: partCost(50, 'structure'),
	impactTolerance: 8,
	shape: cylinder(0.2),
	visual: {
		kind: 'decoupler',
		palette: { primary: '#3b4047', accent: '#e3a61f' }
	},
	attach: stackNodes(0.2),
	// Stages are separated by decouplers: no propellant crosses them.
	crossfeed: false,
	modules: [[ModuleDecoupler, { separates: 'top', ejectionImpulse: 2_000 }]],
	stagingIcon: 'decoupler'
});

/** The 2.5 m stack decoupler (plan 210). */
export const PartDecouplerWide = definePart({
	id: 'stock.decoupler-wide',
	title: 'Wide Stack Decoupler',
	mass: kg(200),
	cost: partCost(200, 'structure'),
	impactTolerance: 8,
	shape: cylinder(0.25, WIDE_RADIUS),
	visual: {
		kind: 'decoupler',
		palette: { primary: '#3b4047', accent: '#e3a61f' }
	},
	attach: stackNodes(0.25, 2.5),
	crossfeed: false,
	modules: [[ModuleDecoupler, { separates: 'top', ejectionImpulse: 5_000 }]],
	stagingIcon: 'decoupler'
});

/**
 * A stack decoupler of class `size` m (plan 289): mass and ejection impulse grow with the face area
 * from the wide decoupler (200 kg, 5,000 N·s at 2.5 m), as a stage's mass grows with diameter².
 */
function classDecoupler(id: string, title: string, size: number, height: number) {
	const area = (size / 2.5) ** 2;
	const massKg = Math.round((200 * area) / 10) * 10;
	return definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'structure'),
		impactTolerance: 8,
		shape: cylinder(height, size / 2),
		visual: {
			kind: 'decoupler',
			palette: { primary: '#3b4047', accent: '#e3a61f' }
		},
		attach: stackNodes(height, size),
		crossfeed: false,
		modules: [
			[
				ModuleDecoupler,
				{ separates: 'top', ejectionImpulse: Math.round((5_000 * area) / 100) * 100 }
			]
		],
		stagingIcon: 'decoupler'
	});
}

export const PartDecoupler1875 = classDecoupler(
	'stock.decoupler-1875',
	'OrbitX RS-TD18 "Split"',
	1.875,
	0.22
);
export const PartDecoupler3750 = classDecoupler(
	'stock.decoupler-3750',
	'OrbitX RS-TD37 "Split"',
	3.75,
	0.3
);
export const PartDecoupler5000 = classDecoupler(
	'stock.decoupler-5000',
	'OrbitX RS-TD50 "Split"',
	5,
	0.35
);
export const PartDecoupler7500 = classDecoupler(
	'stock.decoupler-7500',
	'OrbitX RS-TD75 "Split"',
	7.5,
	0.45
);

/**
 * A plate that bolts to the side of a stack part (radial attachment, ADR 0034) and carries a
 * booster on its `outer` face. Staged, it fires the `radial` link: it leaves with the booster.
 * Boosters are staged with symmetric copies, so the pushes cancel.
 */
export const PartRadialDecoupler = definePart({
	id: 'stock.radial-decoupler',
	title: 'Radial Decoupler',
	mass: kg(40),
	cost: partCost(40, 'structure'),
	impactTolerance: 8,
	shape: { kind: 'box', size: [0.2, 0.6, 0.45] },
	visual: {
		kind: 'radial-decoupler',
		palette: { primary: '#3b4047', accent: '#e3a61f' }
	},
	attach: {
		radial: { pos: [-0.1, 0, 0], dir: [-1, 0, 0] },
		outer: { pos: [0.1, 0, 0], dir: [1, 0, 0] }
	},
	crossfeed: false,
	modules: [[ModuleDecoupler, { separates: 'radial', ejectionImpulse: 4_000 }]],
	stagingIcon: 'decoupler'
});

/** Radius of the connector parts' stubs, m. */
const CONNECTOR_RADIUS = 0.04;

const connectorNode = {
	end: { pos: [-CONNECTOR_RADIUS, 0, 0] as Vec3Tuple, dir: [-1, 0, 0] as Vec3Tuple }
};

/**
 * A strut: a rigid bar from the part it hangs on to a second part (ADR 0071). The vessel is one
 * rigid body (ADR 0018), so it adds no stiffness; it adds its mass and drag and is cut when a
 * separation puts its two ends on different vessels.
 */
export const PartStrut = definePart({
	id: 'stock.strut',
	title: 'Strut',
	mass: kg(20),
	cost: partCost(20, 'structure'),
	impactTolerance: 3,
	connector: {},
	shape: { kind: 'cylinder', radius: CONNECTOR_RADIUS, height: 0.1 },
	visual: { kind: 'strut', palette: { primary: '#aeb4bc', secondary: '#23272d' } },
	attach: connectorNode,
	crossfeed: false,
	// it may let go of its far end in flight (plan 313)
	modules: [[ModuleStrut, {}]],
	stagingIcon: 'decoupler'
});

/**
 * A fuel line: propellant of the part it hangs on is drawn by whatever draws on the part its far
 * end lands on, ahead of that part's own (ADR 0071). One way: it does not carry fuel back.
 */
export const PartFuelLine = definePart({
	id: 'stock.fuel-line',
	title: 'Fuel Line',
	mass: kg(10),
	cost: partCost(10, 'structure'),
	impactTolerance: 3,
	connector: { feeds: true },
	shape: { kind: 'cylinder', radius: CONNECTOR_RADIUS, height: 0.1 },
	visual: { kind: 'fuel-line', palette: { primary: '#d9552b', secondary: '#23272d' } },
	attach: connectorNode,
	crossfeed: false
});

// ---------------------------------------------------------------------------------------------
// Size adapters (plan 207, ADR 0212): a stack changes size class through one of these.
// ---------------------------------------------------------------------------------------------

/** An adapter with a `top` m joint over a `bottom` m joint; it passes propellant through. */
const adapterPart = (
	id: string,
	title: string,
	top: number,
	bottom: number,
	height: number,
	massKg: number
) =>
	definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'structure'),
		impactTolerance: 8,
		shape: { kind: 'cylinder', radius: Math.max(top, bottom) / 2, height },
		visual: {
			kind: 'adapter',
			palette: { primary: '#e6e3da', secondary: '#23272d', accent: '#e0572b' },
			params: { top: top / 2, bottom: bottom / 2 }
		},
		attach: stackNodes(height, top, bottom)
	});

export const PartAdapterSmall = adapterPart(
	'stock.adapter-small',
	'Adapter 0.625 – 1.25 m',
	0.625,
	1.25,
	0.6,
	40
);
export const PartAdapterLarge = adapterPart(
	'stock.adapter-large',
	'Adapter 1.25 – 2.5 m',
	1.25,
	2.5,
	1,
	150
);

export const STOCK_ADAPTER_PARTS = [PartAdapterSmall, PartAdapterLarge] as const;

// The adapters between the size classes of plan 289 (ADR 0256), smaller face on top.
export const PartAdapter1250To1875 = adapterPart(
	'stock.adapter-1250-1875',
	'OrbitX RS-AD12-18 "Funnel"',
	1.25,
	1.875,
	0.6,
	70
);
export const PartAdapter1875To2500 = adapterPart(
	'stock.adapter-1875-2500',
	'OrbitX RS-AD18-25 "Funnel"',
	1.875,
	2.5,
	0.6,
	100
);
export const PartAdapter2500To3750 = adapterPart(
	'stock.adapter-2500-3750',
	'OrbitX RS-AD25-37 "Funnel"',
	2.5,
	3.75,
	1.2,
	300
);
export const PartAdapter3750To5000 = adapterPart(
	'stock.adapter-3750-5000',
	'OrbitX RS-AD37-50 "Funnel"',
	3.75,
	5,
	1.2,
	450
);
export const PartAdapter5000To7500 = adapterPart(
	'stock.adapter-5000-7500',
	'OrbitX RS-AD50-75 "Funnel"',
	5,
	7.5,
	2.4,
	1_200
);

/** A fairing base (plan 219, ADR 0224): its shell is built in the Hangar from sections. */
function fairingBase(id: string, title: string, size: number, dry: number) {
	const height = 0.2;
	return definePart({
		id,
		title,
		mass: kg(dry),
		cost: partCost(dry, 'structure'),
		impactTolerance: 8,
		maxTemperature: 2_000,
		shape: cylinder(height, size / 2),
		visual: {
			kind: 'fairing',
			palette: { primary: '#eceee9', secondary: '#3b4047', accent: '#e3a61f' },
			paramsFrom: ModuleFairing.id,
			articulation: { module: ModuleFairing.id, field: 'shown', mode: 'visible' }
		},
		// the 'interstage' node exists while the shell is an interstage (plan 243, ADR 0238)
		attach: {
			...stackNodes(height, size),
			interstage: { pos: [0, height / 2, 0], dir: [0, 1, 0], size, shellTop: ModuleFairing.id }
		},
		modules: [[ModuleFairing, { size, baseTop: height / 2 }]],
		stagingIcon: 'decoupler'
	});
}

export const PartFairingBaseSmall = fairingBase(
	'stock.fairing-base-small',
	'Fairing Base 0.625 m',
	0.625,
	40
);
export const PartFairingBase = fairingBase('stock.fairing-base', 'Fairing Base 1.25 m', 1.25, 75);
export const PartFairingBaseLarge = fairingBase(
	'stock.fairing-base-large',
	'Fairing Base 2.5 m',
	2.5,
	175
);

// Fairing bases of the size classes of plan 289.
export const PartFairingBase1875 = fairingBase(
	'stock.fairing-base-1875',
	'OrbitX PF-18 "Dome"',
	1.875,
	120
);
export const PartFairingBase3750 = fairingBase(
	'stock.fairing-base-3750',
	'OrbitX PF-37 "Dome"',
	3.75,
	300
);
export const PartFairingBase5000 = fairingBase(
	'stock.fairing-base-5000',
	'OrbitX PF-50 "Dome"',
	5,
	450
);
export const PartFairingBase7500 = fairingBase(
	'stock.fairing-base-7500',
	'OrbitX PF-75 "Dome"',
	7.5,
	800
);

/** Half a thrown-off fairing shell (plan 219): debris only, never in the catalogue. */
export const PartFairingPanel = definePart({
	id: 'stock.fairing-panel',
	title: 'Fairing Panel',
	mass: kg(1),
	cost: 0,
	impactTolerance: 8,
	maxTemperature: 2_000,
	// a small collider outside the shell (its look is the half shell, plan 219)
	shape: { kind: 'box', size: [0.1, 0.5, 0.5] },
	visual: {
		kind: 'fairing-panel',
		palette: { primary: '#eceee9', secondary: '#3b4047', accent: '#e3a61f' },
		paramsFrom: ModuleFairingPanel.id
	},
	modules: [[ModuleFairingPanel, { size: 1.25, half: 0 }]],
	catalog: { hidden: true }
});

/** The structural parts of the size classes of plan 289. */
export const STOCK_CLASS_STRUCTURE = [
	PartDecoupler1875,
	PartDecoupler3750,
	PartDecoupler5000,
	PartDecoupler7500,
	PartAdapter1250To1875,
	PartAdapter1875To2500,
	PartAdapter2500To3750,
	PartAdapter3750To5000,
	PartAdapter5000To7500,
	PartFairingBase1875,
	PartFairingBase3750,
	PartFairingBase5000,
	PartFairingBase7500
] as const;
