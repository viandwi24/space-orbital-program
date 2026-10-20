import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const seed = await browser.newContext();
const sp = await seed.newPage();
await sp.goto('http://localhost:5263/vab');
await sp.getByRole('button', { name: 'Load the two-stage example' }).click();
await sp.waitForTimeout(1500);
const ctx = await browser.newContext({ storageState: await seed.storageState(), viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 300)); });
await page.addInitScript(() => { localStorage.setItem('orbital.graphics', 'high'); localStorage.setItem('orbital.graphics.auto', 'off'); });
await page.goto('http://localhost:5263/flight?renderer=webgpu');
await page.waitForFunction(() => (window as any).__TMP_GPU, null, { timeout: 180_000 });
await page.waitForTimeout(6000);
const read = async (gradient: string) => {
	await page.evaluate((g) => (window as any).__orbital.renderer().debug.bakeMode(true, g), gradient);
	await page.waitForTimeout(3000);
	const ms = await page.evaluate(async () => (await (window as any).__orbital.renderer().debug.benchmarkAsync(10)));
	const data = await page.evaluate(async () => {
		const g = (window as any).__TMP_GPU; const t = g.planet.terrain; const rt = t.patchTargets.mid;
		const px = await g.r.readRenderTargetPixelsAsync(rt, 0, 0, rt.width, rt.height);
		return Array.from(px as Float32Array).filter((_, i) => i % (4 * 97) < 4);
	});
	return { ms, data };
};
const fd = await read('fd');
const an = await read('analytic');
await page.evaluate(() => (window as any).__orbital.renderer().debug.bakeMode(false, 'analytic'));
let maxH = 0, maxG = 0, sumG = 0, n = 0, gMag = 0;
for (let i = 0; i < fd.data.length; i += 4) {
	maxH = Math.max(maxH, Math.abs(fd.data[i]! - an.data[i]!));
	const dg = Math.hypot(fd.data[i + 1]! - an.data[i + 1]!, fd.data[i + 2]! - an.data[i + 2]!);
	maxG = Math.max(maxG, dg); sumG += dg; n++; gMag += Math.hypot(an.data[i + 1]!, an.data[i + 2]!);
}
console.log(JSON.stringify({ samples: n, maxHeightDiff: maxH, maxGradDiff: maxG, meanGradDiff: sumG / n, meanGrad: gMag / n, frameWithRebake: { fd: fd.ms, analytic: an.ms } }));
await browser.close();
