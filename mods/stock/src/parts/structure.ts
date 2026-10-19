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
	crossfeed: false
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
		attach: stackNodes(height, size),
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
