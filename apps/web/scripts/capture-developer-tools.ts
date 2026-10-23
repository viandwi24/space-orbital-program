/**
 * Screenshots of the developer tools (plan 375): every tab, the Crew tab's lists, and the sandbox
 * Hangar in both looks. Against a running dev server or a served build:
 *
 *   SHOT_URL=http://localhost:5173 MOD=../../examples/mod-crew-sample/dist/crew-sample-1.0.0.orbital-mod.json \
 *     bun scripts/capture-developer-tools.ts
 *
 * `MOD` (optional) is a built package put into the browser's mod store first, as if installed and
 * trusted, so the shots show a mod's content and the loader log lists it. OUT defaults to
 * `screens-375/` in the working directory.
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? join(process.cwd(), 'screens-375');
mkdirSync(out, { recursive: true });

async function installMod(page: Page, file: string): Promise<void> {
	const pkg = JSON.parse(readFileSync(file, 'utf8'));
	const record = {
		id: pkg.manifest.id,
		manifest: pkg.manifest,
		code: pkg.code,
		...(pkg.assets ? { assets: pkg.assets } : {}),
		sha256: pkg.sha256,
		trusted: pkg.sha256,
		source: { kind: 'file', name: file.split('/').pop() },
		installedAt: Date.now(),
		enabled: true,
		order: 0
	};
	await page.evaluate(
		(rec) =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('orbital-mods', 1);
				r.onupgradeneeded = () => r.result.createObjectStore('mods', { keyPath: 'id' });
				r.onsuccess = () => {
					const tx = r.result.transaction('mods', 'readwrite');
					tx.objectStore('mods').put(rec);
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				};
				r.onerror = () => reject(r.error);
			}),
		record
	);
}

const shot = async (page: Page, name: string, wait = 1500): Promise<void> => {
	await page.waitForTimeout(wait);
	await page.screenshot({ path: join(out, `${name}.png`) });
	console.log(`wrote ${name}.png`);
};

const browser = await chromium.launch({
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(`${base}/developer`);
if (process.env.MOD) {
	await installMod(page, process.env.MOD);
	await page.reload();
}
await shot(page, '1-overview');
await page.goto(`${base}/developer/mods`);
await shot(page, '2-mods-loader-log');
await page.goto(`${base}/developer/parts?part=stock.tank-small`);
await page.waitForSelector('[data-ready="true"]', { timeout: 60_000 });
await shot(page, '3-parts', 3000);
await page.goto(`${base}/developer/crew`);
await shot(page, '4-crew-lineup', 8000);
await page.evaluate(() =>
	document.querySelector('[data-testid="crew-viewer"]')?.scrollTo(0, 99999)
);
await shot(page, '5-crew-lists');
await page.goto(`${base}/developer/blueprints`);
await page.waitForSelector('[data-testid="blueprint-summary"]', { timeout: 60_000 });
await shot(page, '6-blueprints');
await page.evaluate(() => localStorage.setItem('orbital.dev.hangar.look', 'zen'));
await page.goto(`${base}/developer/hangar?blueprint=kronos-selene`);
await shot(page, '7-hangar-sandbox-zen', 12000);
await page.click('[data-testid="sandbox-look"]');
await shot(page, '8-hangar-sandbox-normal', 4000);
await page.click('[data-testid="sandbox-look"]');
await browser.close();
