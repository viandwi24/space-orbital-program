/**
 * Which material of the launch site costs the pad its 3 to 4 ms (plan 418, step 5)? The look switches
 * hide the site's parts, but all of them together took only 0.5 ms of the 4 ms the whole site takes
 * (journal 418). This lists the materials of the meshes under `launch-site` (with their triangles and
 * how many meshes use each) and measures the pad's mean frame interval with each material hidden
 * (`material.visible = false`: the renderer skips what draws with it, and no per-frame code turns it
 * back on), against the same page with nothing hidden, alternating. The static bundle is re-recorded
 * after each change. Headed, against a `NODE_ENV=development` build, under `/tmp/orbital-measuring`:
 *
 *   SHOT_URL=http://localhost:5294 bun scripts/bisect-site.ts
 *
 * Environment: SECONDS (8), WARM (3), ROUNDS (2), PRESET (high), SETTLE (seconds to wait for the warming, 40).
 */
import { chromium, type Page } from './lib/chromium';

const base = process.env.SHOT_URL ?? 'http://localhost:5294';
const seconds = Number(process.env.SECONDS ?? 8);
const warm = Number(process.env.WARM ?? 3);
const rounds = Number(process.env.ROUNDS ?? 2);
const preset = process.env.PRESET ?? 'high';
const settle = Number(process.env.SETTLE ?? 40);

const browser = await chromium.launch({
	headless: false,
	args: [
		`--use-angle=${process.platform === 'darwin' ? 'metal' : 'vulkan'}`,
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu'
	]
});

async function waitWorld(page: Page): Promise<void> {
	await page
		.getByTestId('world-loading')
		.waitFor({ state: 'detached', timeout: 300_000 })
		.catch(() => undefined);
	await page
		.waitForFunction(
			() => {
				const r = (
					window as unknown as {
						__orbitalLoadReport?: () => {
							data: { compile: { pending: number; phases: { phase: string }[] } };
						} | null;
					}
				).__orbitalLoadReport?.();
				return (
					!!r &&
					r.data.compile.pending === 0 &&
					r.data.compile.phases.some((p) => p.phase === 'play')
				);
			},
			null,
			{ timeout: settle * 1000 }
		)
		.catch(() => console.log('(the warming did not settle: measuring anyway)'));
	await page.waitForTimeout(3000);
}

