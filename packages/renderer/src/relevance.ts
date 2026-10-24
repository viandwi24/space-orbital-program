/**
 * Relevance of the looks (plan 410, ADR 0369): what a look costs is decided by what the view can show of
 * it. One pure function per look returns a level, 0 (off, or only a baked stand-in), 1 (cheap) or 2
 * (full), from the camera's altitude, the atmosphere, the vessel's state and the view; the renderer
 * applies the level only through uniforms and draw or skip choices, never through a new pipeline, so a
 * level change in play costs nothing (ADR 0310). The thresholds are the starting values of the plan,
 * tuned by the measurements in journal 410.
 */

export type RelevanceLook = 'ocean' | 'clouds' | 'rocks' | 'terrain' | 'plume' | 'plasma';
export const RELEVANCE_LOOKS: readonly RelevanceLook[] = [
	'ocean',
	'clouds',
	'rocks',
	'terrain',
	'plume',
	'plasma'
];
export type RelevanceLevel = 0 | 1 | 2;

export interface RelevanceInput {
	/** Camera altitude above the surface of the body it is over, m. */
	altitude: number;
	/** The top of that body's atmosphere above its surface, m; 0 for none. */
	atmosphereTop: number;
	/** The vessel the camera follows: nothing, resting on the ground, flying in the air, or in space. */
	vessel: 'none' | 'landed' | 'flying' | 'orbiting';
	/** The map view is up: no look of the flight scene shows. */
	map: boolean;
	/** The share of the screen the feature covers, 0 to 1, where the look has one (a plume). */
	screenShare?: number;
	/** The skin is heating, or the Mach number is past its threshold (re-entry). */
	heating?: boolean;
}

/** Altitudes where a look steps down, m (the starting values of plan 410). */
export const GATES = {
	/** The sea's FFT, reflection and detail normals are full below this, analytic below `oceanNear`. */
	oceanFull: 3_000,
	oceanNear: 30_000,
	/** The volumetric cloud march is full below this, the cheap one up to the top of the air. */
	cloudsFull: 15_000,
	/** Rocks exist below this, and are all there below `rocksFull`. */
	rocks: 150,
	rocksFull: 40,
	/** The mesh terrain (plan 398) draws below this. */
	terrain: 20_000
} as const;

/** The level of `look` for a view. */
export function relevanceOf(look: RelevanceLook, i: RelevanceInput): RelevanceLevel {
	if (i.map) return 0;
	const a = Math.max(0, i.altitude);
	switch (look) {
		case 'ocean':
			if (i.atmosphereTop <= 0 && a > GATES.oceanNear) return 0;
			return a < GATES.oceanFull ? 2 : a < GATES.oceanNear ? 1 : 0;
		case 'clouds':
			if (i.atmosphereTop <= 0) return 0;
			if (a < GATES.cloudsFull) return 2;
			return a < i.atmosphereTop ? 1 : 0;
		case 'rocks':
			return a < GATES.rocksFull ? 2 : a < GATES.rocks ? 1 : 0;
		case 'terrain':
			return a < GATES.terrain ? 2 : 0;
		case 'plume':
			if (i.vessel === 'none') return 0;
			return (i.screenShare ?? 1) > 0.001 ? 2 : (i.screenShare ?? 1) > 0 ? 1 : 0;
		case 'plasma':
			return i.heating === true && i.vessel !== 'landed' ? 2 : 0;
	}
}

/** All the looks' levels for a view. */
export function relevanceLevels(i: RelevanceInput): Record<RelevanceLook, RelevanceLevel> {
	const out = {} as Record<RelevanceLook, RelevanceLevel>;
	for (const look of RELEVANCE_LOOKS) out[look] = relevanceOf(look, i);
	return out;
}
