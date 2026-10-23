/**
 * The welcome on a world's first Space Center visit (player-journey audit Q8, ADR 0328): what the
 * chosen mode means, and what to do first in it. Pure: the world's preset and rules in, words out.
 */
import {
	resolveRules,
	type PresetDefinition,
	type RuleDefinition,
	type WorldInfo
} from '@orbital/core';

interface Lookup<T> {
	get(id: string): T | undefined;
	list(): T[];
}

export interface ModeWelcome {
	/** The preset's name: "Career", "Sandbox", … */
	mode: string;
	/** The preset's own description. */
	summary: string;
	/** Where the money and the parts come from in this world. */
	first: string;
}

export function modeWelcome(
	world: Pick<WorldInfo, 'preset' | 'rules'>,
	registries: { rules: Lookup<RuleDefinition>; presets: Lookup<PresetDefinition> }
): ModeWelcome {
	const { values } = resolveRules(world.rules, world.preset, registries.rules, registries.presets);
	const preset = registries.presets.get(world.preset);
	const economy = values['stock.economy'] === true;
	const tech = values['stock.tech-tree'] === true;
	const parts = tech
		? ' Experiments earn science, and R&D turns it into new parts: you start with the basics.'
		: ' Every part is open.';
	let first: string;
	if (economy && values['stock.agency-type'] === 'company') {
		first = `A company has no monthly budget: its standing service contracts, the contracts you take in the Mission Center and a loan in Administration pay for its launches.${parts}`;
	} else if (economy) {
		first = `Your agency gets a budget each month, and contracts in the Mission Center pay for more launches.${parts}`;
	} else if (tech) {
		first = `Nothing costs money here.${parts}`;
	} else {
		first = 'Every part and building is open and nothing costs money: build what you like and fly it.';
	}
	return {
		mode: preset?.label ?? world.preset,
		summary: preset?.description ?? '',
		first
	};
}
