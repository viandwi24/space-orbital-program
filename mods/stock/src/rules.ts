/**
 * Stock world rules and presets (plan 078, ADRs 0094, 0109, 0111). Values per preset come from
 * the foundation ADRs: economy 0098, science 0099, crew 0100 and 0109, comms 0101 and 0109, range
 * safety 0097, agencies 0096, reliability 0094. Every rule is inert until its system ships.
 */
import { definePreset, defineRule, type RuleDefinition } from '@orbital/sdk';

const SANDBOX = 'stock.sandbox';
const SCIENCE = 'stock.science';
const CAREER = 'stock.career';
const HARDCORE = 'stock.career-hardcore';

/** Same value in the three career-like presets, another in Sandbox. */
const byMode = <T>(sandbox: T, science: T, career: T, hardcore: T = career) => ({
	[SANDBOX]: sandbox,
	[SCIENCE]: science,
	[CAREER]: career,
	[HARDCORE]: hardcore
});

// Economy (ADR 0098): Sandbox and Science have no money.
export const RuleEconomy = defineRule({
	id: 'stock.economy',
	label: 'Economy',
	category: 'economy',
	description: 'Funds, costs, rewards and the ledger.',
	type: 'boolean',
	default: true,
	presets: byMode(false, false, true),
	changeable: true
});
/** The procedural contract offers (plan 099, ADR 0186 point 2); only where the economy runs. */
export const RuleContracts = defineRule({
	id: 'stock.contracts',
	label: 'Procedural contracts',
	category: 'economy',
	description:
		'Contract offers generated each day, with an advance, a reward, a penalty and a deadline.',
	type: 'boolean',
	default: true,
	changeable: true
});
export const RuleFundsMultiplier = defineRule({
	id: 'stock.funds-multiplier',
	label: 'Funds rewards',
	category: 'economy',
	type: 'number',
	min: 0.1,
	max: 10,
	default: 1,
	changeable: true
});
export const RuleCostMultiplier = defineRule({
	id: 'stock.cost-multiplier',
	label: 'Costs',
	category: 'economy',
	type: 'number',
	min: 0.1,
	max: 10,
	default: 1,
	changeable: true
});

// Science (ADR 0099).
export const RuleScienceDepth = defineRule({
	id: 'stock.science-depth',
	label: 'Science depth',
	category: 'science',
	description: 'Classic points, or discovery: hidden facts, instruments and peer review.',
	type: 'enum',
	values: ['classic', 'discovery'],
	default: 'classic',
	changeable: true
});
export const RuleScienceMultiplier = defineRule({
	id: 'stock.science-multiplier',
	label: 'Science rewards',
	category: 'science',
	type: 'number',
	min: 0.1,
	max: 10,
	default: 1,
	changeable: true
});
export const RuleTechTree = defineRule({
	id: 'stock.tech-tree',
	label: 'Tech tree',
	category: 'science',
	type: 'boolean',
	default: true,
	presets: byMode(false, true, true),
	changeable: true
});

// Crew (ADR 0100, Career standard and hardcore by ADR 0109).
export const RuleCrewExperience = defineRule({
	id: 'stock.crew-experience',
	label: 'Professions, traits and experience',
	category: 'crew',
	type: 'boolean',
	default: true,
	presets: byMode(false, false, true),
	changeable: true
});
export const RuleCrewSalaries = defineRule({
	id: 'stock.crew-salaries',
	label: 'Salaries and recruit costs',
	category: 'crew',
	type: 'boolean',
	default: true,
	presets: byMode(false, false, true),
	changeable: true
});
export const RuleLifeSupport = defineRule({
	id: 'stock.life-support',
	label: 'Life support',
	category: 'crew',
	type: 'enum',
	values: ['off', 'simple', 'full'],
	default: 'simple',
	presets: byMode('off', 'simple', 'simple', 'full'),
	changeable: true
});
export const RuleCrewMorale = defineRule({
	id: 'stock.crew-morale',
	label: 'Morale',
	category: 'crew',
	type: 'boolean',
	default: true,
	presets: byMode(false, false, true),
	changeable: true
});
export const RuleCrewRest = defineRule({
	id: 'stock.crew-rest',
	label: 'Rest and fatigue',
	category: 'crew',
	type: 'boolean',
	default: false,
	presets: byMode(false, false, false, true),
	changeable: true
});
export const RuleCrewExposure = defineRule({
	id: 'stock.crew-exposure',
	label: 'G-load and radiation',
	category: 'crew',
	type: 'boolean',
	default: true,
	presets: byMode(false, false, true),
	changeable: true
});
export const RuleCrewDeath = defineRule({
	id: 'stock.crew-death',
	label: 'Crew death',
	category: 'crew',
	description: 'Permanent, back after some days, or immortal crew.',
	type: 'enum',
	values: ['permanent', 'return', 'off'],
	default: 'permanent',
	presets: byMode('off', 'off', 'permanent'),
	changeable: true
});
export const RuleCrewReturnDays = defineRule({
	id: 'stock.crew-return-days',
	label: 'Days until a lost crew member returns',
	category: 'crew',
	type: 'number',
	min: 1,
	max: 365,
	integer: true,
	default: 14,
	changeable: true
});

