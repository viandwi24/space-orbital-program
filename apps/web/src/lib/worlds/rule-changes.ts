/**
 * World settings during play (plan 230, ADR 0230): which values a rule may take now (toward easier
 * only, by the rule's `easier`), and the changelog as lines. Pure; the dialog and the tests share it.
 */
import {
	ruleChangeProblem,
	type RuleDefinition,
	type RuleValue,
	type WorldInfo
} from '@orbital/core';

export interface RuleOption {
	value: RuleValue;
	label: string;
	/** Why this value cannot be chosen now, or null. */
	why: string | null;
}

/** The choices of a boolean or enum rule from `current`, each with why it is closed. */
export function ruleOptions(rule: RuleDefinition, current: RuleValue): RuleOption[] {
	const values: RuleValue[] =
		rule.type === 'boolean' ? [true, false] : rule.type === 'enum' ? [...rule.values] : [];
	return values.map((value) => ({
		value,
		label: rule.type === 'boolean' ? (value ? 'On' : 'Off') : String(value),
		why: ruleChangeProblem(rule, current, value) ?? null
	}));
}

/** The range a number rule may take now: from the current value toward easier. */
export function numberRange(
	rule: Extract<RuleDefinition, { type: 'number' }>,
	current: number
): { min: number; max: number } | null {
	if (rule.easier === 'higher') return { min: current, max: rule.max };
	if (rule.easier === 'lower') return { min: rule.min, max: current };
	return null;
}

/** Whether the rule can change at all now (it has an easier direction and is not at its end). */
export function changeableNow(rule: RuleDefinition, current: RuleValue): boolean {
	if (!rule.changeable || rule.easier === undefined) return false;
	if (rule.type === 'number') {
		const r = numberRange(rule, Number(current));
		return r !== null && r.min < r.max;
	}
	return ruleOptions(rule, current).some((o) => o.value !== current && o.why === null);
}

/** "Day 3 · Allow revert: off → on" lines, newest first. */
export function changelogLines(
	changelog: WorldInfo['changelog'],
	rules: readonly RuleDefinition[],
	dayLength: number
): string[] {
	const label = (id: string) => rules.find((r) => r.id === id)?.label ?? id;
	const text = (v: RuleValue) => (v === true ? 'on' : v === false ? 'off' : String(v));
	return [...changelog]
		.reverse()
		.map(
			(c) =>
				`Day ${Math.floor(c.time / dayLength) + 1} · ${label(c.rule)}: ${text(c.from)} → ${text(c.to)}`
		);
}
