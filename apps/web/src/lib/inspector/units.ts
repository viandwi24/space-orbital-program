/**
 * Typed values with units for the part inspector (plan 214, ADR 0205 point 2). A descriptor's
 * `units` say how its value reads in other units (`amount = value × factor`): the engine limiter is
 * a fraction, 25 % and 50 kN on a 200 kN engine. The units the player may type are the table below.
 */
import type { PartActionDescriptor } from '@orbital/core';

/** The units the inspector reads, lower case: anything else is refused with a message. */
export const KNOWN_UNITS = ['kn', '%', 'm', 's', 'atm', 'k', 'ec/s', 'u'] as const;

export type Parsed = { value: number } | { error: string };

type Units = ReadonlyArray<{ unit: string; factor: number }>;

/** The units a descriptor accepts: its own `unit` (factor 1) and its alternatives. */
export function unitsOf(d: Pick<PartActionDescriptor, 'unit' | 'units'>): Units {
	const out: Array<{ unit: string; factor: number }> = [...(d.units ?? [])];
	if (d.unit && !out.some((u) => u.unit.toLowerCase() === d.unit!.toLowerCase()))
		out.push({ unit: d.unit, factor: 1 });
	return out;
}

const fmt = (n: number): string => (Math.abs(n) >= 100 ? n.toFixed(0) : String(+n.toFixed(2)));

/** `value` in the descriptor's first unit, as the inspector shows it. */
export function formatTyped(
	d: Pick<PartActionDescriptor, 'unit' | 'units'>,
	value: number
): string {
	const [first] = unitsOf(d);
	return first ? `${fmt(value * first.factor)} ${first.unit}` : fmt(value);
}

/**
 * The descriptor value for typed `text`: a number with an optional unit; without one the first unit
 * applies. Out of range, an unknown unit or no number gives a message and no value.
 */
export function parseTyped(
	d: Pick<PartActionDescriptor, 'label' | 'unit' | 'units' | 'min' | 'max'>,
	text: string
): Parsed {
	const m = text.trim().match(/^(-?\d+(?:\.\d+)?|-?\.\d+)\s*([a-zA-Z%/]*)$/);
	if (!m)
		return { error: `Type a number${unitsOf(d)[0] ? `, e.g. ${formatTyped(d, d.max ?? 1)}` : ''}` };
	const amount = Number(m[1]);
	const typed = m[2]!.toLowerCase();
	const units = unitsOf(d);
	let factor = 1;
	if (typed !== '') {
		if (!(KNOWN_UNITS as readonly string[]).includes(typed))
			return { error: `"${m[2]}" is not a unit the inspector knows` };
		const u = units.find((x) => x.unit.toLowerCase() === typed);
		if (!u) return { error: `${d.label} is not set in ${m[2]}` };
		factor = u.factor;
	} else if (units[0]) factor = units[0].factor;
	const value = amount / factor;
	if (d.min !== undefined && value < d.min - 1e-9)
		return { error: `${d.label} cannot go below ${formatTyped(d, d.min)}` };
	if (d.max !== undefined && value > d.max + 1e-9)
		return { error: `${d.label} cannot go above ${formatTyped(d, d.max)}` };
	return { value: Math.min(d.max ?? value, Math.max(d.min ?? value, value)) };
}
