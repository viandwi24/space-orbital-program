/**
 * The world loading screen's pictures (plan 370): the game's own renderer, 1920 × 1080, the
 * interface hidden, saved as WebP into `static/loading/` (the names of `src/lib/loading-slides.ts`).
 * Encoded by the browser's own canvas (`toBlob('image/webp')`), so no image tool is needed. Against a
 * `NODE_ENV=development` build (the `__orbital` and `__orbitalDebug` hooks) served by `scripts/serve.ts`:
 *
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5212 &
 *   SHOT_URL=http://localhost:5212 bun scripts/capture-loading-slides.ts [name ...]
 *
 * Options (environment): QUALITY (WebP, default 0.8), OUT (default static/loading).
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5212';
const out = process.env.OUT ?? join(import.meta.dir, '../static/loading');
const quality = Number(process.env.QUALITY ?? 0.8);
mkdirSync(out, { recursive: true });

type Sun = { elevation: number; azimuth: number };
type Rig = { yaw: number; pitch: number; distance: number };
interface Shot {
	page: '/flight' | '/space-center';
	/** Where the vessel goes first (debug API), or nothing for the pad. */
	place?: (page: Page) => Promise<void>;
	sun: Sun | null;
	rig?: Rig;
}

const debug = (page: Page, method: string, arg: unknown) =>
	page.evaluate(([m, a]) => (window as any).__orbitalDebug[m as string](a), [method, arg] as const);

const SHOTS: Record<string, Shot> = {
	'pad-sunset': {
		page: '/flight',
		sun: { elevation: 4, azimuth: 100 },
		rig: { yaw: -0.5, pitch: 0.08, distance: 60 }
	},
	ascent: {
		page: '/flight',
		place: (p) =>
			debug(p, 'setLocation', { kind: 'air', latitude: 0.05, longitude: 0.3, altitude: 32_000, speed: 900, climb: 300 }),
		sun: { elevation: 25, azimuth: 120 },
		rig: { yaw: 0.6, pitch: -0.25, distance: 70 }
	},
	'orbit-day': {
		page: '/flight',
		place: (p) => debug(p, 'setOrbit', { apoapsis: 100_000, periapsis: 100_000 }),
		sun: { elevation: 40, azimuth: 140 },
		rig: { yaw: 0.9, pitch: 0.32, distance: 55 }
	},
	'orbit-night': {
		page: '/flight',
		place: (p) => debug(p, 'setOrbit', { apoapsis: 100_000, periapsis: 100_000 }),
		sun: { elevation: -6, azimuth: 80 },
		rig: { yaw: 2.2, pitch: 0.38, distance: 55 }
	},
	'space-center-day': { page: '/space-center', sun: { elevation: 16, azimuth: 120 } },
	'space-center-night': { page: '/space-center', sun: { elevation: -25, azimuth: 80 } }
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, baseURL: base });
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
	localStorage.setItem('orbital.graphics', 'high');
	localStorage.setItem('orbital.graphics.auto', 'off');
});

// Kronos V + Selene, the vessel on the pad
{
	const setup = await context.newPage();
	await setup.addInitScript(() => localStorage.removeItem('orbital.vab.hideStart'));
	await setup.goto('/vab');
	await setup.getByTestId('vab-start-kronos-selene').click({ timeout: 120_000 });
	await setup.waitForTimeout(2500);
	await setup.close();
}

async function open(path: string): Promise<Page> {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.goto(path);
	await page.waitForFunction(() => (window as any).__orbital?.renderer?.(), null, { timeout: 240_000 });
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 240_000 });
	await page.waitForTimeout(3000);
	return page;
}

for (const name of names) {
	const shot = SHOTS[name];
	if (!shot) throw new Error(`unknown shot "${name}"`);
	const page = await open(shot.page);
	if (shot.place) {
		await shot.place(page);
		await page.waitForTimeout(2500);
	}
	await page.evaluate(
		async ({ sun, rig }) => {
			const o = (window as any).__orbital;
			await o.send?.({ type: 'pause', on: true });
			const r = o.renderer();
			r.debug.setSun(sun);
			if (rig) r.debug.setCamera(rig);
		},
		{ sun: shot.sun, rig: shot.rig ?? null }
	);
	// only the canvas: every page's interface hidden (F2 is Flight's only)
	await page.addStyleTag({
		content:
			'* { visibility: hidden !important; } [data-testid="world-canvas"] { visibility: visible !important; }'
	});
	// the bakes, the exposure and the clouds settle
	await page.waitForTimeout(7000);
	const png = await page.getByTestId('world-canvas').screenshot({ type: 'png' });
	const webp = await page.evaluate(
		async ({ b64, q }) => {
			const img = new Image();
			img.src = `data:image/png;base64,${b64}`;
			await img.decode();
			const c = document.createElement('canvas');
			c.width = 1920;
			c.height = 1080;
			c.getContext('2d')!.drawImage(img, 0, 0, 1920, 1080);
			const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/webp', q));
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let s = '';
			for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			return btoa(s);
		},
		{ b64: png.toString('base64'), q: quality }
	);
	const file = join(out, `${name}.webp`);
	writeFileSync(file, Buffer.from(webp, 'base64'));
	console.log(`${name}: ${Math.round(Buffer.from(webp, 'base64').length / 1024)} KB`);
	await page.close();
}
await browser.close();
