/**
 * Stock data kinds and the data storage module (plan 083, ADR 0172). Priorities follow ADR 0101
 * tier 4 (command, telemetry, voice, science, bulk; command data is plan 119's).
 */
import { defineDataKind, defineModule, z, type DataStorageState } from '@orbital/sdk';

const DAY = 21_600; // stock home body day, s

export const DataTelemetry = defineDataKind({
	id: 'stock.telemetry',
	label: 'Telemetry',
	priority: 0,
	// Stale after a day: half its worth, nothing after ten.
	valueCurve: [
		[0, 1],
		[DAY, 0.5],
		[10 * DAY, 0]
	]
});
export const DataVoice = defineDataKind({ id: 'stock.voice', label: 'Voice', priority: 1 });
export const DataScience = defineDataKind({ id: 'stock.science', label: 'Science', priority: 2 });
export const DataImage = defineDataKind({ id: 'stock.image', label: 'Image', priority: 3 });
export const DataBulk = defineDataKind({ id: 'stock.bulk', label: 'Bulk', priority: 4 });

export const STOCK_DATA_KINDS = [
	DataTelemetry,
	DataVoice,
	DataScience,
	DataImage,
	DataBulk
] as const;

export const dataStorageConfigSchema = z.object({
	/** Capacity, bits. */
	capacity: z.number().positive()
});

/**
 * Holds data items (ADR 0172 point 3). Its snapshot lists the items with their size, kind and
 * worth when made, for the UI.
 */
export const ModuleDataStorage = defineModule({
	id: 'stock.data-storage',
	config: dataStorageConfigSchema,
	dataStorage: { capacity: (config) => config.capacity },
	state: (): DataStorageState => ({ items: [], next: 0 }),
	snapshot: (state) => ({
		used: state.items.reduce((sum, item) => sum + item.bits, 0),
		items: state.items.map(({ id, kind, bits, value, time, subject }) => ({
			id,
			kind,
			bits,
			value,
			time,
			...(subject === undefined ? {} : { subject })
		}))
	})
});
