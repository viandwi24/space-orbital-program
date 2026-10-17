/**
 * Crew simulation constants and formulas (plan 107, ADR 0181): consumables and their rates,
 * shortage grace, morale, fatigue, performance, g-load and radiation. Plain data and pure
 * functions; environment-neutral.
 */

export const LIFE_SUPPORT_MODES = ['off', 'simple', 'full'] as const;
export type LifeSupportMode = (typeof LIFE_SUPPORT_MODES)[number];

/** Rules the sim reads (ADR 0100 point 3). */
export const CREW_SIM_RULES = {
	lifeSupport: 'stock.life-support',
	morale: 'stock.crew-morale',
	rest: 'stock.crew-rest',
	exposure: 'stock.crew-exposure'
} as const;

/** Consumable resource ids (ADR 0181 point 1); `co2` names a scrubbing shortage. */
export const CONSUMABLES = {
	supplies: 'stock.supplies',
	oxygen: 'stock.oxygen',
	water: 'stock.water',
	food: 'stock.food'
} as const;
export const CO2 = 'co2';
/** What scrubbers run on. */
export const CHARGE_RESOURCE = 'stock.electric-charge';

/** Units per crew member per day, by mode. */
export const LIFE_SUPPORT_RATES: Record<Exclude<LifeSupportMode, 'off'>, Record<string, number>> = {
	simple: { [CONSUMABLES.supplies]: 1 },
	full: { [CONSUMABLES.oxygen]: 1, [CONSUMABLES.water]: 1, [CONSUMABLES.food]: 1 }
};

/** Seconds from a run-out to the death rule; `days` are days of the root body. */
export const SHORTAGE_GRACE: Record<string, { seconds?: number; days?: number }> = {
	[CONSUMABLES.oxygen]: { seconds: 1_800 },
	[CO2]: { seconds: 1_800 },
	[CONSUMABLES.water]: { days: 3 },
	[CONSUMABLES.supplies]: { days: 3 },
	[CONSUMABLES.food]: { days: 10 }
};

export const graceSeconds = (resource: string, day: number): number => {
	const g = SHORTAGE_GRACE[resource] ?? { days: 3 };
	return g.seconds ?? (g.days ?? 3) * day;
};

/** What a module's `scrubber` hook returns: people served, and EC per served person per day. */
export interface ScrubberInfo {
	crew: number;
	charge: number;
}

// ---- morale and fatigue (ADR 0181 points 4 to 6) ----

/** Morale target for days aboard, crowding (crew over seats) and a shortage. */
export const moraleTarget = (daysAboard: number, crowding: number, shortage: boolean): number =>
	Math.min(
		1,
		Math.max(0, 1 - 0.01 * daysAboard - 0.3 * Math.max(0, crowding - 0.5) - (shortage ? 0.4 : 0))
	);

/** Morale after `dt` seconds relaxing towards `target` with a time constant of one day. */
export const moraleAfter = (m: number, target: number, dt: number, day: number): number =>
	target + (m - target) * Math.exp(-dt / day);

/** Fatigue after `dt` seconds: up 1 per 2/3 day working, down 1 per 1/3 day resting. */
export const fatigueAfter = (f: number, working: boolean, dt: number, day: number): number =>
	Math.min(1, Math.max(0, f + (working ? 1.5 : -3) * (dt / day)));

/** The quality scale of a member (1 with both aspects off). */
export const performanceOf = (morale = 1, fatigue = 0): number =>
	(0.6 + 0.4 * morale) * (1 - 0.4 * fatigue);

// ---- g-load and radiation (ADR 0181 point 7); g is core's `STANDARD_GRAVITY` ----

/** Proper acceleration a member tolerates before stress builds, in g, times `gTolerance`. */
export const G_LIMIT = 6;
/** Stress (g·s) at which a member blacks out, the drain (g·s per s) and the blackout length (s). */
export const G_LOC_STRESS = 3;
export const G_STRESS_DRAIN = 1;
export const G_LOC_SECONDS = 8;

/** Dose rates, mSv/s: in the home sphere outside the air, and beyond it. */
export const DOSE_RATE_HOME = 1e-5;
export const DOSE_RATE_DEEP = 5e-5;
