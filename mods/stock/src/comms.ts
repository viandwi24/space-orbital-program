/**
 * Stock comms (plan 114, ADR 0179): two antennas and the `stock.antenna` module; the five radio
 * bands (plan 116, ADR 0185). Stations are the world's sites; the network itself is computed by
 * the sim from these definitions and the rules.
 */
import { defineAntenna, defineBand, defineModule, z } from '@orbital/sdk';

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

export const STOCK_ANTENNAS = [AntennaWhip, AntennaDish] as const;

export const antennaConfigSchema = z.object({
	/** Antenna definition id. */
	antenna: z.string().min(1)
});
export type AntennaConfig = z.output<typeof antennaConfigSchema>;
export interface AntennaState {
	enabled: boolean;
}

/** Puts the part's antenna on the network while enabled (ADR 0179 point 1). */
export const ModuleAntenna = defineModule({
	id: 'stock.antenna',
	config: antennaConfigSchema,
	state: (): AntennaState => ({ enabled: true }),
	antenna: (config, state) => ({ antenna: config.antenna, enabled: state.enabled }),
	describe: (_config, state) => ({
		category: 'command',
		actions: [
			{
				id: 'setEnabled',
				label: 'Antenna',
				kind: 'toggle',
				value: state.enabled,
				enabled: true,
				icon: 'antenna'
			}
		]
	}),
	actions: {
		/** `(enabled)`. */
		setEnabled: (ctx, ...args) => {
			const [enabled] = z.tuple([z.boolean()]).parse(args);
			ctx.state.enabled = enabled;
		}
	},
	snapshot: (state) => ({ enabled: state.enabled })
});
