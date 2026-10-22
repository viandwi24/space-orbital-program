/**
 * The world loading screen's pictures and tips (plan 370). The pictures are the game's own shots,
 * made by `scripts/capture-loading-slides.ts` with the game's renderer and stored as WebP in
 * `static/loading/`. No outside art. The tips name no keys: the key profiles differ (ADR 0206).
 */
import { asset } from '$app/paths';
import type { LoadingSlide } from './ui/WorldLoading.svelte';

/** File name in `static/loading/` and its caption, in showing order. */
export const SLIDE_FILES: readonly { file: string; caption: string }[] = [
	{ file: 'pad-sunset.webp', caption: 'Kronos V on the pad at sunset' },
	{ file: 'orbit-day.webp', caption: 'In orbit, 100 km above Home' },
	{ file: 'space-center-night.webp', caption: 'The Space Center at night' },
	{ file: 'ascent.webp', caption: 'Climbing through the upper atmosphere' },
	{ file: 'orbit-night.webp', caption: 'Dusk over the night side' },
	{ file: 'space-center-day.webp', caption: 'The Space Center' }
];

export const LOADING_SLIDES: readonly LoadingSlide[] = SLIDE_FILES.map((s) => ({
	// the files exist once the capture script ran; asset() types only literal paths
	src: asset(`/loading/${s.file}` as Parameters<typeof asset>[0]),
	caption: s.caption
}));

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
