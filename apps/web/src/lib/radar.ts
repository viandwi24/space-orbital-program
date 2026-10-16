/**
 * Radar altitude (plan 039): the height of the vessel's lowest point above the ground under it,
 * as opposed to the HUD altitude, which is above the body's reference sphere. The sim puts the
 * height of the ground under the root part in the snapshot (`VesselSnapshot.terrainHeight`,
 * ADR 0043); a sim without terrain leaves it out and there is no radar.
 */

/** Above this height over the ground the read-out is hidden: it adds nothing to the altitude. */
export const RADAR_MAX_ALTITUDE = 20_000;

/**
 * `altitude` is the root part's height above the reference sphere, `clearance` the root origin's
 * height above the vessel's lowest point (`groundClearance`), `terrainHeight` the ground's height
 * above the same sphere. Never negative (the root origin cannot be below the ground it stands on,
 * but a rounding error or a sunk leg must not read as a minus sign). `null` without terrain data.
 */
export function radarAltitude(
	altitude: number,
	clearance: number,
	terrainHeight: number | undefined
): number | null {
	if (
		terrainHeight === undefined ||
		!Number.isFinite(terrainHeight) ||
		!Number.isFinite(altitude)
	) {
		return null;
	}
	return Math.max(0, altitude - clearance - terrainHeight);
}

/** Whether the HUD shows the radar read-out: there is data and the ground is near enough to matter. */
export const radarVisible = (radar: number | null): radar is number =>
	radar !== null && radar <= RADAR_MAX_ALTITUDE;

/**
 * The number the HUD shows: the radar altitude, or `null` when there is no terrain data or the
 * ground is out of reach (`RADAR_MAX_ALTITUDE`). Arguments as for `radarAltitude`.
 */
export function radarReading(
	altitude: number,
	clearance: number,
	terrainHeight: number | undefined
): number | null {
	const radar = radarAltitude(altitude, clearance, terrainHeight);
	return radarVisible(radar) ? radar : null;
}
