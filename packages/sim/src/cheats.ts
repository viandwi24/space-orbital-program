/**
 * The cheat switches other sim files read (plan 203, ADR 0200 point 2). Kept apart from `debug.ts`
 * so the resource, damage and heat code depend on nothing but the world info.
 */
import type { DebugCheat } from '@orbital/core';
import type { SimCore } from './core.ts';

/** Resources the electricity and monopropellant cheats cover; every other resource is "fuel". */
const ELECTRICITY = new Set(['stock.electric-charge']);
const MONOPROPELLANT = new Set(['stock.monopropellant', 'stock.cold-gas']);

/** True when `cheat` is on. Cheap: the other files call it every step. */
export const cheatOn = (core: SimCore, cheat: DebugCheat): boolean =>
	core.info.debug !== undefined && core.info.debug.cheats.includes(cheat);

/** Whether drawing `resource` leaves the store untouched because of a cheat. */
export function infiniteResource(core: SimCore, resource: string): boolean {
	const debug = core.info.debug;
	if (debug === undefined || debug.cheats.length === 0) return false;
	if (ELECTRICITY.has(resource)) return debug.cheats.includes('infinite-electricity');
	if (MONOPROPELLANT.has(resource)) return debug.cheats.includes('infinite-monopropellant');
	return debug.cheats.includes('infinite-fuel');
}
