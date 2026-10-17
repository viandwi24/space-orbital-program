/**
 * Data items and data kinds (plan 083, ADRs 0099, 0101 and 0172): sized data a vessel stores in
 * modules that declare `dataStorage`. Plain data and pure functions; environment-neutral.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

/** A piece of data on a vessel (ADR 0172 point 1). */
export interface DataItem {
	/** `<part entity>:<n>`, given by the storing module; unique in the world. */
	id: string;
	/** Registered data kind id. */
	kind: string;
	/** Size, bits (positive, finite). */
	bits: number;
	/** Worth when made (science points for plan 103); `dataValueAt` applies the kind's curve. */
	value: number;
	/** Sim time the item was made, s. */
	time: number;
	source?: { vessel: number; part: number };
	/** What the item is about (a science subject id in plan 103). */
	subject?: string;
	meta?: Record<string, string | number | boolean>;
}

/** What `ctx.vessel.data.store` takes: an item without its id. */
export type NewDataItem = Omit<DataItem, 'id'>;

export interface DataKindDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Integer, lower first (ADR 0101 tier 4: command, telemetry, voice, science, bulk). */
	priority: number;
	/** `[ageSeconds, factor]`, ages ascending, factors 0..1, linear between points, flat after the last. */
	valueCurve?: ReadonlyArray<readonly [number, number]>;
}

const finite = z.number().refine(Number.isFinite, 'must be a finite number');

export const dataKindDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	priority: z.int(),
	valueCurve: z
		.array(
			z.tuple([finite.refine((a) => a >= 0, 'age must not be negative'), z.number().min(0).max(1)])
		)
		.min(1)
		.refine(
			(points) => points.every((p, i) => i === 0 || p[0] > points[i - 1]![0]),
			'curve ages must be strictly ascending'
		)
		.optional()
});

export const dataItemSchema = z.object({
	id: z.string().min(1),
	kind: z.string().min(1),
	bits: finite.refine((b) => b > 0, 'bits must be positive'),
	value: finite,
	time: finite,
	source: z.object({ vessel: z.int(), part: z.int() }).optional(),
	subject: z.string().optional(),
	meta: z.record(z.string(), z.union([z.string(), finite, z.boolean()])).optional()
});

/** The kind's factor for an item of `age` seconds (1 without a curve; 1 before the first point's age is the first factor). */
export function dataValueFactor(kind: Pick<DataKindDefinition, 'valueCurve'>, age: number): number {
	const curve = kind.valueCurve;
	if (!curve || curve.length === 0) return 1;
	if (age <= curve[0]![0]) return curve[0]![1];
	for (let i = 1; i < curve.length; i++) {
		const [a1, f1] = curve[i]!;
		if (age <= a1) {
			const [a0, f0] = curve[i - 1]!;
			return f0 + ((f1 - f0) * (age - a0)) / (a1 - a0);
		}
	}
	return curve[curve.length - 1]![1];
}

/** `item.value` times the kind's factor at sim time `t` (ADR 0172 point 2). */
export function dataValueAt(
	kind: Pick<DataKindDefinition, 'valueCurve'>,
	item: Pick<DataItem, 'value' | 'time'>,
	t: number
): number {
	return item.value * dataValueFactor(kind, t - item.time);
}

/** How a module holds data items (ADR 0172 point 3); its state carries `DataStorageState`. */
export interface DataStorage<Config = unknown> {
	/** Capacity, bits. */
	capacity(config: Config): number;
}

/** The state shape of a module with `dataStorage`: its items and the counter for their ids. */
export interface DataStorageState {
	items: DataItem[];
	next: number;
}
