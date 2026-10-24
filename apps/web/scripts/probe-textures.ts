/**
 * Sampled textures per shader stage of every pipeline a flight page builds (plan 412): hooks WebGPU's
 * `createShaderModule` and `createRenderPipeline[Async]`, counts the texture bindings of each WGSL
 * module, and counts how often each pipeline label is created (a failed pipeline retried every frame
 * shows as a growing count). Against a development build; WebGPU only.
 *
 *   SHOT_URL=http://localhost:5211 bun scripts/probe-textures.ts [preset]
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { modPackageFingerprint } from '@orbital/core';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';
import { setupVessel, waitForFlight } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const preset = process.argv[2] ?? 'high';
const seconds = Number(process.env.SECONDS ?? 12);

const browser = await chromium.launch({
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: Number(process.env.DSF ?? 1),
	baseURL: base
});
await context.addInitScript(
	([p]) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', 'webgpu');
		localStorage.setItem('orbital.graphics', p!);
		localStorage.setItem('orbital.graphics.auto', 'off');
		const w = window as any;
		w.__probe = { modules: [] as any[], pipelines: {} as Record<string, number>, errors: 0 };
		const proto = (window as any).GPUDevice?.prototype;
		if (!proto) return;
		// textures per bind group layout and per pipeline layout: the per-stage limit counts them all
		const bgl = new WeakMap<object, number>();
		const pl = new WeakMap<object, number>();
		w.__probe.layouts = [] as any[];
		const cbgl = proto.createBindGroupLayout;
		proto.createBindGroupLayout = function (d: any) {
			const n = (d.entries ?? []).filter((e: any) => e.texture && (e.visibility & 2) !== 0).length;
			const out = cbgl.call(this, d);
			bgl.set(out, n);
			return out;
		};
		const cpl = proto.createPipelineLayout;
		proto.createPipelineLayout = function (d: any) {
			const out = cpl.call(this, d);
			pl.set(
				out,
				(d.bindGroupLayouts ?? []).reduce((a: number, g: any) => a + (bgl.get(g) ?? 0), 0)
			);
			return out;
		};
		const csm = proto.createShaderModule;
		proto.createShaderModule = function (d: any) {
			const code: string = d.code ?? '';
			const frag = code.split(/@fragment/)[1] ?? '';
			// texture bindings declared at module scope: `var<...> name : texture_...`
			const all = [...code.matchAll(/(\w+)\s*:\s*(texture_[\w<>]+)/g)];
			w.__probe.modules.push({
				label: d.label ?? '',
				textures: all.length,
				names: all.map((m) => `${m[1]}:${m[2]}`),
				hasFragment: frag.length > 0
			});
			return csm.call(this, d);
		};
		for (const name of ['createRenderPipeline', 'createRenderPipelineAsync']) {
			const orig = proto[name];
			proto[name] = function (d: any) {
				const k = `${d.label ?? ''}`;
				const n = d.layout && typeof d.layout === 'object' ? (pl.get(d.layout) ?? -1) : -1;
				if (n >= 12) w.__probe.layouts.push({ label: k, fragmentTextures: n });
				w.__probe.pipelines[k] = (w.__probe.pipelines[k] ?? 0) + 1;
				return orig.call(this, d);
			};
		}
	},
	[preset]
);
if (process.env.MOD) {
	// a mod from `examples/` goes into the page's store first (MOD=mod-planet-sample)
	const built = await buildMod(join(import.meta.dir, '../../../examples', process.env.MOD));
	const pkg = JSON.parse(built.text);
	const sha256 = await modPackageFingerprint(pkg.code, pkg.assets);
	const rec = {
		id: pkg.manifest.id,
		manifest: pkg.manifest,
		code: pkg.code,
		assets: pkg.assets,
		sha256,
		trusted: sha256,
		source: { kind: 'file', name: `${process.env.MOD}.json` },
		installedAt: Date.now(),
		enabled: true,
		order: 0
	};
	const seed = await context.newPage();
	await seed.goto('/vab');
	await seed.evaluate(
		(r) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('orbital-mods', 1);
				open.onupgradeneeded = () => open.result.createObjectStore('mods', { keyPath: 'id' });
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('mods', 'readwrite');
					tx.objectStore('mods').put(r);
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				};
			}),
		rec
	);
	await seed.reload();
	await seed.close();
}
{
	const hangar = await context.newPage();
	await setupVessel(hangar);
	await hangar.close();
}
const page = await context.newPage();
let pipelineFailures = 0;
page.on('console', (m) => {
	if (m.type() === 'error' && /pipeline creation failed/.test(m.text()))
		(pipelineFailures++, console.log('  FAILED:', m.text().replace(/\s+/g, ' ').slice(0, 330)));
});
await page.goto('/flight');
await waitForFlight(page, 120_000);
await page.waitForTimeout(seconds * 1000);
const probe = await page.evaluate(() => (window as any).__probe);
const top = [...probe.modules]
	.filter((m: any) => m.hasFragment)
	.sort((a: any, b: any) => b.textures - a.textures)
	.slice(0, 14);
console.log(
	'shader modules with the most texture bindings (module-wide, so a stage may see fewer):'
);
for (const m of top) console.log(`  ${String(m.textures).padStart(3)}  ${m.label}`);
const worst = top[0];
if (worst) console.log('\nthe widest module:', worst.label, '\n ', worst.names.join('\n  '));
console.log('\nfragment textures per pipeline layout (12 or more; the limit is 16):');
for (const l of [...probe.layouts].sort(
	(a: any, b: any) => b.fragmentTextures - a.fragmentTextures
))
	console.log(`  ${String(l.fragmentTextures).padStart(3)}  ${l.label}`);
console.log('\npipelines created more than once (a retry loop shows here):');
for (const [k, n] of Object.entries(probe.pipelines as Record<string, number>)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 12))
	console.log(`  ${String(n).padStart(4)}  ${k}`);
const over = (probe.layouts as { label: string; fragmentTextures: number }[]).filter(
	(l) => l.fragmentTextures > 15
);
await browser.close();
if (process.argv.includes('--gate') && (over.length > 0 || pipelineFailures > 0)) {
	console.log(
		`\nGATE FAILED: ${over.length} pipeline(s) over 15 sampled textures, ${pipelineFailures} failed`
	);
	process.exit(1);
}
if (process.argv.includes('--gate'))
	console.log('\ngate ok: no pipeline over 15 sampled textures, none failed');
