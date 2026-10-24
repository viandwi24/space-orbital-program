/**
 * Stock comms (plan 114, ADR 0179): two antennas and the `stock.antenna` module; the five radio
 * bands (plan 116, ADR 0185). Stations are the world's sites; the network itself is computed by
 * the sim from these definitions and the rules.
 */
import { dynamicPressure } from './solar.ts';
import { defineAntenna, defineBand, defineModule, defineRoutePolicy, z } from '@orbital/sdk';

// Values and sources: docs/research/comms.md.
export const BandUhf = defineBand({
	id: 'stock.uhf',
	label: 'UHF',
	frequency: 401e6,
	noiseTemperature: 300
});
export const BandS = defineBand({
	id: 'stock.s',
	label: 'S band',
	frequency: 2.25e9,
	noiseTemperature: 100
});
export const BandX = defineBand({
	id: 'stock.x',
	label: 'X band',
	frequency: 8.45e9,
	noiseTemperature: 50
});
export const BandKa = defineBand({
	id: 'stock.ka',
	label: 'Ka band',
	frequency: 32e9,
	noiseTemperature: 80
});
/** Laser at 1550 nm; its noise temperature is an effective one (photon-limited receivers). */
export const BandOptical = defineBand({
	id: 'stock.optical',
	label: 'Optical',
	frequency: 299_792_458 / 1550e-9,
	noiseTemperature: 10_000
});

export const STOCK_BANDS = [BandUhf, BandS, BandX, BandKa, BandOptical] as const;

/** Route policies (plan 117, ADR 0188 point 3): pure choices among the candidate routes. */
export const PolicyFewestHops = defineRoutePolicy({
	id: 'stock.fewest-hops',
	label: 'Fewest hops',
	choose: (routes) => {
		let best = 0;
		routes.forEach((r, i) => {
			if (r.hops.length < routes[best]!.hops.length) best = i;
		});
		return best;
	}
});
export const PolicyLowestLatency = defineRoutePolicy({
	id: 'stock.lowest-latency',
	label: 'Lowest latency',
	choose: (routes) => {
		let best = 0;
		routes.forEach((r, i) => {
			if (r.latency < routes[best]!.latency) best = i;
		});
		return best;
	}
});

export const STOCK_ROUTE_POLICIES = [PolicyFewestHops, PolicyLowestLatency] as const;

/** A small omni antenna: reaches the home system's moon from a tier-1 station. */
export const AntennaWhip = defineAntenna({
	id: 'stock.whip',
	label: 'Whip antenna',
	kind: 'omni',
	range: 5e5,
	power: 5,
	band: BandS.id,
	gain: 2
});
/** A dish: links across the system. */
export const AntennaDish = defineAntenna({
	id: 'stock.dish',
	label: 'Dish antenna',
	kind: 'dish',
	range: 2e9,
	power: 50,
	band: BandX.id,
	aperture: 1
});

/**
 * The EVA suit's radio (plan 121, ADR 0193 point 1): low-power UHF, relayed by a crewed vessel
 * in sight; its range scales with the wearer's `radio` ability.
 */
export const AntennaSuitRadio = defineAntenna({
	id: 'stock.suit-radio',
	label: 'Suit radio',
	kind: 'omni',
	range: 2_000,
	power: 0.5,
	band: BandUhf.id,
	gain: 0,
	suit: true
});

export const STOCK_ANTENNAS = [AntennaWhip, AntennaDish, AntennaSuitRadio] as const;

export const antennaConfigSchema = z.object({
	/** Antenna definition id. */
	antenna: z.string().min(1),
	/**
	 * Dynamic pressure above which a deployed (enabled) antenna breaks, Pa (plan 280): it switches off
	 * for good. Absent: it does not break.
	 */
	breakQ: z.number().positive().optional()
});
export type AntennaConfig = z.output<typeof antennaConfigSchema>;
export interface AntennaState {
	enabled: boolean;
	/** Torn off by the airflow (plan 280). */
	broken?: boolean;
	/** Where a dish points (plan 117, ADR 0188 point 2); null or absent: Auto. */
	target?: string | null;
	/** Channel on the antenna's band and encryption (plan 120, ADR 0191 point 1). */
	channel?: number;
	encrypted?: boolean;
}

/** Puts the part's antenna on the network while enabled (ADR 0179 point 1). */
export const ModuleAntenna = defineModule({
	id: 'stock.antenna',
	config: antennaConfigSchema,
	state: (): AntennaState => ({ enabled: true }),
	antenna: (config, state) => ({
		antenna: config.antenna,
		enabled: state.enabled && !state.broken,
		target: state.target ?? null,
		channel: state.channel ?? 0,
		encrypted: state.encrypted === true
	}),
	update(ctx) {
		const { breakQ } = ctx.config;
		if (breakQ === undefined || !ctx.state.enabled || ctx.state.broken) return;
		if (dynamicPressure(ctx.vessel) > breakQ) {
			ctx.state.broken = true;
			ctx.state.enabled = false;
		}
	},
	describe: (_config, state) => ({
		category: 'command',
		readouts: state.broken
			? [{ id: 'broken', label: 'Status', value: 'Broken by the airflow' }]
			: [],
		actions: [
			{
				id: 'setEnabled',
				label: 'Antenna',
				kind: 'toggle',
				value: state.enabled,
				enabled: !state.broken,
				...(state.broken ? { reason: 'Broken by the airflow' } : {}),
				icon: 'antenna'
			},
			{
				id: 'setChannel',
				label: 'Channel',
				kind: 'value',
				value: state.channel ?? 0,
				min: 0,
				max: 3,
				step: 1,
				enabled: true
			},
			{
				id: 'setEncrypted',
				label: 'Encryption',
				kind: 'toggle',
				value: state.encrypted === true,
				enabled: true
			}
		]
	}),
	actions: {
		/** `(enabled)`. */
		setEnabled: (ctx, ...args) => {
			const [enabled] = z.tuple([z.boolean()]).parse(args);
			if (!ctx.state.broken) ctx.state.enabled = enabled;
		},
		/** `(channel)`: 0..3 on the stock bands (ADR 0191 point 1). */
		setChannel: (ctx, ...args) => {
			const [channel] = z.tuple([z.number().int().min(0).max(63)]).parse(args);
			ctx.state.channel = channel;
		},
		/** `(encrypted)`: 0.8 times the rate (ADR 0191 point 4). */
		setEncrypted: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.encrypted = on;
		}
	},
	snapshot: (state) => ({
		enabled: state.enabled,
		...(state.broken ? { broken: true } : {}),
		channel: state.channel ?? 0,
		encrypted: state.encrypted === true
	})
});
