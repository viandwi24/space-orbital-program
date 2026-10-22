/**
 * Tether parts (plan 313, ADR 0272): a radial winch whose rope leaves from its outer face, and a
 * radial socket a winch of another vessel ties on to. Titles follow ADR 0255.
 */
import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleTetherSocket, ModuleWinch } from '../tether.ts';
import type { Vec3Tuple } from './shared.ts';

const PAINT = { primary: '#e9ebee', secondary: '#2a2e35', accent: '#e3a61f' };
const radialAt = (x: number) => ({
	radial: { pos: [-x, 0, 0] as Vec3Tuple, dir: [-1, 0, 0] as Vec3Tuple }
});

/** A winch on a part's side: 40 m of rope that holds 60 kN, reeled at 1 m/s. */
export const PartWinch = definePart({
	id: 'stock.winch',
	title: 'OrbitX TW-40 "Reel"',
	mass: kg(150),
	cost: partCost(150, 'structure'),
	impactTolerance: 10,
	shape: { kind: 'box', size: [0.4, 0.5, 0.5] },
	visual: { kind: 'winch', palette: PAINT },
	attach: radialAt(0.2),
	crossfeed: false,
	modules: [[ModuleWinch, { anchor: [0.24, 0, 0] }]],
	stagingIcon: 'docking'
});

/** A tether socket: a ring a winch's rope ties on to. */
export const PartTetherSocket = definePart({
	id: 'stock.tether-socket',
	title: 'OrbitX TS-1 "Eyelet"',
	mass: kg(15),
	cost: partCost(15, 'structure'),
	impactTolerance: 12,
	shape: { kind: 'box', size: [0.12, 0.3, 0.3] },
	visual: { kind: 'tether-socket', palette: PAINT },
	attach: radialAt(0.06),
	crossfeed: false,
	modules: [[ModuleTetherSocket, { anchor: [0.1, 0, 0] }]]
});

export const STOCK_TETHER_PARTS = [PartWinch, PartTetherSocket] as const;
