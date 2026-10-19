/**
 * World rules and presets (plan 078, ADRs 0094 and 0111): typed registry entries a mod defines,
 * and the pure functions that check a value and resolve a world's values. Environment-neutral.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

export type RuleValue = boolean | number | string;

interface RuleBase {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Group in Create World and the world details (`economy`, `science`, `crew`, `comms`, ...). */
	category: string;
	description?: string;
	/** False for an identity rule: fixed when the world is created (ADR 0094 point 4). */
	changeable: boolean;
}

/**
 * Which way is easier (plan 230, ADR 0229): a boolean rule names its easier value, a number rule
 * whether `higher` or `lower` is easier, an enum lists its values from hardest to easiest. A world
 * may change a rule during play only toward easier; a rule without it is fixed after creation
 * (outside debug mode).
 */
export type RuleEasier = boolean | 'higher' | 'lower' | readonly string[];

export type RuleDefinition =
	| (RuleBase & {
			type: 'boolean';
			default: boolean;
			easier?: boolean;
			/** Value per preset id; a preset's own `values` win over this. */
			presets?: Record<string, boolean>;
	  })
	| (RuleBase & {
			type: 'enum';
			values: readonly string[];
			default: string;
			/** The values from hardest to easiest (plan 230). */
			easier?: readonly string[];
			presets?: Record<string, string>;
	  })
	| (RuleBase & {
			type: 'number';
			min: number;
			max: number;
			integer?: boolean;
			default: number;
			easier?: 'higher' | 'lower';
			presets?: Record<string, number>;
	  });

export interface PresetDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	description?: string;
	/** Rule id to value; a rule that is not loaded is ignored. */
	values?: Record<string, RuleValue>;
}

/** Names that are world identity, not registered rules: `set-rule` refuses them (ADR 0111 point 4). */
export const IDENTITY_RULES: readonly string[] = [
	'system',
	'variant',
	'gravityModel',
	'seed',
	'primarySite'
];

/** Preset of the Legacy world and of a world that names none (ADR 0094 point 6). */
export const DEFAULT_PRESET = 'stock.sandbox';

/** Why `value` does not fit `rule`, or undefined when it does. */
export function ruleValueProblem(rule: RuleDefinition, value: unknown): string | undefined {
	switch (rule.type) {
		case 'boolean':
			return typeof value === 'boolean' ? undefined : 'expected true or false';
		case 'enum':
			return typeof value === 'string' && rule.values.includes(value)
				? undefined
				: `expected one of ${rule.values.join(', ')}`;
		case 'number': {
			const range = `a ${rule.integer ? 'whole number' : 'number'} from ${rule.min} to ${rule.max}`;
			if (typeof value !== 'number' || !Number.isFinite(value)) return `expected ${range}`;
			if (rule.integer && !Number.isInteger(value)) return `expected ${range}`;
			return value < rule.min || value > rule.max ? `expected ${range}` : undefined;
		}
	}
}

const ruleBase = {
	id: definitionIdSchema,
	label: z.string().min(1),
	category: z.string().min(1),
	description: z.string().optional(),
	changeable: z.boolean()
};

