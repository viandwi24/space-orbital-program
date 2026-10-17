/**
 * Part action descriptors and action groups (plan 110, ADRs 0102 and 0174). Plain data and pure
 * functions; environment-neutral. The zod schemas are in `schemas.ts` (no import cycle).
 */

export const ACTION_KINDS = ['toggle', 'value', 'trigger', 'mode'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/**
 * One control a module offers (ADR 0174 point 1). `id` names an entry of the module's `actions`:
 * a toggle calls it with a boolean, a value with a number, a mode with an option's value, a trigger
 * with nothing.
 */
export interface PartActionDescriptor {
	id: string;
	label: string;
	kind: ActionKind;
	/** Current value: boolean (toggle), number (value), string (mode); absent for a trigger. */
	value?: boolean | number | string;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	options?: ReadonlyArray<{ value: string; label: string }>;
	enabled: boolean;
	/** Why it is disabled. */
	reason?: string;
	/** Action group id (a registered group). */
	group?: string;
	icon?: string;
}

export interface ActionGroupDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	icon?: string;
	/** Display order, ascending (default 0). */
	order?: number;
}

export type GroupState = 'on' | 'off' | 'mixed' | 'none';

/** State of a group from its toggles' values (ADR 0174 point 2). */
export function groupState(values: ReadonlyArray<unknown>): GroupState {
	const toggles = values.filter((v): v is boolean => typeof v === 'boolean');
	if (toggles.length === 0) return 'none';
	if (toggles.every((v) => v)) return 'on';
	if (toggles.every((v) => !v)) return 'off';
	return 'mixed';
}

/** Why `value` cannot be sent to `d`, or undefined when it can (ADR 0174 point 1). */
export function actionArgumentProblem(d: PartActionDescriptor, value: unknown): string | undefined {
	if (!d.enabled) return d.reason ?? `"${d.label}" is not available`;
	switch (d.kind) {
		case 'toggle':
			return typeof value === 'boolean' ? undefined : `"${d.label}" needs true or false`;
		case 'value':
			return typeof value === 'number' &&
				Number.isFinite(value) &&
				value >= d.min! &&
				value <= d.max!
				? undefined
				: `"${d.label}" needs a number from ${d.min} to ${d.max}`;
		case 'mode':
			return typeof value === 'string' && d.options!.some((o) => o.value === value)
				? undefined
				: `"${d.label}" needs one of ${d.options!.map((o) => o.value).join(', ')}`;
		case 'trigger':
			return undefined;
	}
}

/** Custom group of a design (ADR 0174 point 4): slot 1..10, members by design part index. */
export interface DesignActionGroup {
	slot: number;
	label: string;
	members: Array<{ part: number; module: string; action: string }>;
}

export const MAX_CUSTOM_GROUPS = 10;
/** Group id of a vessel's custom group. */
export const customGroupId = (slot: number): string => `custom.${slot}`;
