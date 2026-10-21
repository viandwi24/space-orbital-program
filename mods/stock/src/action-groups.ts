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
	defineActionGroup({ id: 'stock.parachutes', label: 'Parachutes', icon: 'parachute', order: 8 }),
	// plan 063, ADR 0161: the wheels' brakes and the wings' flaps
	defineActionGroup({ id: 'stock.brakes', label: 'Brakes', icon: 'legs', order: 9 }),
	defineActionGroup({ id: 'stock.flaps', label: 'Flaps', icon: 'wing', order: 10 }),
	// plan 241: the RCS thrusters' switch
	defineActionGroup({ id: 'stock.rcs', label: 'RCS', icon: 'rcs', order: 11 }),
	// plan 260: the wheel motors' switch
	defineActionGroup({ id: 'stock.motors', label: 'Wheel motors', icon: 'wheel', order: 12 }),
	// plan 306: hinges, servos, rotors and pistons
	defineActionGroup({ id: 'stock.robotics', label: 'Robotics', icon: 'wheel', order: 13 })
] as const;
