import { definePart, kg } from '@orbital/sdk';
import { partCost } from '../costs.ts';
import { ModuleResourceContainer } from '../modules.ts';
import { LiquidFuel, Oxidizer } from '../resources.ts';
import { cylinder, stackNodes, WIDE_RADIUS } from './shared.ts';

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
	return definePart({
		id,
		title,
		mass: kg(dry),
		cost: partCost(dry, 'tank'),
		impactTolerance: 5,
		shape: cylinder(height, WIDE_RADIUS),
		visual: {
			kind: 'tank',
			palette: { primary: '#eceee9', secondary: '#23272d', accent: '#e0572b' },
			params: { stripe: 0.5, bands: 2 }
		},
		attach: stackNodes(height, 2.5),
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
