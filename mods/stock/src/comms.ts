/**
 * Stock comms (plan 114, ADR 0179): two antennas and the `stock.antenna` module. Stations are the
 * world's sites; the network itself is computed by the sim from these definitions and the rules.
 */
import { defineAntenna, defineModule, z } from '@orbital/sdk';

/** A small omni antenna: reaches the home system's moon from a tier-1 station. */
export const AntennaWhip = defineAntenna({
	id: 'stock.whip',
	label: 'Whip antenna',
	kind: 'omni',
	range: 5e5,
	power: 5
});
/** A dish: links across the system. */
export const AntennaDish = defineAntenna({
	id: 'stock.dish',
	label: 'Dish antenna',
	kind: 'dish',
	range: 2e9,
	power: 50
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
