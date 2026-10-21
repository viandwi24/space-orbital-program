import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleLight, type LightColour } from '../lights.ts';

/**
 * Lights (plans 242 and 311, ADR 0239): a small box on the hull, attached radially (or by a surface link) so
 * its lens looks away from the part it sits on. The spot throws a narrow cone far; the floodlight
 * a wide one near. The lens is `lamp.pos` and the beam goes along `lamp.dir` in the part frame.
 */
const lamp = (spec: {
	id: string;
	title: string;
	size: [number, number, number];
	massKg: number;
	angle: number;
	range: number;
	drain: number;
	kind?: 'light' | 'light-panel' | 'light-angled' | 'light-nav';
	/** Where the beam goes in the part frame (default straight out, +X). */
	dir?: [number, number, number];
	/** The module's starting settings (navigation lights: a colour, blinking). */
	settings?: { colour?: LightColour; blink?: boolean };
}) => {
	const [sx] = spec.size;
	const dir = spec.dir ?? [1, 0, 0];
	return definePart({
		id: spec.id,
		title: spec.title,
		mass: kg(spec.massKg),
		cost: partCost(spec.massKg, 'command'),
		impactTolerance: 5,
		maxTemperature: 1200,
		shape: { kind: 'box', size: spec.size },
		visual: {
			kind: spec.kind ?? 'light',
			palette: { primary: '#2b2f36', secondary: '#c9ccd1', accent: '#e3a61f' },
			lamp: {
				module: ModuleLight.id,
				pos: [sx / 2, 0, 0],
				dir,
				angle: spec.angle,
				range: spec.range
			}
		},
		attach: { radial: { pos: [-sx / 2, 0, 0], dir: [-1, 0, 0] } },
		modules: [[ModuleLight, { drain: spec.drain, ...spec.settings }]]
	});
};

export const PartLightSpot = lamp({
	id: 'stock.light-spot',
	title: 'OrbitX LT-S "Torch"',
	size: [0.2, 0.2, 0.2],
	massKg: 4,
	angle: 18,
	range: 120,
	drain: 0.04
});
export const PartLightFlood = lamp({
	id: 'stock.light-flood',
	title: 'OrbitX LT-F "Glow"',
	size: [0.3, 0.3, 0.3],
	massKg: 8,
	angle: 60,
	range: 45,
	drain: 0.08
});
/** Plan 311: a flat strip flush on the hull, a wide soft beam. */
export const PartLightPanel = lamp({
	id: 'stock.light-panel',
	title: 'OrbitX LT-P "Strip"',
	size: [0.05, 0.6, 0.16],
	massKg: 3,
	angle: 80,
	range: 25,
	drain: 0.05,
	kind: 'light-panel'
});
/** Plan 311: the beam leaves at 45° to the hull, raking along the side (+X toward +Y). */
export const PartLightAngled = lamp({
	id: 'stock.light-angled',
	title: 'OrbitX LT-A "Slant"',
	size: [0.24, 0.24, 0.2],
	massKg: 5,
	angle: 30,
	range: 80,
	drain: 0.05,
	kind: 'light-angled',
	dir: [Math.SQRT1_2, Math.SQRT1_2, 0]
});
const nav = (id: string, title: string, colour: LightColour) =>
	lamp({
		id,
		title,
		size: [0.08, 0.08, 0.08],
		massKg: 1,
		angle: 85,
		range: 8,
		drain: 0.01,
		kind: 'light-nav',
		settings: { colour, blink: true }
	});
/** Plan 311: navigation lights, blinking by default (red to port, green to starboard). */
export const PartLightNavRed = nav('stock.light-nav-red', 'OrbitX LT-N "Port"', 'red');
export const PartLightNavGreen = nav('stock.light-nav-green', 'OrbitX LT-N "Starboard"', 'green');
export const PartLightNavWhite = nav('stock.light-nav-white', 'OrbitX LT-N "Beacon"', 'white');

export const STOCK_LIGHT_PARTS = [
	PartLightSpot,
	PartLightFlood,
	PartLightPanel,
	PartLightAngled,
	PartLightNavRed,
	PartLightNavGreen,
	PartLightNavWhite
] as const;