function sample(page: Page): Promise<number> {
	return page.evaluate(async (secs) => {
		const out: number[] = [];
		await new Promise<void>((resolve) => {
			let last = performance.now();
			const t0 = last;
			const tick = (now: number): void => {
				out.push(now - last);
				last = now;
				if (now - t0 < secs * 1000) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
		const xs = out.slice(1);
		return xs.reduce((a, b) => a + b, 0) / xs.length;
	}, seconds);
}

try {
	const context = await browser.newContext({
		viewport: { width: 1512, height: 945 },
		deviceScaleFactor: 2,
		baseURL: base
	});
	await context.addInitScript((p) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', 'webgpu');
		localStorage.setItem('orbital.graphics', p);
		localStorage.setItem('orbital.graphics.auto', 'off');
	}, preset);
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
	await waitWorld(page);
	await page.reload();
	await waitWorld(page);
	// the materials of the site's visible meshes
	const materials = await page.evaluate(() => {
		const scene = (window as any).__orbital.renderer().debug.scene;
		let site: any = null;
		scene.traverse((o: any) => {
			if (o.name === 'launch-site') site = o;
		});
		const w = window as any;
		w.__siteMaterials = new Map<string, { material: any; meshes: number; tris: number }>();
		w.__siteBundle = null;
		w.__site = site;
		site.traverse((o: any) => {
			if (o.isBundleGroup) w.__siteBundle = o;
			if (!o.isMesh) return;
			const m = o.material;
			if (!m || Array.isArray(m)) return;
			const g = o.geometry;
			const tri =
				((g.index ? g.index.count : g.attributes.position.count) / 3) *
				(o.isInstancedMesh ? o.count : 1);
			const key = `${m.type} ${m.name || m.uuid.slice(0, 6)}${o.isSkinnedMesh ? ' (skinned)' : ''}`;
			const e = w.__siteMaterials.get(key) ?? { material: m, meshes: 0, tris: 0 };
			e.meshes++;
			e.tris += tri;
			w.__siteMaterials.set(key, e);
		});
		return [...w.__siteMaterials.entries()].map(([k, v]: any) => ({
			key: k,
			meshes: v.meshes,
			tris: v.tris
		}));
	});
	const hide = (key: string | null): Promise<void> =>
		page.evaluate((key) => {
			const w = window as any;
			for (const [k, v] of w.__siteMaterials) v.material.visible = key === null || k !== key;
			if (w.__siteBundle) w.__siteBundle.needsUpdate = true;
		}, key);
	if (process.env.MODE === 'children') {
		// MODE=children: a bisection over the root's direct children (the whole subtree of each is hidden):
		// hide the first half, then the second, and go on into the half that gives the most
		// ROOT: a dot path of child indices below launch-site ('' is the site itself, '0' is site-buildings)
		const root = process.env.ROOT ?? '';
		const info = await page.evaluate((root) => {
			const w = window as any;
			w.__rp = root;
			w.__node = () =>
				w.__rp
					.split('.')
					.filter(Boolean)
					.reduce((n: any, i: string) => n.children[Number(i)], w.__site);
			return w
				.__node()
				.children.map((c: any) => `${c.name || c.type}${c.isLight ? ' (LIGHT)' : ''}`);
		}, root);
		console.log(`${info.length} children of launch-site[${root}]`);
		const hideRange = (from: number, to: number): Promise<void> =>
			page.evaluate(
				([from, to]) => {
					const w = window as any;
					w.__node().children.forEach((c: any, i: number) => (c.visible = !(i >= from && i < to)));
					if (w.__siteBundle) w.__siteBundle.needsUpdate = true;
				},
				[from, to] as const
			);
		const measure = async (from: number, to: number): Promise<number> => {
			await hideRange(from, to);
			await page.waitForTimeout(warm * 1000);
			return sample(page);
		};
		const none = await measure(0, 0);
		const all = await measure(0, info.length);
		console.log(`nothing hidden ${none.toFixed(2)} ms, every child hidden ${all.toFixed(2)} ms`);
		let from = 0;
		let to = info.length;
		while (to - from > 1) {
			const mid = Math.floor((from + to) / 2);
			const a = await measure(from, mid);
			const b = await measure(mid, to);
			const base0 = await measure(0, 0);
			console.log(
				`  children ${from}..${mid - 1}: ${a.toFixed(2)}   ${mid}..${to - 1}: ${b.toFixed(2)}   (nothing hidden ${base0.toFixed(2)})`
			);
			if (base0 - a < 0.5 && base0 - b < 0.5) {
				console.log('  neither half gives 0.5 ms alone: the cost is spread or needs both');
				break;
			}
			if (base0 - a >= base0 - b) to = mid;
			else from = mid;
		}
		console.log(`narrowed to children ${from}..${to - 1}:`);
		for (let i = from; i < to; i++) console.log(`  [${i}] ${info[i]}`);
		await hideRange(0, 0);
		await browser.close();
		process.exit(0);
	}
	if (process.env.MODE === 'flags') {
		// MODE=flags: shadow flags and visibility of the building list's meshes (site-buildings > list),
		// child [IDX] alone (default 1) or all of them, against nothing changed
		const idx = Number(process.env.IDX ?? 1);
		const set = (what: string): Promise<void> =>
			page.evaluate(
				([what, idx]) => {
					const w = window as any;
					const list = w.__site.children[0].children[0];
					const meshes: any[] = list.children;
					if (!w.__orig) {
						w.__orig = meshes.map((m: any) => [
							m.castShadow,
							m.receiveShadow,
							m.visible,
							m.material
						]);
						w.__alt = {
							plain: new meshes[0].material.constructor({ vertexColors: true, roughness: 0.5 }),
							plainr: (() => {
								const m = new meshes[0].material.constructor({
									vertexColors: true,
									roughness: 0.55,
									metalness: 0.1
								});
								m.lightsNode = meshes[1].material.lightsNode;
								return m;
							})(),
							basic: new meshes[6].material.constructor({ vertexColors: true })
						};
					}
					meshes.forEach((m: any, i: number) => {
						m.castShadow = w.__orig[i][0];
						m.receiveShadow = w.__orig[i][1];
						m.visible = w.__orig[i][2];
						m.material = w.__orig[i][3];
					});
					const pick = what.endsWith('-all') ? meshes : [meshes[idx]];
					for (const m of pick) {
						if (what.startsWith('cast')) m.castShadow = false;
						if (what.startsWith('receive')) m.receiveShadow = false;
						if (what.startsWith('both')) m.castShadow = m.receiveShadow = false;
						if (what.startsWith('hide')) m.visible = false;
						if (what === 'plainr') m.material = w.__alt.plainr;
						else if (what.startsWith('plain')) m.material = w.__alt.plain;
						if (what.startsWith('basic')) m.material = w.__alt.basic;
					}
				},
				[what, idx] as const
			);
		const all = [
			'nothing',
			'cast',
			'receive',
			'both',
			'hide',
			'plain',
			'plainr',
			'basic',
			'receive-all'
		];
		const states = process.env.STATES ? process.env.STATES.split(',') : all;
		const acc = new Map<string, number[]>(states.map((s) => [s, []]));
		for (let r = 0; r < Math.max(rounds, 3); r++)
			for (const s of states) {
				await set(s);
				await page.waitForTimeout(warm * 1000);
				acc.get(s)!.push(await sample(page));
			}
		await set('nothing');
		const info = await page.evaluate((idx) => {
			const w = window as any;
			return w.__site.children[0].children[0].children.map((m: any, i: number) => {
				const g = m.geometry;
				g.computeBoundingBox();
				const b = g.boundingBox;
				return `[${i}] ${m.material.type} ${m.material.name || ''} tris ${(g.index ? g.index.count : g.attributes.position.count) / 3} cast ${m.castShadow} recv ${m.receiveShadow} size ${(b.max.x - b.min.x).toFixed(0)}x${(b.max.y - b.min.y).toFixed(0)}x${(b.max.z - b.min.z).toFixed(0)} mat.transparent ${m.material.transparent} side ${m.material.side} weather ${JSON.stringify(m.material.userData.weather)}`;
			});
		}, idx);
		for (const l of info) console.log(l);
		const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
		console.log(`pad, ${preset}, mean frame interval ms, idx ${idx}`);
		for (const [s, xs] of acc)
			console.log(
				`  ${s.padEnd(12)} ${mean(xs).toFixed(2)}  [${xs.map((x) => x.toFixed(1)).join(', ')}]`
			);
		await browser.close();
		process.exit(0);
	}
	if (process.env.MODE === 'bundle') {
		// MODE=bundle: what hiding the root, the static bundle alone, or every material alone takes
		const set = (what: string): Promise<void> =>
			page.evaluate((what) => {
				const w = window as any;
				w.__site.visible = what !== 'root';
				if (w.__siteBundle) w.__siteBundle.visible = what !== 'bundle';
				for (const [, v] of w.__siteMaterials) v.material.visible = !what.startsWith('materials');
				if (!w.__casters) {
					w.__casters = [];
					w.__site.traverse((o: any) => o.isMesh && o.castShadow && w.__casters.push(o));
				}
				for (const o of w.__casters) o.castShadow = !what.includes('casters');
				if (w.__siteBundle) w.__siteBundle.needsUpdate = true;
			}, what);
		const states = ['nothing', 'casters', 'materials+casters', 'root'];
		const acc = new Map<string, number[]>(states.map((s) => [s, []]));
		for (let r = 0; r < Math.max(rounds, 3); r++)
			for (const s of states) {
				await set(s);
				await page.waitForTimeout(warm * 1000);
				acc.get(s)!.push(await sample(page));
			}
		await set('nothing');
		const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
		console.log(`pad, ${preset}, mean frame interval ms, hidden: what`);
		for (const [s, xs] of acc)
			console.log(
				`  hidden ${s.padEnd(10)} ${mean(xs).toFixed(2)}  [${xs.map((x) => x.toFixed(1)).join(', ')}]`
			);
		await browser.close();
		process.exit(0);
	}
	console.log(`${materials.length} materials under launch-site`);
	const acc = new Map<string, { off: number[]; on: number[] }>();
	for (const m of materials) acc.set(m.key, { off: [], on: [] });
	await hide(null);
	await page.waitForTimeout(warm * 1000);
	for (let r = 0; r < rounds; r++)
		for (const m of materials) {
			await hide(m.key);
			await page.waitForTimeout(warm * 1000);
			acc.get(m.key)!.off.push(await sample(page));
			await hide(null);
			await page.waitForTimeout(2000);
			acc.get(m.key)!.on.push(await sample(page));
		}
	const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
	console.log(`pad, ${preset}, mean frame interval ms, ${rounds} rounds of ${seconds} s`);
	for (const m of materials) {
		const a = acc.get(m.key)!;
		console.log(
			`  hidden ${mean(a.off).toFixed(2)}  shown ${mean(a.on).toFixed(2)}  gain ${(mean(a.on) - mean(a.off)).toFixed(2)}  ${m.meshes} meshes, ${m.tris} tris  ${m.key}`
		);
	}
} finally {
	await browser.close();
}
