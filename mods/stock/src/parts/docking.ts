import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleDockingPort } from '../docking.ts';
import { stackNodes } from './shared.ts';

// Docking ports in the three size classes (plan 222, ADR 0218): the top node is the docking face.

const port = (id: string, title: string, size: number, height: number, massKg: number) =>
	definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'structure'),
		impactTolerance: 10,
		maxTemperature: 1200,
		shape: { kind: 'cylinder', radius: size / 2, height },
		visual: {
			kind: 'docking-port',
			palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#e3a61f' }
		},
		attach: stackNodes(height, size),
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

export const STOCK_DOCKING_PARTS = [
	PartDockingPortSmall,
	PartDockingPort,
	PartDockingPortLarge
] as const;
