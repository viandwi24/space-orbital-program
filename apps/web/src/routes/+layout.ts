import { initModRuntime } from '../lib/mods/runtime';
import { prepareModelProviders } from '../lib/mods/asset-models';
import { openModStore } from '../lib/mods/store-idb';

// Static build (adapter-static). The game is a client-side app; pages are prerendered as shells
// and all simulation/rendering happens in the browser. See docs/decisions/0006-sveltekit-static-client.md
export const prerender = true;

/** Installed mods are loaded before any page renders, so the catalogue and the Worker see them (plan 046). */
export async function load(): Promise<void> {
	// During prerender there is no IndexedDB: `openModStore` then gives an empty memory store.
	await initModRuntime((await openModStore()).store);
	await prepareModelProviders();
}
