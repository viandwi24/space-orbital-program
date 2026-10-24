/**
 * The world loading screen's pictures and tips (plan 370). The pictures are the game's own shots,
 * made by `scripts/capture-loading-slides.ts` with the game's renderer and stored as WebP in
 * `static/loading/`. No outside art. The tips name no keys: the key profiles differ (ADR 0206).
 */
import { asset } from '$app/paths';
import { loadPlugins } from '@orbital/core';
import { BUILTIN_PLUGINS } from './builtins';
import { modRuntime } from './mods/runtime';
import type { LoadingSlide } from './ui/WorldLoading.svelte';

/** What the registry gives the screen: shots in order, from `ctx.loadingShots` (plan 379, ADR 0349). */
export interface ShotSource {
	id: string;
	caption: string;
	image: string;
	order?: number | undefined;
	/** The plugin that registered it. */
	owner: string | undefined;
}

/**
 * The slides of `shots`: lower `order` first, then registration order. A shot of a game plugin is
 * a file of `static/loading/`; a mod's is a picture of its package (`assetOf` gives its bytes), shown
 * through an object URL (`blobUrl`). A shot whose picture is missing is left out, never an error.
 */
export function slidesOf(
	shots: readonly ShotSource[],
	options: {
		builtin: ReadonlySet<string>;
		staticUrl(file: string): string;
		assetOf(owner: string, path: string): Uint8Array | undefined;
		blobUrl(bytes: Uint8Array, path: string): string;
	}
): LoadingSlide[] {
	return shots
		.map((s, i) => ({ s, i }))
		.sort((a, b) => (a.s.order ?? 0) - (b.s.order ?? 0) || a.i - b.i)
		.flatMap(({ s }): LoadingSlide[] => {
			if (s.owner && options.builtin.has(s.owner))
				return [{ src: options.staticUrl(s.image), caption: s.caption }];
			const bytes = s.owner ? options.assetOf(s.owner, s.image) : undefined;
			return bytes ? [{ src: options.blobUrl(bytes, s.image), caption: s.caption }] : [];
		});
}

const blobs = new Map<string, string>();

/** The slides of the booted plugins (plan 379): the game's shots first, then the mods'. */
export function loadingSlides(): LoadingSlide[] {
	const registries = modRuntime().registries ?? loadPlugins([...BUILTIN_PLUGINS]).registries;
	const shots = registries.loadingShots.entries().map((e): ShotSource => ({
		id: e.def.id,
		caption: e.def.caption,
		image: e.def.image,
		order: e.def.order,
		owner: e.by
	}));
	return slidesOf(shots, {
		builtin: new Set(BUILTIN_PLUGINS.map((p) => p.meta.id)),
		// the files exist once the capture script ran; asset() types only literal paths
		staticUrl: (file) => asset(`/loading/${file}` as Parameters<typeof asset>[0]),
		assetOf: (owner, path) => modRuntime().assets.get(owner)?.get(path),
		blobUrl: (bytes, path) => {
			const key = `${path}:${bytes.length}`;
			let url = blobs.get(key);
			if (!url) {
				url = URL.createObjectURL(
					new Blob([bytes as BlobPart], {
						type: path.endsWith('.png') ? 'image/png' : 'image/webp'
					})
				);
				blobs.set(key, url);
			}
			return url;
		}
	});
}

export const LOADING_TIPS: readonly string[] = [
	'Turn gradually once you are a few hundred metres per second fast: a gravity turn saves a lot of fuel.',
	'Your orbit is circular when the apoapsis and periapsis are the same height. Burn at one to raise the other.',
	'Heat shields burn away as they work: a steep re-entry heats faster, a shallow one heats longer.',
	'The staging list runs from the bottom up: check it in the Hangar before you launch.',
	'Settings → Graphics lowers the quality when the frame rate drops. Automatic finds the level your machine holds.',
	'The Guidance Computer can fly the ascent and a rendezvous for you while you watch.',
	'Debug → Info shows how long this load took and what the graphics compiled.',
	'Prograde points along your path. Burn there to go higher on the other side of the planet.'
];
