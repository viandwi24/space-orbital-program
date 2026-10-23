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
	/** The Hangar start blueprint on the pad (default Kronos V + Selene). */
	blueprint?: string;
	/** Where the vessel goes first and what it does there (debug API), or nothing for the pad. */
	place?: (page: Page) => Promise<void>;
	sun: Sun | null;
	rig?: Rig;
	/** The part the camera aims at (`focusPart`), else the root. */
	aim?: string;
	/** `place` ends on the moment to keep (a staging, doors opening): pause at once, no settling. */
	moment?: boolean;
}

const debug = (page: Page, method: string, arg: unknown) =>
	page.evaluate(([m, a]) => (window as any).__orbitalDebug[m as string](a), [method, arg] as const);

/** A command for the focused vessel (`vessel` filled in), as the flight sends it. */
const command = (page: Page, c: Record<string, unknown>) =>
	page.evaluate((c) => {
		const d = (window as any).__orbitalDebug;
		return d.send({ vessel: d.vessel().id, ...c });
	}, c);

/** A part module's action on the `occurrence`-th part with this definition, in any vessel. */
const action = (page: Page, definition: string, module: string, name: string, occurrence = 0) =>
	page.evaluate(
		([definition, module, name, occurrence]) => {
			const o = (window as any).__orbital;
			const hits = o
				.snapshot()
				.vessels.flatMap((v: any) =>
					v.parts.filter((p: any) => p.definition === definition).map((p: any) => ({ v, p }))
				);
			const hit = hits[occurrence as number];
			if (!hit) return { ok: false, reason: `no ${definition}` };
			return (window as any).__orbitalDebug.send({
				type: 'action',
				vessel: hit.v.id,
				part: hit.p.id,
				module,
				action: name
			});
		},
		[definition, module, name, occurrence] as const
	);

/** Whether the focused vessel has a part with this definition. */
const has = (page: Page, definition: string) =>
	page.evaluate(
		(d) =>
			(window as any).__orbitalDebug.vessel()?.parts.some((p: any) => p.definition === d) ?? false,
		definition
	);

/** Sim seconds pass (the debug calls wait for a snapshot; this lets the parts move apart). */
const run = (page: Page, ms: number) => page.waitForTimeout(ms);

/** Press the next-vessel key until the focused vessel has a `definition` part (within 2.5 km). */
async function focusVesselWith(page: Page, definition: string): Promise<void> {
	for (let i = 0; i < 8; i++) {
		if (await has(page, definition)) return;
		await page.getByTestId('world-canvas').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press(']');
		await page.waitForTimeout(1500);
	}
	throw new Error(`no vessel with ${definition} in reach`);
}

const SHOTS: Record<string, Shot> = {
	'pad-sunset': {
		page: '/flight',
		sun: { elevation: 4, azimuth: 100 },
		rig: { yaw: -0.5, pitch: 0.08, distance: 60 }
	},
	ascent: {
		page: '/flight',
		place: (p) =>
			debug(p, 'setLocation', {
				kind: 'air',
				latitude: 0.05,
				longitude: 0.3,
				altitude: 32_000,
				speed: 900,
				climb: 300
			}),
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
	// Kronos V at the first staging, 45 km up: the spent first stage falls away, the second lights
	// and the escape tower leaves
	staging: {
		page: '/flight',
		moment: true,
		place: async (p) => {
			await debug(p, 'setLocation', {
				kind: 'air',
				latitude: 0.05,
				longitude: 0.3,
				altitude: 45_000,
				speed: 1900,
				heading: Math.PI / 2,
				climb: 0.3
			});
			await command(p, { type: 'throttle', value: 1 });
			await command(p, { type: 'stage' });
			await run(p, 800);
			await command(p, { type: 'stage' });
			await run(p, 600);
		},
		sun: { elevation: 18, azimuth: 110 },
		rig: { yaw: 2.1, pitch: -0.05, distance: 70 }
	},
	// the petals round the Selene lander open in orbit (they are thrown off once open)
	'sla-petals': {
		page: '/flight',
		moment: true,
		place: async (p) => {
			await debug(p, 'setOrbit', { apoapsis: 120_000, periapsis: 120_000 });
			await command(p, { type: 'throttle', value: 0 });
			// the first and second stages gone (their 5 m tanks): the third stage, the petals, the ship
			for (let i = 0; i < 4 && (await has(p, 'stock.tank-5000-long')); i++) {
				await command(p, { type: 'stage' });
				await run(p, 500);
			}
			await debug(p, 'setOrbit', { apoapsis: 120_000, periapsis: 120_000, m0: 1 });
			await action(p, 'stock.payload-petals', 'stock.bay', 'open');
			await run(p, 1000);
		},
		sun: { elevation: 30, azimuth: 150 },
		rig: { yaw: 0.8, pitch: 0.15, distance: 28 },
		aim: 'stock.payload-petals'
	},
	// the Wayfarer orbiter with its tank and boosters gone and the bay doors open over Home
	'shuttle-bay': {
		page: '/flight',
		moment: true,
		blueprint: 'stock.wayfarer-shuttle',
		place: async (p) => {
			await debug(p, 'setOrbit', { apoapsis: 110_000, periapsis: 110_000 });
			await command(p, { type: 'throttle', value: 0 });
			for (let i = 0; i < 3; i++) {
				await command(p, { type: 'stage' });
				await run(p, 600);
			}
			// the orbiter alone, away from the spent tank and boosters
			await debug(p, 'setOrbit', { apoapsis: 110_000, periapsis: 110_000, m0: 1 });
			await action(p, 'stock.orbiter-bay', 'stock.bay', 'open');
			await run(p, 8000);
		},
		sun: { elevation: 35, azimuth: 130 },
		rig: { yaw: 3.05, pitch: 0.5, distance: 40 }
	},
	// the Selene lander down on Cinder, Home's moon
	'lunar-landing': {
		page: '/flight',
		place: async (p) => {
			await debug(p, 'setOrbit', { apoapsis: 120_000, periapsis: 120_000 });
			await command(p, { type: 'throttle', value: 0 });
			await action(p, 'stock.payload-petals', 'stock.bay', 'open');
			await run(p, 4500);
			// the lander's release decoupler, the first plain decoupler in the stack
			await action(p, 'stock.decoupler', 'stock.decoupler', 'decouple', 0);
			await run(p, 2500);
			await focusVesselWith(p, 'stock.lander-ascent');
			await debug(p, 'setLocation', {
				kind: 'surface',
				body: 'stock.cinder',
				latitude: 0.2,
				longitude: 0.4
			});
			await command(p, { type: 'action-group', group: 'stock.landing-gear', value: true });
			await run(p, 4000);
		},
		sun: { elevation: 12, azimuth: 100 },
		rig: { yaw: 4.2, pitch: 0.1, distance: 15 }
	},
	'space-center-day': { page: '/space-center', sun: { elevation: 16, azimuth: 120 } },
	'space-center-night': { page: '/space-center', sun: { elevation: -25, azimuth: 80 } }
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
/** A fresh world (its own storage): the Hangar offers the start blueprints only when it is empty. */
async function newContext() {
	const context = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		deviceScaleFactor: 1,
		baseURL: base
	});
	await context.addInitScript(() => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics', 'high');
		localStorage.setItem('orbital.graphics.auto', 'off');
	});
	return context;
}
let context = await newContext();

