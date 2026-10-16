/**
 * Display units (plan 023). Simulation state is SI everywhere; this module is the only place that
 * knows a second system. The active system is reactive state, so a component that formats a number
 * through `format.ts` redraws when the player changes the setting. Tests pass the system explicitly.
 */
export type UnitSystem = 'metric' | 'imperial';

export const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'];

export const FEET_PER_METRE = 3.280839895;
export const METRES_PER_MILE = 1609.344;
export const POUNDS_PER_KG = 2.2046226218;
export const POUNDS_FORCE_PER_NEWTON = 0.2248089431;

let active = $state<UnitSystem>('metric');

/** The system the interface shows now. */
export const currentUnits = (): UnitSystem => active;

export function setUnitSystem(system: UnitSystem): void {
	active = system;
}

/** A speed (or delta-v) in m/s as a number in the system's small speed unit (m/s or ft/s). */
export const speedValue = (mps: number, system: UnitSystem = active): number =>
	system === 'imperial' ? mps * FEET_PER_METRE : mps;

/** Unit label of `speedValue`. */
export const speedUnit = (system: UnitSystem = active): string =>
	system === 'imperial' ? 'ft/s' : 'm/s';