// Communications (ADR 0101, control without signal by ADR 0109).
export const RuleComms = defineRule({
	id: 'stock.comms',
	label: 'Communications network',
	category: 'comms',
	type: 'boolean',
	default: true,
	changeable: true
});
export const RuleSignalDelay = defineRule({
	id: 'stock.signal-delay',
	label: 'Signal delay',
	category: 'comms',
	type: 'enum',
	values: ['display', 'enforced', 'flight-computer'],
	default: 'display',
	changeable: true
});
export const RuleControlWithoutSignal = defineRule({
	id: 'stock.control-without-signal',
	label: 'Probe control without signal',
	category: 'comms',
	type: 'enum',
	values: ['full', 'partial', 'none'],
	default: 'none',
	presets: byMode('full', 'none', 'none'),
	changeable: true
});
export const RuleCommsScale = defineRule({
	id: 'stock.comms-scale',
	label: 'Comms range scale',
	category: 'comms',
	type: 'number',
	min: 0.1,
	max: 10,
	default: 1,
	changeable: true
});

// Launch and reliability (ADRs 0097 and 0094).
export const RuleRangeSafety = defineRule({
	id: 'stock.range-safety',
	label: 'Range safety',
	category: 'launch',
	description: 'Unsafe launch azimuths and stage drop zones: a penalty, refused, or ignored.',
	type: 'enum',
	values: ['cost', 'hard', 'off'],
	default: 'cost',
	presets: byMode('off', 'off', 'cost'),
	changeable: true
});
export const RuleReliability = defineRule({
	id: 'stock.reliability',
	label: 'Part reliability',
	category: 'launch',
	type: 'boolean',
	default: false,
	changeable: true
});

// Agencies (ADR 0096): the player's type is an identity rule.
export const RuleAgencyType = defineRule({
	id: 'stock.agency-type',
	label: 'Agency type',
	category: 'agency',
	type: 'enum',
	values: ['government', 'company', 'hybrid'],
	default: 'government',
	changeable: false
});
export const RuleAgencyCount = defineRule({
	id: 'stock.agency-count',
	label: 'Rival agencies',
	category: 'agency',
	type: 'number',
	min: 0,
	max: 6,
	integer: true,
	default: 3,
	presets: byMode(0, 3, 3),
	changeable: true
});

export const RuleStartingFunds = defineRule({
	id: 'stock.starting-funds',
	label: 'Starting funds',
	category: 'economy',
	type: 'number',
	min: 0,
	max: 10_000_000,
	integer: true,
	default: 100_000,
	changeable: false
});

export const STOCK_RULES = [
	RuleEconomy,
	RuleContracts,
	RuleFundsMultiplier,
	RuleCostMultiplier,
	RuleStartingFunds,
	RuleScienceDepth,
	RuleScienceMultiplier,
	RuleTechTree,
	RuleCrewExperience,
	RuleCrewSalaries,
	RuleLifeSupport,
	RuleCrewMorale,
	RuleCrewRest,
	RuleCrewExposure,
	RuleCrewDeath,
	RuleCrewReturnDays,
	RuleComms,
	RuleSignalDelay,
	RuleControlWithoutSignal,
	RuleCommsScale,
	RuleRangeSafety,
	RuleReliability,
	RuleAgencyType,
	RuleAgencyCount
] as const;

export const PresetSandbox = definePreset({
	id: SANDBOX,
	label: 'Sandbox',
	description: 'Every part, no money, no science to earn, crew who cannot die.'
});
export const PresetScience = definePreset({
	id: SCIENCE,
	label: 'Science',
	description: 'Earn science and unlock the tech tree, without money.'
});
export const PresetCareer = definePreset({
	id: CAREER,
	label: 'Career',
	description: 'Funds, contracts, science and crew who need looking after.'
});
export const PresetCareerHardcore = definePreset({
	id: HARDCORE,
	label: 'Career (hardcore)',
	description: 'Career with every crew aspect at full simulation.'
});

/** Career with part reliability on (plan 130, ADR 0156 point 8): every other rule as in Career. */
export const PresetCareerEngineering = definePreset({
	id: 'stock.career-engineering',
	label: 'Career (engineering)',
	description: 'Career where parts can fail: test them, fix what fails, fly engineers.',
	values: {
		...Object.fromEntries(
			(STOCK_RULES as readonly RuleDefinition[]).map((r) => [
				r.id,
				r.presets?.[CAREER] ?? r.default
			])
		),
		[RuleReliability.id]: true
	} as Record<string, boolean | number | string>
});

export const STOCK_PRESETS = [
	PresetSandbox,
	PresetScience,
	PresetCareer,
	PresetCareerHardcore,
	PresetCareerEngineering
] as const;
