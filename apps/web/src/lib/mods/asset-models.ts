/**
 * Models that mods ship (plan 051, ADR 0076). The root layout calls `prepareModelProviders` after the
 * mod runtime is up; it parses the checked `.glb` bytes of every mod part that names an asset into one
 * glTF provider, which the flight scene and the VAB then take from `modelProviders()` like any
 * other `partProviders`. The renderer (and three's loader) is imported only when some mod ships a
 * model, so a game without such mods pays nothing. A model that fails to load, or does not match
 * its part, is reported on the console and the part is drawn by its fallback generator.
 */
import type { PartModelProvider } from '@orbital/renderer';
import { activePartAssets } from './runtime';

let providers: PartModelProvider[] = [];

export async function prepareModelProviders(
	assets: ReadonlyMap<string, Uint8Array> = activePartAssets(),
	log: (message: string) => void = (m) => console.warn(m)
): Promise<void> {
	providers = [];
	if (assets.size === 0) return;
	try {
		const { GltfPartProvider } = await import('@orbital/renderer');
		const provider = new GltfPartProvider({
			assets,
			onWarning: (part, message) => log(`Mod model for "${part}": ${message}`)
		});
		await provider.preload([...assets.keys()]);
		for (const [part, reason] of provider.failures) {
			log(`Mod model for "${part}" could not be loaded (${reason}); the part is drawn with its fallback look.`);
		}
		providers = [provider];
	} catch (e) {
		log(`Mod models could not be prepared: ${e instanceof Error ? e.message : String(e)}`);
	}
}

/** The providers for `partProviders` (empty without mod models). */
export const modelProviders = (): readonly PartModelProvider[] => providers;
