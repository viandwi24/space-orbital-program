/**
 * What the launch site's root holds at the pad (plan 418, step 5): every object under `launch-site`,
 * with its type, material, triangles (times instances), whether it is visible and whether it casts a
 * shadow, largest first. Used to find what the site costs that no look switch covers. Headed or not,
 * against a `NODE_ENV=development` build:
 *
 *   SHOT_URL=http://localhost:5294 bun scripts/inspect-site.ts
 */
import { chromium } from './lib/chromium';

const base = process.env.SHOT_URL ?? 'http://localhost:5294';
const browser = await chromium.launch({
	headless: false,
	args: [
		`--use-angle=${process.platform === 'darwin' ? 'metal' : 'vulkan'}`,
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu'
	]
});
try {
	const context = await browser.newContext({
		viewport: { width: 1512, height: 945 },
		deviceScaleFactor: 2,
		baseURL: base
	});
	await context.addInitScript(() => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', 'webgpu');
		localStorage.setItem('orbital.graphics', 'high');
		localStorage.setItem('orbital.graphics.auto', 'off');
	});
	const setup = await context.newPage();
	await setup.goto('/vab');
	await setup.waitForFunction(
		() => typeof (window as any).__orbitalVab?.loadBooster === 'function'
	);
	await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
	await setup.waitForTimeout(1500);
	await setup.close();
	const page = await context.newPage();
	await page.goto('/flight');
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
	await page.waitForTimeout(8000);
	const rows = await page.evaluate(() => {
		const scene = (window as any).__orbital.renderer().debug.scene;
		let site: any = null;
		scene.traverse((o: any) => {
			if (o.name === 'launch-site') site = o;
		});
		if (!site) return null;
		const out: Array<Record<string, unknown>> = [];
		site.traverse((o: any) => {
			if (!o.isMesh && !o.isInstancedMesh && !o.isBundleGroup && !o.isGroup) return;
			if (!o.isMesh) {
				out.push({ name: o.name || o.type, type: o.type, children: o.children.length });
				return;
			}
			const g = o.geometry;
			const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
			const n = o.isInstancedMesh ? o.count : 1;
			let visible = true;
			for (let p = o; p; p = p.parent) if (!p.visible) visible = false;
			out.push({
				name: o.name || '(unnamed)',
				type: o.type,
				material: o.material?.name || o.material?.type,
				tris: tri * n,
				instances: n,
				visible,
				cast: o.castShadow,
				receive: o.receiveShadow,
				transparent: o.material?.transparent === true,
				renderOrder: o.renderOrder,
				parent: o.parent?.name || o.parent?.type
			});
		});
		return out;
	});
	if (!rows) console.log('no launch-site object in the scene');
	else {
		const meshes = rows.filter((r) => 'tris' in r) as Array<Record<string, any>>;
		meshes.sort((a, b) => b.tris - a.tris);
		console.log(
			`${meshes.length} meshes, ${meshes.filter((m) => m.visible).length} visible, ${meshes.reduce((s, m) => s + (m.visible ? m.tris : 0), 0)} triangles visible`
		);
		for (const m of meshes.slice(0, 40))
			console.log(
				`${String(m.tris).padStart(8)} tris x${String(m.instances).padStart(6)} ${m.visible ? 'vis' : 'hid'} ${m.cast ? 'cast' : '    '} ${m.transparent ? 'transp' : '      '} ${String(m.name).padEnd(28)} ${m.type} ${m.material} <- ${m.parent}`
			);
		console.log('\ngroups:');
		for (const r of rows.filter((r) => !('tris' in r)))
			console.log(`  ${r.name} (${r.type}, ${r.children} children)`);
	}
} finally {
	await browser.close();
}
