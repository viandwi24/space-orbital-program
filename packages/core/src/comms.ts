/**
 * Comms tier 1 (plan 114, ADRs 0101, 0109 and 0179): antennas, ground stations, the link rule's
 * constants and the plasma blackout law. Plain data and pure functions; environment-neutral.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

export const ANTENNA_KINDS = ['omni', 'dish'] as const;

export interface AntennaDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	kind: (typeof ANTENNA_KINDS)[number];
	/** Range rating, m: two nodes link under `√(range_a × range_b)` (ADR 0179 point 3). */
	range: number;
	/** Transmit power, W (data only until plan 116). */
	power: number;
}

export interface GroundStationDefinition {
	id: string;
	label: string;
	/** Body id. */
	body: string;
	/** rad. */
	latitude: number;
	/** rad, right-handed about +Y from +X (as `VesselPlacement`). */
	longitude: number;
	/** Above the ground, m (default `STATION_MAST`). */
	altitude?: number;
	/** Range rating, m. */
	range: number;
}

export const antennaDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	kind: z.enum(ANTENNA_KINDS),
	range: z.number().positive(),
	power: z.number().nonnegative()
});

export const groundStationDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	body: z.string().min(1),
	latitude: z
		.number()
		.min(-Math.PI / 2)
		.max(Math.PI / 2),
	longitude: z.number().refine(Number.isFinite, 'must be finite'),
	altitude: z.number().nonnegative().optional(),
	range: z.number().positive()
});

/** Height of a site's station above the ground, m (ADR 0179 point 2). */
export const STATION_MAST = 10;
/** Range of a site's station by tier (1, 2, 3), m. */
export const SITE_STATION_RANGES = [2e9, 5e10, 2.5e11] as const;
/** Building capability that makes a site's station tier (ADR 0097). */
export const COMMS_NODE = 'comms-node';

/** Rules the sim reads (ADR 0101 point 4, ADR 0109 point 2). */
export const COMMS_RULES = {
	enabled: 'stock.comms',
	controlWithoutSignal: 'stock.control-without-signal',
	scale: 'stock.comms-scale'
} as const;

export const CONTROL_STATES = ['full', 'partial', 'none'] as const;
export type ControlState = (typeof CONTROL_STATES)[number];

/** Why a vessel has no link, in the order the checks run (ADR 0179 point 3). */
export type LinkReason =
	| 'no antenna'
	| 'antennas off'
	| 'plasma blackout'
	| 'out of range'
	| `blocked by ${string}`
	| 'blocked by terrain';

/** What `ctx.vessel.signal()` returns. */
export interface SignalState {
	connected: boolean;
	/** Station id (`site:<id>` or a definition id) or `vessel:<id>`; null without a link. */
	to: string | null;
	reason: LinkReason | null;
	control: ControlState;
}

/** The longest link between two ratings, m. */
export const linkRange = (a: number, b: number, scale = 1): number => Math.sqrt(a * b) * scale;

// ---- plasma blackout (ADR 0079, moved here by ADR 0179 point 7) ----

/** The signal starts to go at this stagnation flux, W/m². */
export const BLACKOUT_FLUX_START = 1.5e5;
/** ... and is fully lost at this one. */
export const BLACKOUT_FLUX_FULL = 4e5;
/** The HUD badge shows, and the link is down, at or above this level. */
export const BLACKOUT_BADGE_LEVEL = 0.5;
/** Nose radius the blackout flux is taken at, m. */
export const BLACKOUT_NOSE_RADIUS = 0.625;

/** 0..1 loss of signal for a stagnation flux (W/m²): a smoothstep between the two fluxes. */
export function blackoutLevelFromFlux(flux: number): number {
	const t = Math.min(
		1,
		Math.max(0, (flux - BLACKOUT_FLUX_START) / (BLACKOUT_FLUX_FULL - BLACKOUT_FLUX_START))
	);
	return t * t * (3 - 2 * t);
}
