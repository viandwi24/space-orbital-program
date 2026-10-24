/**
 * Inventory and deployed stations (plan 284, ADR 0264): small `cargo` parts ride in a container's
 * or a suit's inventory, an engineer attaches them to a hull or detaches them again, and
 * deployable ones set on the ground form a station that yields science over time.
 */
import { defineModule, z } from '@orbital/sdk';

export const inventoryConfigSchema = z.object({
	/** What the holder takes, litres of cargo volume. */
	capacity: z.number().positive()
});
export type InventoryConfig = z.output<typeof inventoryConfigSchema>;

/** One carried part: its definition, and the module states it had when it was detached (a battery's charge). */
export interface CargoItem {
	part: string;
	state?: Record<string, unknown>;
}
export interface InventoryState {
	items: CargoItem[];
}

export const ModuleInventory = defineModule({
	id: 'stock.inventory',
	config: inventoryConfigSchema,
	state: (): InventoryState => ({ items: [] }),
	describe: (config, state) => ({
		category: 'stock.other',
		readouts: [
			{
				id: 'cargo',
				label: 'Cargo',
				value:
					state.items.length === 0
						? `empty, ${config.capacity} L`
						: `${state.items.length} item${state.items.length === 1 ? '' : 's'}, ${config.capacity} L`
			}
		]
	}),
	snapshot: (state) => ({ items: state.items.map((i) => i.part) })
});

/** The role of a station item (plan 284): what it brings to the station it stands in. */
export const STATION_ROLES = ['control', 'power', 'antenna', 'science'] as const;
export const stationItemConfigSchema = z.object({
	role: z.enum(STATION_ROLES),
	/** A `science` item's experiment, yielded by the station each day (an experiment with `station`). */
	experiment: z.string().min(1).optional()
});

/**
 * A deployable item of a station. It is kept: a placed item is never removed as resting debris.
 * The sim reads the role, and the item's own modules (a panel's or an RTG's rate, an antenna, an
 * experiment) are what the role is made of.
 */
export const ModuleStationItem = defineModule({
	id: 'stock.station-item',
	config: stationItemConfigSchema,
	keep: true,
	describe: (config) => ({
		category: 'stock.other',
		readouts: [{ id: 'role', label: 'Station role', value: config.role }]
	})
});
