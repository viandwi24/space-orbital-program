import { initModRuntime } from '../lib/mods/runtime';
import { prepareModelProviders } from '../lib/mods/asset-models';
import {
	installPageBodyImages,
	installPageCrewContent,
	installPageTerrainMaps
} from '../lib/mods/crew-content';
import { openModStore } from '../lib/mods/store-idb';

// Static build (adapter-static). The game is a client-side app; pages are prerendered as shells
// and all simulation/rendering happens in the browser. See docs/decisions/0006-sveltekit-static-client.md
export const prerender = true;

/** Installed mods are loaded before any page renders, so the catalogue and the Worker see them (plan 046). */
export async function load(): Promise<void> {
	// During prerender there is no IndexedDB: `openModStore` then gives an empty memory store.
	await initModRuntime((await openModStore()).store);
	// the crew's looks and moves come from the plugins too (plan 375, ADR 0313)
	installPageCrewContent();
	// a mod planet's continents are an image: read it before the renderer or the catalogue asks for a ground (plan 406)
	await installPageTerrainMaps();
	await installPageBodyImages();
	await prepareModelProviders();
}
