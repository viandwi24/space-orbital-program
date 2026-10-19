import { defineCategory } from '@orbital/sdk';

/**
 * The stock catalogue categories (plan 069, ADR 0146), registered through the public API like any
 * mod's. Orders leave room between them for mods; Other stays last.
 */
export const STOCK_CATEGORIES = [
	defineCategory({ id: 'stock.command', label: 'Command', icon: 'command', order: 100 }),
	defineCategory({ id: 'stock.tanks', label: 'Fuel tanks', icon: 'tank', order: 200 }),
	defineCategory({ id: 'stock.propulsion', label: 'Engines', icon: 'engine', order: 300 }),
	defineCategory({ id: 'stock.structural', label: 'Structural', icon: 'decoupler', order: 400 }),
	defineCategory({ id: 'stock.aero', label: 'Aerodynamics', icon: 'fin', order: 500 }),
	defineCategory({ id: 'stock.control', label: 'Control', icon: 'wheel', order: 600 }),
	defineCategory({ id: 'stock.landing', label: 'Landing', icon: 'legs', order: 700 }),
	defineCategory({ id: 'stock.thermal', label: 'Thermal', icon: 'shield', order: 800 }),
	defineCategory({ id: 'stock.other', label: 'Other', icon: 'part', order: 10_000 })
];

/** The build menu's categories (plan 235, ADR 0227); icons from the v2 Space Center dock. */
const building = (id: string, label: string, path: string, order: number) =>
	defineCategory({ id, label, icon: { path }, order, scope: 'buildings' });
export const STOCK_BUILDING_CATEGORIES = [
	building(
		'stock.launch',
		'Launch',
		'M12 2 C15 5 16 9 16 13 L18 17 H6 L8 13 C8 9 9 5 12 2 Z M10 17 L9.5 21 M14 17 L14.5 21',
		100
	),
	building(
		'stock.comms',
		'Comms',
		'M4 6 A11 11 0 0 0 16 18 Z M10 12 L17 5 M12 21 H20 M16 18 V21',
		200
	),
	building(
		'stock.science',
		'Science',
		'M9 3 H15 M10 3 V9 L4.5 19 A1.5 1.5 0 0 0 6 21 H18 A1.5 1.5 0 0 0 19.5 19 L14 9 V3 M7 15 H17',
		300
	),
	building(
		'stock.crew',
		'Crew',
		'M9 5 A3 3 0 1 1 8.99 5 Z M3 20 C3 16 6 14 9 14 C12 14 15 16 15 20 M16 5.5 A2.5 2.5 0 1 1 15.99 5.5 Z M17 13.5 C19.5 14 21 16 21 19',
		400
	),
	building(
		'stock.administration',
		'Administration',
		'M3 21 H21 M5 21 V10 M9 21 V10 M15 21 V10 M19 21 V10 M3 10 L12 4 L21 10 Z',
		500
	),
	building(
		'stock.production',
		'Production',
		'M5 21 V8 A3 3 0 0 1 11 8 V21 M13 21 V11 A3 3 0 0 1 19 11 V21 M3 21 H21',
		600
	),
	building(
		'stock.infrastructure',
		'Infrastructure',
		'M3 21 V9 L12 4 L21 9 V21 Z M9 21 V13 H15 V21',
		700
	),
	building(
		'stock.other-buildings',
		'Other',
		'M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z',
		10_000
	)
];
