import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleDockingPort } from '../docking.ts';
import { stackNodes } from './shared.ts';

// Docking ports (plan 222, ADR 0218; 3.75 m by plan 289): the top node is the docking face.

const port = (id: string, title: string, size: number, height: number, massKg: number) =>
	definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'structure'),
		impactTolerance: 10,
		shape: { kind: 'cylinder', radius: size / 2, height },
		visual: {
			kind: 'docking-port',
			palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e3a61f' }
		},
		// the top node is a docking face (plan 356, ADR 0300): another port goes on it face to face
		attach: (() => {
			const n = stackNodes(height, size);
			return { ...n, top: { ...n.top, face: 'docking' as const } };
		})(),
		modules: [[ModuleDockingPort, { size }]],
		stagingIcon: 'docking'
	});

export const PartDockingPortSmall = port(
	'stock.docking-port-small',
	'Docking Port 0.625 m',
	0.625,
	0.25,
	20
);
export const PartDockingPort = port('stock.docking-port', 'Docking Port 1.25 m', 1.25, 0.3, 50);
export const PartDockingPortLarge = port(
	'stock.docking-port-large',
	'Docking Port 2.5 m',
	2.5,
	0.4,
	150
);

/** The 3.75 m port (plan 289): ports stop at 3.75 m (ADR 0256). */
export const PartDockingPort3750 = port(
	'stock.docking-port-3750',
	'OrbitX DP-37 "Clasp"',
	3.75,
	0.5,
	350
);

/**
 * A side port (plan 356, ADR 0300): a 1.25 m stack segment with a docking face on its side (+Z),
 * so a station module lies along a cargo bay docked to the keel port, and leaves it sideways.
 */
export const PartDockingPortSide = definePart({
	id: 'stock.docking-port-side',
	title: 'OrbitX DP-12S "Sidecar"',
	mass: kg(120),
	cost: partCost(120, 'structure'),
	impactTolerance: 10,
	// as wide as the ring standing out of the side
	shape: { kind: 'cylinder', radius: 0.76, height: 1.5 },
	visual: {
		kind: 'side-port',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e3a61f' }
	},
	attach: {
		...stackNodes(1.5, 1.25),
		side: { pos: [0, 0, 0.69], dir: [0, 0, 1], size: 1.25, face: 'docking' }
	},
	modules: [[ModuleDockingPort, { size: 1.25, node: 'side' }]],
	stagingIcon: 'docking'
});

export const STOCK_DOCKING_PARTS = [
	PartDockingPortSmall,
	PartDockingPort,
	PartDockingPortLarge
] as const;
