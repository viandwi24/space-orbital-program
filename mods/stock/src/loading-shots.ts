/**
 * Stock's loading-screen shots (plan 379, ADR 0349): the game's own pictures, made by
 * `apps/web/scripts/capture-loading-slides.ts` with the game's renderer. The images live in the
 * app's `static/loading/` folder under these paths (stock ships no asset package).
 */
import { defineLoadingShot } from '@orbital/sdk';

const SHOTS: ReadonlyArray<readonly [string, string, string]> = [
	['pad-sunset', 'pad-sunset.webp', 'Kronos V on the pad at sunset'],
	['staging', 'staging.webp', 'The first stage falls away, 45 km up'],
	['orbit-day', 'orbit-day.webp', 'In orbit, 100 km above Home'],
	['shuttle-bay', 'shuttle-bay.webp', 'Wayfarer in orbit, its bay doors open'],
	['space-center-night', 'space-center-night.webp', 'The Space Center at night'],
	['sla-petals', 'sla-petals.webp', 'The petals open round the Selene lander'],
	['ascent', 'ascent.webp', 'Climbing through the upper atmosphere'],
	['lunar-landing', 'lunar-landing.webp', 'Selene down on Cinder'],
	['orbit-night', 'orbit-night.webp', 'Dusk over the night side'],
	['space-center-day', 'space-center-day.webp', 'The Space Center']
];

/** In showing order. */
export const STOCK_LOADING_SHOTS = SHOTS.map(([name, image, caption], i) =>
	defineLoadingShot({ id: `stock.${name}`, caption, image, order: i })
);
