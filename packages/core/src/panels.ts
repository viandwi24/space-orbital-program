/**
 * Dock panels (plan 112, ADRs 0102 and 0149): a declarative view over a panel input, bound to pure
 * selectors and to commands the sim validates, plus an optional canvas drawn through a declared
 * subset of 2D drawing. Environment-neutral: no DOM types.
 */
import * as z from 'zod';
import { categoryIconSchema, type CategoryIcon } from './categories.ts';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import type { Command, Snapshot, VesselSnapshot } from './protocol.ts';

export const PANEL_CONTEXTS = ['flight', 'map', 'mission-center'] as const;
export type PanelContext = (typeof PANEL_CONTEXTS)[number];

/** What every selector reads (ADR 0149 point 2), built by the host once per HUD update. */
export interface PanelInput {
	snapshot: Snapshot;
	/** The vessel the player flies, or null. */
	vessel: VesselSnapshot | null;
	/** Metres above the radius of the active vessel's body, or null. */
	altitude: number | null;
	/** Speed relative to that body, m/s, or null. */
	speed: number | null;
	/** Sim time, s. */
	time: number;
}

export type PanelNode =
	| { kind: 'section'; title?: string; children: readonly PanelNode[] }
	| {
			kind: 'readout';
			label: string;
			value(input: PanelInput): string | number | null;
			unit?: string;
	  }
	| { kind: 'meter'; label: string; value(input: PanelInput): number | null }
	| {
			kind: 'switch';
			label: string;
			value(input: PanelInput): boolean;
			command(input: PanelInput, on: boolean): Command | null;
	  }
	| { kind: 'button'; label: string; command(input: PanelInput): Command | null }
	/** A choice among a few values (plan 330, ADR 0285 point 2), drawn as a segmented control. */
	| {
			kind: 'select';
			label: string;
			options: readonly { value: string; label: string }[];
			value(input: PanelInput): string | null;
			command(input: PanelInput, value: string): Command | null;
	  }
	| {
			kind: 'list';
			label?: string;
			/**
			 * The rows; a row may carry buttons of its own (plan 231, ADR 0231 point 7), each a command
			 * like a button's (null: shown disabled).
			 */
			items(input: PanelInput): readonly {
				name: string;
				value?: string;
				actions?: readonly { label: string; command: Command | null }[];
			}[];
	  }
	| {
			kind: 'sparkline';
			label: string;
			value(input: PanelInput): number | null;
			/** How many values the host keeps, default 60 (six seconds at 10 Hz). */
			samples?: number;
	  };

/** The 2D drawing a panel canvas offers (ADR 0149 point 4): a subset of Canvas 2D, no DOM types. */
export interface PanelCanvas {
	readonly width: number;
	readonly height: number;
	clear(): void;
	fillStyle(colour: string): void;
	strokeStyle(colour: string): void;
	lineWidth(width: number): void;
	beginPath(): void;
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	arc(x: number, y: number, radius: number, start: number, end: number): void;
	rect(x: number, y: number, width: number, height: number): void;
	closePath(): void;
	fill(): void;
	stroke(): void;
	/** Text in the UI face at `size` px. */
	fillText(text: string, x: number, y: number, size?: number): void;
}

export interface PanelDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	title: string;
	icon: CategoryIcon;
	/** Rail position, ascending; host panels use 100 to 500. */
	order: number;
	contexts: readonly PanelContext[];
	view: PanelNode;
	/** A drawing area under the view, drawn only while the panel is open. */
	canvas?: { height: number; draw(canvas: PanelCanvas, input: PanelInput): void };
	/**
	 * The mod's own UI (plan 330, ADR 0285 point 1): `source` is an ES module exporting
	 * `mount(root, host)`, run in a sandboxed frame under the view. `host.onInput(fn)`,
	 * `host.command(c)`, `host.resize(px)`, `host.theme`.
	 */
	custom?: { height: number; source: string };
}

const fn = z.custom<(...args: never[]) => unknown>(
	(v) => typeof v === 'function',
	'expected a function'
);
const label = z.string().min(1);

export const panelNodeSchema: z.ZodType<PanelNode> = z.lazy(() =>
	z.discriminatedUnion('kind', [
		z.object({
			kind: z.literal('section'),
			title: z.string().optional(),
			children: z.array(panelNodeSchema)
		}),
		z.object({ kind: z.literal('readout'), label, value: fn, unit: z.string().optional() }),
		z.object({ kind: z.literal('meter'), label, value: fn }),
		z.object({ kind: z.literal('switch'), label, value: fn, command: fn }),
		z.object({ kind: z.literal('button'), label, command: fn }),
		z.object({
			kind: z.literal('select'),
			label,
			options: z
				.array(z.object({ value: z.string().min(1), label }))
				.min(2)
				.max(8),
			value: fn,
			command: fn
		}),
		z.object({ kind: z.literal('list'), label: z.string().optional(), items: fn }),
		z.object({
			kind: z.literal('sparkline'),
			label,
			value: fn,
			samples: z.int().min(2).max(600).optional()
		})
	])
) as z.ZodType<PanelNode>;

export const panelDefinitionSchema = z.object({
	id: z
		.string()
		.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case'),
	title: z.string().min(1),
	icon: categoryIconSchema,
	order: z.number().finite(),
	contexts: z.array(z.enum(PANEL_CONTEXTS)).min(1),
	view: panelNodeSchema,
	canvas: z.object({ height: z.number().positive().max(600), draw: fn }).optional(),
	custom: z
		.object({ height: z.number().positive().max(600), source: z.string().min(1).max(500_000) })
		.optional()
});

/** Panels in rail order: `order` ascending, ties in registration order. */
export function sortPanels<T extends Pick<PanelDefinition, 'order'>>(list: readonly T[]): T[] {
	return list
		.map((p, i) => [p, i] as const)
		.sort((a, b) => a[0].order - b[0].order || a[1] - b[1])
		.map(([p]) => p);
}
