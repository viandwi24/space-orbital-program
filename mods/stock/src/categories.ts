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
