/**
 * The crew content of this page load (plan 375, ADR 0313 point 3): what the booted plugins
 * registered for crew looks and moves, handed to the renderer once, with the mods' portrait images.
 * A portrait whose image is missing goes into the loader log.
 */
import { loadPlugins, type Plugin, type Registries } from '@orbital/core';
import { crewContentOf, setCrewContent, type CrewContent } from '@orbital/renderer/crew';
import { BUILTIN_PLUGINS } from '../builtins';
import { noteAssetProblem } from './boot-log';
import { modRuntime } from './runtime';

export function installCrewContent(
	registries: Pick<
		Registries,
		'crewOutfits' | 'crewLooks' | 'crewExpressions' | 'crewAnimations' | 'crewPortraits'
	>,
	assets: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>,
	log = true
): CrewContent {
	const content = crewContentOf(registries, (mod, path) => assets.get(mod)?.get(path));
	if (log)
		for (const m of content.missing)
			noteAssetProblem({
				mod: m.by,
				what: `portrait "${m.id}"`,
				message: `its image "${m.image}" is missing`
			});
	setCrewContent(content);
	return content;
}

/** After the mod runtime: the booted set's crew content (the built-ins alone if it did not boot). */
export function installPageCrewContent(builtin: readonly Plugin[] = BUILTIN_PLUGINS): void {
	const rt = modRuntime();
	let registries = rt.registries;
	if (!registries) {
		try {
			registries = loadPlugins(builtin).registries;
		} catch {
			return;
		}
	}
	installCrewContent(registries, rt.assets);
}
