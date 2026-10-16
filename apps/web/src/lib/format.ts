/** Display-unit helpers. Simulation state is SI; conversion happens only here in the UI. */

/** Shown for a value that is not available (no orbit yet, no data). */
export const NO_VALUE = '–';

const finite = (x: number): boolean => Number.isFinite(x);

/** Distances: m below 10 km, then km, Mm, Gm. Two decimals for the larger units. */
export function formatDistance(metres: number): string {
	if (!finite(metres)) return NO_VALUE;
	const abs = Math.abs(metres);
	if (abs >= 1e9) return `${(metres / 1e9).toFixed(2)} Gm`;
	if (abs >= 1e6) return `${(metres / 1e6).toFixed(2)} Mm`;
	if (abs >= 1e4) return `${(metres / 1e3).toFixed(1)} km`;
	if (abs >= 1e3) return `${(metres / 1e3).toFixed(2)} km`;
	return `${metres.toFixed(abs < 100 ? 1 : 0)} m`;
}

/** Speeds: m/s, km/s from 10 km/s so the number never needs more than 5 digits. */
export function formatSpeed(mps: number): string {
	if (!finite(mps)) return NO_VALUE;
	if (Math.abs(mps) >= 1e4) return `${(mps / 1e3).toFixed(2)} km/s`;
	return `${mps.toFixed(1)} m/s`;
}

/** Mass: kg below one tonne, t above. */
export function formatMass(kg: number): string {
	if (!finite(kg)) return NO_VALUE;
	if (Math.abs(kg) >= 1e3) return `${(kg / 1e3).toFixed(2)} t`;
	return `${kg.toFixed(0)} kg`;
}

/** Force in kN (thrust). */
export function formatForce(newtons: number): string {
	if (!finite(newtons)) return NO_VALUE;
	return `${(newtons / 1e3).toFixed(1)} kN`;
}

/** Angle in degrees from radians, no sign handling (callers wrap first). */
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
