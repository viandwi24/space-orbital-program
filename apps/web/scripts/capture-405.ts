/**
 * Screens of plan 406 (journal 406): the sample planet mod (`examples/mod-visual-sample`) installed
 * in the page's mod store, the vessel put on its highland, seen from the ground and from far above.
 * Playwright's Chromium on the Mac's GPU, against a running dev server:
 *
 *   SHOT_URL=http://localhost:5173 [SHOT_BACKEND=webgl] bun scripts/capture-405.ts [prefix]
 *
 * Output: `docs/journal/assets/<prefix>-*.jpg` (prefix `405` by default).
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { modPackageFingerprint } from '@orbital/core';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.argv[2] ?? '405';
const backend = process.env.SHOT_BACKEND ?? 'webgpu';

const built = await buildMod(join(import.meta.dir, '../../../examples/mod-visual-sample'));
const pkg = JSON.parse(built.text);
const sha256 = await modPackageFingerprint(pkg.code, pkg.assets);
const record = {
	id: pkg.manifest.id,
	manifest: pkg.manifest,
	code: pkg.code,
	assets: pkg.assets,
	sha256,
	trusted: sha256,
	source: { kind: 'file', name: 'mod-visual-sample.json' },
	installedAt: Date.now(),
	enabled: !process.env.SHOT_NOMOD,
	order: 0
};

const browser = await chromium.launch({
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL: base });
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
});
// the mod goes into the page's IndexedDB store, where the runtime reads it
const seed = await context.newPage();
await seed.goto('/vab');
await seed.evaluate(
	(rec) =>
		new Promise<void>((resolve, reject) => {
			const open = indexedDB.open('orbital-mods', 1);
			open.onupgradeneeded = () => open.result.createObjectStore('mods', { keyPath: 'id' });
			open.onerror = () => reject(open.error);
			open.onsuccess = () => {
				const tx = open.result.transaction('mods', 'readwrite');
				tx.objectStore('mods').put(rec);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			};
		}),
	record
);
await seed.reload();
await seed.waitForFunction(() => typeof (window as any).__orbitalVab?.loadBooster === 'function');
await seed.evaluate(() => (window as any).__orbitalVab.loadBooster());
await seed.waitForTimeout(1500);
await seed.close();

const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
page.on('console', (m) => {
	if (m.type() === 'error') console.log('  console error:', m.text().split('\n')[0]);
});
await page.addInitScript(
	([b]) => {
		localStorage.setItem('orbital.graphics.renderer', b!);
		localStorage.setItem('orbital.graphics', 'high');
		localStorage.setItem('orbital.graphics.auto', 'off');
	},
	[backend]
);
await page.goto('/flight');
await page.waitForFunction(
	() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
	null,
	{
		timeout: 300_000
	}
);
await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
await page.waitForTimeout(3000);
const where = (altitude: number) =>
	page.evaluate(
		(alt) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				body: 'stock.home',
				latitude: 0.05,
				longitude: -0.4,
				altitude: alt,
				speed: 0,
				climb: 0
			}),
		altitude
	);
await where(3000);
await page.waitForTimeout(9000);
await page.screenshot({ path: join(out, `${prefix}-3km.jpg`), type: 'jpeg', quality: 82 });
await where(60_000);
await page.waitForTimeout(8000);
await page.screenshot({ path: join(out, `${prefix}-60km.jpg`), type: 'jpeg', quality: 82 });
await where(900_000);
await page.waitForTimeout(8000);
await page.screenshot({ path: join(out, `${prefix}-orbit.jpg`), type: 'jpeg', quality: 82 });
await browser.close();
