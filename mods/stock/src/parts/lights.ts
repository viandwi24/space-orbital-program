import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleLight } from '../lights.ts';

/**
 * Lights (plan 242, ADR 0239): a small box on the hull, attached radially (or by a surface link) so
 * its lens looks away from the part it sits on. The spot throws a narrow cone far; the floodlight
 * a wide one near. The lens is `lamp.pos` and the beam goes along `lamp.dir` in the part frame.
 */
const lamp = (
	id: string,
	title: string,
	size: number,
	massKg: number,
	angle: number,
	range: number,
	drain: number
) =>
	definePart({
		id,
		title,
		mass: kg(massKg),
		cost: partCost(massKg, 'command'),
		impactTolerance: 5,
		maxTemperature: 1200,
		shape: { kind: 'box', size: [size, size, size] },
		visual: {
			kind: 'light',
			palette: { primary: '#2b2f36', secondary: '#c9ccd1', accent: '#e3a61f' },
			lamp: { module: ModuleLight.id, pos: [size / 2, 0, 0], dir: [1, 0, 0], angle, range }
		},
		attach: { radial: { pos: [-size / 2, 0, 0], dir: [-1, 0, 0] } },
		modules: [[ModuleLight, { drain }]]
	});

export const PartLightSpot = lamp('stock.light-spot', 'Spotlight', 0.2, 4, 18, 120, 0.04);
export const PartLightFlood = lamp('stock.light-flood', 'Floodlight', 0.3, 8, 60, 45, 0.08);

export const STOCK_LIGHT_PARTS = [PartLightSpot, PartLightFlood] as const;