export const ruleDefinitionSchema = z
	.discriminatedUnion('type', [
		z.object({
			...ruleBase,
			type: z.literal('boolean'),
			default: z.boolean(),
			easier: z.boolean().optional(),
			presets: z.record(z.string(), z.boolean()).optional()
		}),
		z.object({
			...ruleBase,
			type: z.literal('enum'),
			values: z.array(z.string().min(1)).min(1),
			default: z.string(),
			easier: z.array(z.string().min(1)).optional(),
			presets: z.record(z.string(), z.string()).optional()
		}),
		z.object({
			...ruleBase,
			type: z.literal('number'),
			min: z.number().refine(Number.isFinite, 'expected a finite number'),
			max: z.number().refine(Number.isFinite, 'expected a finite number'),
			integer: z.boolean().optional(),
			default: z.number(),
			easier: z.enum(['higher', 'lower']).optional(),
			presets: z.record(z.string(), z.number()).optional()
		})
	])
	.superRefine((rule, ctx) => {
		const def = rule as RuleDefinition;
		if (def.type === 'number' && def.min > def.max) {
			ctx.addIssue({ code: 'custom', path: ['max'], message: 'max must not be below min' });
		}
		if (def.type === 'enum' && def.easier) {
			const same =
				def.easier.length === def.values.length && def.values.every((v) => def.easier!.includes(v));
			if (!same)
				ctx.addIssue({
					code: 'custom',
					path: ['easier'],
					message: 'easier must list every value once, hardest first'
				});
		}
		const own = ruleValueProblem(def, def.default);
		if (own) ctx.addIssue({ code: 'custom', path: ['default'], message: own });
		for (const [preset, value] of Object.entries(def.presets ?? {})) {
			const why = ruleValueProblem(def, value);
			if (why) ctx.addIssue({ code: 'custom', path: ['presets', preset], message: why });
		}
	});

export const presetDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	description: z.string().optional(),
	values: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).optional()
});

interface Lookup<T> {
	get(id: string): T | undefined;
	list(): T[];
}

/** A rule's value for a world of `preset` with no value of its own (ADR 0111 point 3). */
export function presetValue(
	rule: RuleDefinition,
	preset: PresetDefinition | undefined,
	presetId: string
): RuleValue {
	const fromPreset = preset?.values?.[rule.id];
	if (fromPreset !== undefined && ruleValueProblem(rule, fromPreset) === undefined)
		return fromPreset;
	const fromRule = rule.presets?.[presetId];
	return fromRule ?? rule.default;
}

export interface ResolvedRules {
	/** Every registered rule's value, plus the unknown ids kept as they were. */
	values: Record<string, RuleValue>;
	/** Ids in the input that no loaded rule defines (kept, ADR 0111 point 3). */
	unknown: string[];
	/** `rule id: why` for values of registered rules that do not fit their type. */
	problems: string[];
}

/**
 * Complete a world's rule map against the registered rules: values it has are checked, missing
 * ones come from the preset. Keys keep the input's order, then the registry's for added ones.
 */
export function resolveRules(
	input: Readonly<Record<string, RuleValue>>,
	presetId: string,
	rules: Lookup<RuleDefinition>,
	presets: Lookup<PresetDefinition>
): ResolvedRules {
	const preset = presets.get(presetId);
	const values: Record<string, RuleValue> = {};
	const unknown: string[] = [];
	const problems: string[] = [];
	for (const [id, value] of Object.entries(input)) {
		values[id] = value;
		const rule = rules.get(id);
		if (!rule) unknown.push(id);
		else {
			const why = ruleValueProblem(rule, value);
			if (why) problems.push(`${id}: ${why}`);
		}
	}
	for (const rule of rules.list()) {
		if (!(rule.id in values)) values[rule.id] = presetValue(rule, preset, presetId);
	}
	return { values, unknown, problems };
}

/**
 * Whether changing `rule` from `from` to `to` during play is allowed (plan 230, ADR 0229): toward
 * easier or no change; undefined when it is, else the reason.
 */
export function ruleChangeProblem(
	rule: RuleDefinition,
	from: RuleValue,
	to: RuleValue
): string | undefined {
	if (from === to) return undefined;
	const easier = rule.easier;
	if (easier === undefined) return 'this rule is fixed once the world is made';
	const harder = 'a rule can only be made easier during play';
	switch (rule.type) {
		case 'boolean':
			return to === easier ? undefined : harder;
		case 'number':
			if (typeof from !== 'number' || typeof to !== 'number') return harder;
			return (easier === 'higher' ? to > from : to < from) ? undefined : harder;
		case 'enum': {
			const order = easier as readonly string[];
			return order.indexOf(String(to)) > order.indexOf(String(from)) ? undefined : harder;
		}
	}
}
