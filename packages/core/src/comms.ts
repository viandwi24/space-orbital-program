/**
 * Comms tier 1 (plan 114, ADRs 0101, 0109 and 0179): antennas, ground stations, the link rule's
 * constants and the plasma blackout law; tier 2 (plan 116, ADR 0185): bands, the link budget and
 * the rate ladder. Plain data and pure functions; environment-neutral.
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
	/** Transmit power, W. */
	power: number;
	/** Band id (ADR 0185 point 2); without a known band the antenna has no link budget. */
	band?: string;
	/** Fixed gain, dBi; wins over `aperture`. */
	gain?: number;
	/** Dish diameter, m: the gain on the band follows from it. */
	aperture?: number;
	/** Full beam width of a dish, rad (plan 117, ADR 0188 point 2); default from band and aperture. */
	beamWidth?: number;
}

/** A radio band (plan 116, ADR 0185 point 1). */
export interface BandDefinition {
	id: string;
	label: string;
	/** Hz. */
	frequency: number;
	/** The receiving system's noise temperature on this band, K. */
	noiseTemperature: number;
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
	/** Dish diameter, m (default `SITE_STATION_APERTURES[0]`); it receives on every band. */
	aperture?: number;
}

export const antennaDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	kind: z.enum(ANTENNA_KINDS),
	range: z.number().positive(),
	power: z.number().nonnegative(),
	band: z.string().min(1).optional(),
	gain: z.number().refine(Number.isFinite, 'must be finite').optional(),
	aperture: z.number().positive().optional(),
	beamWidth: z.number().positive().max(Math.PI).optional()
});

export const bandDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	frequency: z.number().positive(),
	noiseTemperature: z.number().positive()
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
	range: z.number().positive(),
	aperture: z.number().positive().optional()
});

/** Height of a site's station above the ground, m (ADR 0179 point 2). */
export const STATION_MAST = 10;
/** Range of a site's station by tier (1, 2, 3), m. */
export const SITE_STATION_RANGES = [2e9, 5e10, 2.5e11] as const;
/** Dish diameter of a site's station by tier, m (ADR 0185 point 3). */
export const SITE_STATION_APERTURES = [10, 34, 70] as const;
/** Building capability that makes a site's station tier (ADR 0097). */
export const COMMS_NODE = 'comms-node';

/** Rules the sim reads (ADR 0101 point 4, ADR 0109 point 2). */
export const COMMS_RULES = {
	enabled: 'stock.comms',
	controlWithoutSignal: 'stock.control-without-signal',
	scale: 'stock.comms-scale',
	signalDelay: 'stock.signal-delay'
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
	| 'blocked by terrain'
	| `route broken at ${string}`;

/** What `ctx.vessel.signal()` returns. */
export interface SignalState {
	connected: boolean;
	/** Station id (`site:<id>` or a definition id) or `vessel:<id>`; null without a link. */
	to: string | null;
	reason: LinkReason | null;
	control: ControlState;
	/** Downlink rate, bit/s (plan 116): 0 below the ladder, null without a link budget. */
	rate?: number | null;
	/** Light time along the route, s (plan 117); null without a link. */
	latency?: number | null;
}

/** The longest link between two ratings, m. */
export const linkRange = (a: number, b: number, scale = 1): number => Math.sqrt(a * b) * scale;

// ---- the link budget (plan 116, ADR 0185) ----

/** Speed of light, m/s. */
export const SPEED_OF_LIGHT = 299_792_458;
/** Boltzmann's constant, J/K. */
export const BOLTZMANN = 1.380649e-23;
/** Aperture efficiency of a dish. */
export const DISH_EFFICIENCY = 0.55;
/** Gain of an antenna that gives neither a gain nor an aperture, dBi. */
export const DEFAULT_ANTENNA_GAIN = 2;
/** Eb/N0 every link needs, dB. */
export const LINK_EB_N0 = 3;
/** Data rates a link steps through, bit/s: decades from 1 kbit/s to 1 Gbit/s. */
export const RATE_LADDER = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9] as const;

const dB = (x: number): number => 10 * Math.log10(x);

/** Free-space path loss over `distance` m at `frequency` Hz, dB. */
export const freeSpaceLoss = (distance: number, frequency: number): number =>
	20 * Math.log10((4 * Math.PI * distance * frequency) / SPEED_OF_LIGHT);

/** Gain of a dish of diameter `aperture` m at `frequency` Hz, dBi. */
export const dishGain = (aperture: number, frequency: number): number =>
	dB(DISH_EFFICIENCY * ((Math.PI * aperture * frequency) / SPEED_OF_LIGHT) ** 2);

/** An antenna's gain on a band, dBi: its `gain`, else its dish gain, else the default. */
export function antennaGain(
	antenna: Pick<AntennaDefinition, 'gain' | 'aperture'>,
	band: Pick<BandDefinition, 'frequency'>
): number {
	if (antenna.gain !== undefined) return antenna.gain;
	if (antenna.aperture !== undefined) return dishGain(antenna.aperture, band.frequency);
	return DEFAULT_ANTENNA_GAIN;
}

