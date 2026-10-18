/**
 * What a world's one sim boots from (plan 204, ADR 0201 point 1): the newest save that loads, or
 * the world's start info (none: the Legacy world), plus JPL's DE440 for an n-body Sol world.
 */
import { loadEphemeris, needsEphemeris } from './ephemeris-asset';
import type { GameSave } from './save/game-save';
import { bootedMods, modHint } from './save/mods';
import { SaveController } from './save/save-controller.svelte';
import type { SimBoot } from './world-session';

export async function worldBoot(worldId: string): Promise<{ boot: SimBoot; base: GameSave | null }> {
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: () => {},
		world: () => worldId
	});
	await saves.refresh();
	let base: GameSave | null = null;
	for (const entry of saves.entries) {
		if (!entry.ok) continue;
		try {
			base = await saves.read(entry.meta.id);
			break;
		} catch {
			// a damaged or incompatible save: the next older one
		}
	}
	const world = base ? undefined : await saves.worldStartInfo(worldId);
	const info = base?.sim.worldInfo ?? world;
	const ephemeris = needsEphemeris(info) ? await loadEphemeris().catch(() => undefined) : undefined;
	return {
		boot: {
			...(base ? { resume: base.sim } : world ? { world } : {}),
			...(ephemeris ? { ephemeris } : {})
		},
		base
	};
}

/** Boot the session for `worldId` from its saves (what every in-world page asks for). */
export async function bootWorld(
	session: import('./world-session').WorldSession,
	worldId: string
): Promise<import('./sim-client').SimClient> {
	return session.acquire(worldId, async () => {
		const { boot, base } = await worldBoot(worldId);
		session.base = base;
		return boot;
	});
}
