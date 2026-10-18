import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleDecoupler } from '../modules.ts';
import { cylinder, stackNodes, type Vec3Tuple } from './shared.ts';

export const PartDecoupler = definePart({
	id: 'stock.decoupler',
	title: 'Stack Decoupler',
	mass: kg(50),
	cost: partCost(50, 'structure'),
	impactTolerance: 8,
	maxTemperature: 1000,
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
	maxTemperature: 1000,
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
	maxTemperature: 1000,
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
	maxTemperature: 1000,
	connector: { feeds: true },
	shape: { kind: 'cylinder', radius: CONNECTOR_RADIUS, height: 0.1 },
	visual: { kind: 'fuel-line', palette: { primary: '#d9552b', secondary: '#23272d' } },
	attach: connectorNode,
	crossfeed: false
});