/** A Hangar start blueprint becomes the vessel on the pad. */
let onPad: string | null = null;
async function loadBlueprint(id: string): Promise<void> {
	if (onPad === id) return;
	if (onPad !== null) {
		await context.close();
		context = await newContext();
	}
	const setup = await context.newPage();
	await setup.addInitScript(() => localStorage.removeItem('orbital.vab.hideStart'));
	await setup.goto('/vab');
	await setup.getByTestId(`vab-start-${id}`).click({ timeout: 120_000 });
	await setup.waitForTimeout(2500);
	await setup.close();
	onPad = id;
}

async function open(path: string): Promise<Page> {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.goto(path);
	await page.waitForFunction(() => (window as any).__orbital?.renderer?.(), null, {
		timeout: 240_000
	});
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 240_000 });
	await page.waitForTimeout(3000);
	return page;
}

/** The canvas as WebP in `out`. */
async function save(page: Page, name: string): Promise<void> {
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
			for (let i = 0; i < bytes.length; i += 0x8000)
				s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			return btoa(s);
		},
		{ b64: png.toString('base64'), q: quality }
	);
	const file = join(out, `${name}.webp`);
	writeFileSync(file, Buffer.from(webp, 'base64'));
	console.log(`${name}: ${Math.round(Buffer.from(webp, 'base64').length / 1024)} KB`);
}

for (const name of names) {
	const shot = SHOTS[name];
	if (!shot) throw new Error(`unknown shot "${name}"`);
	if (shot.page === '/flight') await loadBlueprint(shot.blueprint ?? 'stock.kronos-selene');
	const page = await open(shot.page);
	if (shot.place) {
		await shot.place(page);
		if (!shot.moment) await page.waitForTimeout(2500);
	}
	await page.evaluate(
		async ({ sun, rig, aim }) => {
			const o = (window as any).__orbital;
			await o.send?.({ type: 'pause', on: true });
			const r = o.renderer();
			r.debug.setSun(sun);
			if (aim) r.debug.focusPart(aim);
			if (rig) r.debug.setCamera(rig);
		},
		{ sun: shot.sun, rig: shot.rig ?? null, aim: shot.aim ?? null }
	);
	// only the canvas: every page's interface hidden (F2 is Flight's only)
	await page.addStyleTag({
		content:
			'* { visibility: hidden !important; } [data-testid="world-canvas"] { visibility: visible !important; }'
	});
	// the bakes, the exposure and the clouds settle
	await page.waitForTimeout(7000);
	// SWEEP=n: n camera yaws round the vessel, to choose a view (`<name>-y<i>.webp`)
	const sweep = Number(process.env.SWEEP ?? 0);
	if (sweep > 0 && shot.rig) {
		for (let i = 0; i < sweep; i++) {
			const yaw = (i / sweep) * Math.PI * 2;
			await page.evaluate((rig) => (window as any).__orbital.renderer().debug.setCamera(rig), {
				...shot.rig,
				yaw
			});
			await page.waitForTimeout(1500);
			await save(page, `${name}-y${i}`);
		}
	} else await save(page, name);
	await page.close();
}
await browser.close();
