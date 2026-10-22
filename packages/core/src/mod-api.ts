/**
 * The mod World API's acting half (plan 343, ADR 0292): stores (a mod's own state saved with the
 * world), keybindings, and the context systems and autopilots get (`ModContext`): the world query,
 * commands sent with source `mod`, the plugin's stores, notices and focus. Environment-neutral.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import type { EntityId } from './ids.ts';
import type { PanelInput } from './panels.ts';
import type {
	AlarmKind,
	Command,
	CommandResult,
	SasMode,
	TargetRef,
	VesselDesign,
	VesselPlacement,
	WarpTarget
} from './protocol.ts';
import type { WorldQuery } from './world-query.ts';
import type { OverlayShape } from './overlays.ts';

// ---------------------------------------------------------------------------------------------
// Stores (ADR 0292 point 4)

/** Most JSON a store may hold, bytes. */
export const STORE_MAX_BYTES = 64 * 1024;

export interface StoreDefinition<T = unknown> {
	/** `<plugin>.<name>`; only the registering plugin's systems and autopilots may write it. */
	id: string;
	/** Validates every `set` and the saved value on resume. */
	schema: z.ZodType<T>;
	/** The value of a new world, and of a save whose value no longer parses. */
	initial: T;
}

export const storeDefinitionSchema = z.object({
	id: z
		.string()
		.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case'),
	schema: z.custom<z.ZodType>(
		(v) => typeof v === 'object' && v !== null && typeof (v as z.ZodType).safeParse === 'function',
		'expected a zod schema'
	),
	initial: z.unknown()
});

/** A store as its plugin uses it. */
export interface Store<T> {
	get(): T;
	/** Validate and keep `value` (a deep copy); throws a `RangeError` with the zod issue when invalid or too big. */
	set(value: T): void;
	/** `set(fn(get()))`. */
	update(fn: (value: T) => T): void;
}

/** Why `value` cannot be kept in `def`, or undefined (the schema, then the size). */
export function storeProblem(def: StoreDefinition, value: unknown): string | undefined {
	const parsed = def.schema.safeParse(value);
	if (!parsed.success) {
		const i = parsed.error.issues[0];
		return `store "${def.id}": ${i ? `${i.path.join('.') || '(value)'}: ${i.message}` : 'invalid'}`;
	}
	let text: string | undefined;
	try {
		text = JSON.stringify(parsed.data);
	} catch {
		return `store "${def.id}": the value is not JSON`;
	}
	if (text === undefined) return `store "${def.id}": the value is not JSON`;
	if (text.length > STORE_MAX_BYTES)
		return `store "${def.id}": ${text.length} bytes is over the ${STORE_MAX_BYTES} byte limit`;
	return undefined;
}

// ---------------------------------------------------------------------------------------------
// Keybindings (ADR 0292 point 6)

export interface KeybindingDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Key ids as the controls settings write them (`KeyK`, `Alt+KeyK`); may be empty (unbound). */
	defaults: readonly string[];
	/** Where it acts (default `flight`). */
	mode?: 'flight' | 'map';
	/**
	 * The command to send, from the panel input at the key press; null sends nothing. Without it
	 * the page sends `mod-key { key: id, vessel }` and the sim emits `mod:key` for systems.
	 */
	command?(input: PanelInput): Command | null;
}

export const keybindingDefinitionSchema = z.object({
	id: z
		.string()
		.regex(DEFINITION_ID_PATTERN, 'expected "<plugin>.<name>" in lower-case kebab-case'),
	label: z.string().min(1),
	defaults: z.array(z.string().min(1)).max(2),
	mode: z.enum(['flight', 'map']).optional(),
	command: z
		.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', 'expected a function')
		.optional()
});

// ---------------------------------------------------------------------------------------------
// Commands (ADR 0292 point 3)

/** A maneuver node in the orbital frame at its time, m/s. */
export interface NodeBurn {
	time: number;
	prograde: number;
	normal: number;
	radial: number;
	/** Replace this node instead of adding one. */
	id?: number;
}

/**
 * The sim's commands for a mod, sent with source `mod`. Each returns the sim's result: a refusal
 * carries the reason (not allowed for mods, the world's rules, or the command's own checks).
 */
export interface ModCommands {
	/** Any command a mod may send (see `MOD_COMMAND_RULES` in the guide). */
	send(command: Command): CommandResult;
	setTarget(vessel: EntityId, target: TargetRef | null): CommandResult;
	stage(vessel: EntityId): CommandResult;
	/** Toggle (no value) or set an action group (`stock.gear`, `custom-1`, ...). */
	actionGroup(vessel: EntityId, group: string, value?: boolean | number | string): CommandResult;
	throttle(vessel: EntityId, value: number): CommandResult;
	sas(vessel: EntityId, mode: SasMode): CommandResult;
	/** A warp level; the sim clamps it to the world's limits. */
	warp(factor: number): CommandResult;
	/** Warp to a time or to an event (apoapsis, periapsis, SOI, node, alarm). */
	warpTo(to: number | WarpTarget, factor?: number): CommandResult;
	placeNode(vessel: EntityId, node: NodeBurn): CommandResult;
	removeNode(vessel: EntityId, id?: number): CommandResult;
	addAlarm(alarm: {
		name?: string;
		kind?: AlarmKind;
		time?: number;
		vessel?: EntityId;
		lead?: number;
	}): CommandResult;
	rename(vessel: EntityId, name: string): CommandResult;
	engage(vessel: EntityId, autopilot: string, params?: unknown): CommandResult;
	disengage(vessel: EntityId): CommandResult;
	/** Load a vessel (sandbox or debug mode only). */
	spawn(design: VesselDesign, placement?: VesselPlacement): CommandResult;
	/** Remove a vessel (sandbox or debug mode only). */
	terminate(vessel: EntityId): CommandResult;
	/** Ask the page to fly `vessel` (emits `mod:focus`); refused for an unknown vessel. */
	focus(vessel: EntityId): CommandResult;
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

/** What systems (`SystemContext`) and autopilots (their last argument) get from the sim. */
export interface ModContext {
	/** The plugin that registered the system or autopilot. */
	readonly plugin: string;
	/** The world as of now (ADR 0292 point 1), built on first read per sim time. */
	readonly world: WorldQuery;
	readonly commands: ModCommands;
	/** The plugin's own store; throws for another plugin's store or an unregistered one. */
	store<T>(def: StoreDefinition<T> | string): Store<T>;
	/** A toast on the page (`mod:notice`); with `vessel`, only while the player flies it. */
	notify(text: string, options?: { tone?: NoticeTone; vessel?: EntityId; detail?: string }): void;
	/** The plugin's overlays (plan 347, ADR 0296 point 3): shown on the page until replaced or cleared. */
	readonly overlays: ModOverlays;
}

export interface ModOverlays {
	/**
	 * Publish shapes for one of the plugin's overlays (replacing the last ones); `meta` is for its
	 * panel. Shapes are checked and clamped; the result lists what was dropped. Not saved.
	 */
	set(
		id: string,
		shapes: readonly OverlayShape[],
		meta?: Record<string, number | string>
	): { dropped: string[] };
	clear(id: string): void;
}