/** The rate a margin at the ladder's first step allows, bit/s (0 below it). */
export function rateForMargin(margin: number): number {
	if (!(margin >= 0)) return 0;
	const step = Math.min(RATE_LADDER.length - 1, Math.floor(margin / 10));
	return RATE_LADDER[step]!;
}

export interface LinkBudgetInput {
	/** Transmit power, W. */
	power: number;
	/** dBi. */
	txGain: number;
	/** dBi. */
	rxGain: number;
	/** Geometric distance, m. */
	distance: number;
	/** The world's comms scale (default 1): the budget sees `distance / scale`. */
	scale?: number;
	band: BandDefinition;
}

/** Every term of a link budget, in the inspector's order (ADR 0185 point 5). */
export interface LinkBudget {
	band: string;
	/** Hz. */
	frequency: number;
	/** dBW. */
	txPower: number;
	/** dBi. */
	txGain: number;
	/** m. */
	distance: number;
	scale: number;
	/** m. */
	effectiveDistance: number;
	/** dB. */
	pathLoss: number;
	/** dBi. */
	rxGain: number;
	/** dBW. */
	received: number;
	/** K. */
	noiseTemperature: number;
	/** dBW/Hz. */
	noiseDensity: number;
	/** dB-Hz. */
	cn0: number;
	/** dB. */
	ebN0: number;
	/** Margin at the ladder's first step, dB. */
	margin: number;
	/** bit/s. */
	rate: number;
}

/** The Friis budget of one link, down to its rate (ADR 0185 points 5 to 7). */
export function linkBudget(input: LinkBudgetInput): LinkBudget {
	const scale = input.scale ?? 1;
	const effectiveDistance = input.distance / scale;
	const txPower = dB(input.power);
	const pathLoss = freeSpaceLoss(effectiveDistance, input.band.frequency);
	const received = txPower + input.txGain + input.rxGain - pathLoss;
	const noiseDensity = dB(BOLTZMANN * input.band.noiseTemperature);
	const cn0 = received - noiseDensity;
	const margin = cn0 - LINK_EB_N0 - dB(RATE_LADDER[0]);
	return {
		band: input.band.id,
		frequency: input.band.frequency,
		txPower,
		txGain: input.txGain,
		distance: input.distance,
		scale,
		effectiveDistance,
		pathLoss,
		rxGain: input.rxGain,
		received,
		noiseTemperature: input.band.noiseTemperature,
		noiseDensity,
		cn0,
		ebN0: LINK_EB_N0,
		margin,
		rate: rateForMargin(margin)
	};
}

// ---- routing (plan 117, ADR 0188) ----

/** Beam width of a dish without band or aperture data, rad. */
export const DEFAULT_BEAM_WIDTH = (2 * Math.PI) / 180;

/** A dish's full beam width, rad: its own, else `70 λ / D` degrees, else 2°. */
export function beamWidthOf(
	antenna: Pick<AntennaDefinition, 'beamWidth' | 'aperture'>,
	band: Pick<BandDefinition, 'frequency'> | undefined
): number {
	if (antenna.beamWidth !== undefined) return antenna.beamWidth;
	if (antenna.aperture !== undefined && band) {
		const wavelength = SPEED_OF_LIGHT / band.frequency;
		return Math.min(Math.PI, ((70 * wavelength) / antenna.aperture) * (Math.PI / 180));
	}
	return DEFAULT_BEAM_WIDTH;
}

/** How a vessel picks its route (ADR 0188 point 3). */
export type RouteMode =
	{ kind: 'auto' } | { kind: 'manual'; via: string[] } | { kind: 'policy'; policy: string };

export const routeModeSchema = z.union([
	z.object({ kind: z.literal('auto') }),
	z.object({ kind: z.literal('manual'), via: z.array(z.string().min(1)).min(1).max(16) }),
	z.object({ kind: z.literal('policy'), policy: definitionIdSchema })
]);

/** A candidate route a policy chooses from. */
export interface RouteCandidate {
	/** Hop ids after the vessel, ending at a control point. */
	hops: string[];
	/** Smallest edge capacity, bit/s. */
	width: number;
	/** Light time, s. */
	latency: number;
}

export interface RoutePolicyDefinition {
	id: string;
	label: string;
	/** Pure: the index of the route to take (candidates are never empty). */
	choose(routes: readonly RouteCandidate[]): number;
}

export const routePolicyDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	choose: z.custom<(...a: never[]) => unknown>(
		(v) => typeof v === 'function',
		'choose must be a function'
	)
});

/** Commands the signal-delay rule queues for a linked probe (ADR 0188 point 6). */
export const DELAYED_COMMANDS: ReadonlySet<string> = new Set([
	'throttle',
	'attitude',
	'sas',
	'stage',
	'action',
	'action-group'
]);

/** Rounds of the proportional capacity sharing (ADR 0188 point 4). */
export const CAPACITY_ROUNDS = 3;

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
