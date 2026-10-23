/**
 * Rows for the built-in mods on the Mods page (plan 320): every plugin the game ships with is a mod
 * like an installed one (ADR 0005), so the page lists them too, always on and not removable.
 */
import type { Plugin } from '@orbital/core';

export interface BuiltinModRow {
	id: string;
	title: string;
	version: string;
	api: string;
	description?: string;
}

/** Short descriptions for the plugins the game ships; a plugin without one shows none. */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
	stock: 'The stock parts, modules, resources, bodies, buildings and tech tree.',
	sol: 'The real solar system, for worlds that choose it.',
	autodock:
		'An autopilot that docks with the targeted docking port; a program you can take over or stop.',
	guidance:
		'MechJeb-style autopilots: execute the next maneuver node, circularize, ascent to orbit, land on a target with the predicted landing path, rendezvous with a target.'
};

export function builtinModRows(plugins: readonly Plugin[]): BuiltinModRow[] {
	return plugins.map(({ meta }) => ({
		id: meta.id,
		title: meta.title ?? meta.id,
		version: meta.version,
		api: meta.api,
		...(DESCRIPTIONS[meta.id] ? { description: DESCRIPTIONS[meta.id] } : {})
	}));
}
