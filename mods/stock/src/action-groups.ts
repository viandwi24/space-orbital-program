/** Stock action groups (plan 110, ADR 0102 point 2); mods add their own with `defineActionGroup`. */
import { defineActionGroup } from '@orbital/sdk';

export const STOCK_ACTION_GROUPS = [
	defineActionGroup({ id: 'stock.engines', label: 'Engines', icon: 'engine', order: 0 }),
	defineActionGroup({ id: 'stock.batteries', label: 'Batteries', icon: 'battery', order: 1 }),
	defineActionGroup({ id: 'stock.solar', label: 'Solar panels', icon: 'solar', order: 2 }),
	defineActionGroup({ id: 'stock.lights', label: 'Lights', icon: 'light', order: 3 }),
	defineActionGroup({ id: 'stock.antennas', label: 'Antennas', icon: 'antenna', order: 4 }),
	defineActionGroup({ id: 'stock.science', label: 'Science', icon: 'science', order: 5 }),
	defineActionGroup({ id: 'stock.docking', label: 'Docking', icon: 'docking', order: 6 }),
	defineActionGroup({ id: 'stock.landing-gear', label: 'Landing gear', icon: 'legs', order: 7 }),
	defineActionGroup({ id: 'stock.parachutes', label: 'Parachutes', icon: 'parachute', order: 8 })
] as const;
