/** Display-unit helpers. Simulation state is SI; conversion happens only here in the UI. */
import {
	FEET_PER_METRE,
	METRES_PER_MILE,
	POUNDS_FORCE_PER_NEWTON,
	POUNDS_PER_KG,
	currentUnits,
	speedUnit,
	speedValue,
	type UnitSystem
} from './units.svelte';

/** Shown for a value that is not available (no orbit yet, no data). */
export const NO_VALUE = '–';

const finite = (x: number): boolean => Number.isFinite(x);

const grouped = (x: number, digits = 0): string =>
	x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Distances. Metric: m below 10 km, then km, Mm, Gm. Imperial: ft below 10 000 ft, then miles
 * (Mmi from a million). The system defaults to the player's setting (`units.svelte.ts`).
 */
export function formatDistance(metres: number, system: UnitSystem = currentUnits()): string {
	if (!finite(metres)) return NO_VALUE;
	const abs = Math.abs(metres);
	if (system === 'imperial') {
		const feet = metres * FEET_PER_METRE;
		if (Math.abs(feet) < 1e4) return `${grouped(feet, Math.abs(feet) < 100 ? 1 : 0)} ft`;
		const miles = metres / METRES_PER_MILE;
		if (Math.abs(miles) >= 1e6) return `${(miles / 1e6).toFixed(2)} Mmi`;
		return `${grouped(miles, Math.abs(miles) < 100 ? 2 : Math.abs(miles) < 1e4 ? 1 : 0)} mi`;
	}
	if (abs >= 1e9) return `${(metres / 1e9).toFixed(2)} Gm`;
	if (abs >= 1e6) return `${(metres / 1e6).toFixed(2)} Mm`;
	if (abs >= 1e4) return `${(metres / 1e3).toFixed(1)} km`;
	if (abs >= 1e3) return `${(metres / 1e3).toFixed(2)} km`;
	return `${metres.toFixed(abs < 100 ? 1 : 0)} m`;
}

/**
 * Speeds. Metric: m/s, km/s from 10 km/s so the number never needs more than 5 digits. Imperial:
 * ft/s, mi/s from the same speed.
 */
export function formatSpeed(mps: number, system: UnitSystem = currentUnits()): string {
	if (!finite(mps)) return NO_VALUE;
	if (Math.abs(mps) >= 1e4) {
		return system === 'imperial'
			? `${(mps / METRES_PER_MILE).toFixed(2)} mi/s`
			: `${(mps / 1e3).toFixed(2)} km/s`;
	}
	return `${speedValue(mps, system).toFixed(1)} ${speedUnit(system)}`;
}

/** Delta-v, whole numbers with a thousands separator, no unit (labelled by `speedUnit`). */
export function formatDeltaV(mps: number, system: UnitSystem = currentUnits()): string {
	if (!finite(mps)) return NO_VALUE;
	return grouped(Math.round(speedValue(mps, system)));
}

/** Mass. Metric: kg below one tonne, t above. Imperial: lb below one short ton (2 000 lb), tn above. */
export function formatMass(kg: number, system: UnitSystem = currentUnits()): string {
	if (!finite(kg)) return NO_VALUE;
	if (system === 'imperial') {
		const pounds = kg * POUNDS_PER_KG;
		if (Math.abs(pounds) >= 2000) return `${(pounds / 2000).toFixed(2)} tn`;
		return `${pounds.toFixed(0)} lb`;
	}
	if (Math.abs(kg) >= 1e3) return `${(kg / 1e3).toFixed(2)} t`;
	return `${kg.toFixed(0)} kg`;
}

/** Force: kN, or klbf in the imperial system (thrust). */
export function formatForce(newtons: number, system: UnitSystem = currentUnits()): string {
	if (!finite(newtons)) return NO_VALUE;
	if (system === 'imperial')
		return `${((newtons * POUNDS_FORCE_PER_NEWTON) / 1e3).toFixed(1)} klbf`;
	return `${(newtons / 1e3).toFixed(1)} kN`;
}

/** Angle in degrees from radians, no sign handling (callers wrap first). */
/** Funds as whole numbers with thousands separators (plan 095). */
export function formatFunds(funds: number): string {
	return Math.round(funds).toLocaleString('en-US');
}

export function formatAngle(radians: number, digits = 1): string {
	if (!finite(radians)) return NO_VALUE;
	return `${((radians * 180) / Math.PI).toFixed(digits)}°`;
}

/** Compass bearing, `000` to `359`; 359.6 rounds to `000`, never `360`. */
export function formatBearing(radians: number): string {
	if (!finite(radians)) return NO_VALUE;
	const deg = Math.round(((((radians * 180) / Math.PI) % 360) + 360) % 360) % 360;
	return `${deg.toString().padStart(3, '0')}\u00b0`;
}

/** Signed whole degrees (`+45\u00b0`, `-3\u00b0`, `0\u00b0`), no negative zero. */
export function formatSignedAngle(radians: number): string {
	if (!finite(radians)) return NO_VALUE;
	const deg = Math.round((radians * 180) / Math.PI);
	return `${deg > 0 ? '+' : ''}${deg === 0 ? 0 : deg}\u00b0`;
}

/** 0..1 as a whole percentage, clamped. */
export function formatPercent(fraction: number): string {
	if (!finite(fraction)) return NO_VALUE;
	return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

/**
 * Durations: `mm:ss` below an hour, `h:mm:ss` below a day, then `Nd hh:mm:ss`. Negative values get
 * a leading minus; `Infinity` and NaN show the no-value dash.
 */
export function formatDuration(seconds: number): string {
	if (!finite(seconds)) return NO_VALUE;
	const sign = seconds < 0 ? '-' : '';
	const s = Math.floor(Math.abs(seconds));
	const two = (n: number): string => n.toString().padStart(2, '0');
	const d = Math.floor(s / 86_400);
	const h = Math.floor((s % 86_400) / 3_600);
	const m = Math.floor((s % 3_600) / 60);
	const sec = s % 60;
	if (d > 0) return `${sign}${d}d ${two(h)}:${two(m)}:${two(sec)}`;
	if (h > 0) return `${sign}${h}:${two(m)}:${two(sec)}`;
	return `${sign}${two(m)}:${two(sec)}`;
}

/** Mission elapsed time label, `T+00:12`. */
export const formatMet = (seconds: number): string =>
	finite(seconds) ? `T+${formatDuration(Math.max(0, seconds))}` : `T+${NO_VALUE}`;

/** Time warp factor: `1x`, `1000x`, `10 000x` is avoided (k suffix) to stay narrow. */
export function formatWarp(factor: number): string {
	if (factor >= 1e6) return `${factor / 1e6}Mx`;
	if (factor >= 1e3) return `${factor / 1e3}kx`;
	return `${factor}x`;
}

/** `stock.liquid-fuel` -> `Liquid fuel`. */
export function resourceLabel(id: string): string {
	const name = id.slice(id.lastIndexOf('.') + 1).replace(/-/g, ' ');
	return name.charAt(0).toUpperCase() + name.slice(1);
}
