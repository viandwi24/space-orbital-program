import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleResourceContainer } from '../modules.ts';
import { LiquidFuel, Oxidizer } from '../resources.ts';
import { cylinder, stackNodes } from './shared.ts';

export const PartTankSmall = definePart({
	id: 'stock.tank-small',
	title: 'Small Fuel Tank',
	mass: kg(250),
	cost: partCost(250, 'tank'),
	impactTolerance: 5,
	shape: cylinder(2),
	visual: {
		kind: 'tank',
		palette: { primary: '#eceee9', secondary: '#23272d', accent: '#e0572b' },
		params: { stripe: 0.3, bands: 1 }
	},
	attach: stackNodes(2),
	modules: [
		[
			ModuleResourceContainer,
			{
				contents: {
					[LiquidFuel.id]: { capacity: 400 },
					[Oxidizer.id]: { capacity: 490 }
				}
			}
		]
	],
	stagingIcon: 'tank'
});

export const PartTankMedium = definePart({
	id: 'stock.tank-medium',
	title: 'Medium Fuel Tank',
	mass: kg(500),
	cost: partCost(500, 'tank'),
	impactTolerance: 5,
	shape: cylinder(4),
	visual: {
		kind: 'tank',
		palette: { primary: '#e6e3da', secondary: '#d9602a', accent: '#23272d' },
		params: { stripe: 0.55, bands: 3 }
	},
	attach: stackNodes(4),
	modules: [
		[
			ModuleResourceContainer,
			{
				contents: {
					[LiquidFuel.id]: { capacity: 800 },
					[Oxidizer.id]: { capacity: 980 }
				}
			}
		]
	],
	stagingIcon: 'tank'
});

/** A 2.5 m class tank (plan 210): `fuel` + `oxidizer` u at the 0.9 : 1.1 mix. */
function wideTank(id: string, title: string, dry: number, height: number, fuel: number) {
	return liquidTank(id, title, 2.5, dry, height, fuel);
}

/** A stack tank of class `size` m: `fuel` + `oxidizer` u at the 0.9 : 1.1 mix. */
function liquidTank(
	id: string,
	title: string,
	size: number,
	dry: number,
	height: number,
	fuel: number
) {
	return definePart({
		id,
		title,
		mass: kg(dry),
		cost: partCost(dry, 'tank'),
		impactTolerance: 5,
		shape: cylinder(height, size / 2),
		visual: {
			kind: 'tank',
			palette: { primary: '#eceee9', secondary: '#23272d', accent: '#e0572b' },
			params: { stripe: 0.5, bands: 2 }
		},
		attach: stackNodes(height, size),
		modules: [
			[
				ModuleResourceContainer,
				{
					contents: {
						[LiquidFuel.id]: { capacity: fuel },
						[Oxidizer.id]: { capacity: Math.round((fuel * 11) / 9) }
					}
				}
			]
		],
		stagingIcon: 'tank'
	});
}

/** 2.5 m, about 4.5 t full (plan 210). */
export const PartTankWideShort = wideTank(
	'stock.tank-wide-short',
	'Wide Tank, Short',
	500,
	1.1,
	360
);
/** 2.5 m, about 18 t full (plan 210). */
export const PartTankWide = wideTank('stock.tank-wide', 'Wide Tank', 2_000, 3.75, 1_440);

/** `stock.tank-wide`'s volume, m³: the size classes of plan 289 scale from it. */
const WIDE_VOLUME = Math.PI * 1.25 ** 2 * 3.75;

/**
 * A tank of class `size` m and `height` m (plan 289, ADR 0256): fuel and dry mass scale with the
 * volume from `stock.tank-wide` (1,440 u of fuel, 2 t dry), so the wet : dry ratio and the mix stay.
 */
function classTank(id: string, title: string, size: number, height: number) {
	const f = (Math.PI * (size / 2) ** 2 * height) / WIDE_VOLUME;
	return liquidTank(
		id,
		title,
		size,
		Math.round((2_000 * f) / 5) * 5,
		height,
		Math.round(1_440 * f)
	);
}

/** 0.625 m, a small tank for probes. */
export const PartTank0625 = classTank('stock.tank-0625', 'OrbitX BT-06 "Butir"', 0.625, 0.75);
export const PartTank1875Short = classTank(
	'stock.tank-1875-short',
	'OrbitX BT-18S "Tong"',
	1.875,
	1.9
);
export const PartTank1875 = classTank('stock.tank-1875', 'OrbitX BT-18M "Tong"', 1.875, 3.75);
export const PartTank3750Short = classTank(
	'stock.tank-3750-short',
	'OrbitX BT-37S "Tong"',
	3.75,
	1.9
);
export const PartTank3750 = classTank('stock.tank-3750', 'OrbitX BT-37M "Tong"', 3.75, 3.75);
export const PartTank3750Long = classTank(
	'stock.tank-3750-long',
	'OrbitX BT-37L "Tong"',
	3.75,
	7.5
);
export const PartTank5000Short = classTank('stock.tank-5000-short', 'OrbitX BT-50S "Tong"', 5, 2.5);
export const PartTank5000 = classTank('stock.tank-5000', 'OrbitX BT-50M "Tong"', 5, 5);
export const PartTank5000Long = classTank('stock.tank-5000-long', 'OrbitX BT-50L "Tong"', 5, 10);
export const PartTank7500 = classTank('stock.tank-7500', 'OrbitX BT-75M "Tong"', 7.5, 7.5);
export const PartTank7500Long = classTank('stock.tank-7500-long', 'OrbitX BT-75L "Tong"', 7.5, 15);

/** The size-class tanks of plan 289. */
export const STOCK_CLASS_TANKS = [
	PartTank0625,
	PartTank1875Short,
	PartTank1875,
	PartTank3750Short,
	PartTank3750,
	PartTank3750Long,
	PartTank5000Short,
	PartTank5000,
	PartTank5000Long,
	PartTank7500,
	PartTank7500Long
] as const;
