/** Plan 051 / ADR 0076: assets in mod packages are validated before anything is stored or run. */
import { describe, expect, test } from 'bun:test';
import {
	MAX_ASSET_KEYFRAMES,
	MAX_ASSET_TRIANGLES,
	MAX_MOD_ASSET_BYTES,
	base64ToBytes,
	bytesToBase64,
	createModPackage,
	importModBundle,
	inspectGlb,
	modCodeHash,
	modPackageFingerprint,
	parseModPackage,
	resolveMods,
	type ModManifest,
	type Plugin
} from '../src/index.ts';
import { buildGlb, encodePng, lathe } from '../../../tools/mod-build/glb.ts';

const MANIFEST = { id: 'm', version: '1.0.0', api: '^0.1' };

/** A 12-sided lathe model with a texture: about 40 triangles. */
function model(segments = 12): Uint8Array {
	const png = encodePng(2, 2, new Uint8Array(16).fill(200));
	return buildGlb({
		meshes: [
			lathe(
				[
					[0.5, -0.5],
					[0.5, 0.5]
				],
				segments,
				0
			)
		],
		materials: [{ color: [1, 1, 1, 1], texture: 0 }],
		nodes: [{ name: 'body', mesh: 0 }],
		roots: [0],
		images: [png]
	});
}

const source = (parts = '') =>
	`export default { meta: { id: 'm', version: '1.0.0', api: '^0.1' }, depends: [], optional: [],
	setup(ctx) { ctx.parts.register({ id: 'm.thing', title: 'Thing', mass: 2 }); ${parts} } };`;

const builtin: Plugin = {
	meta: { id: 'base', version: '1.0.0', api: '*' },
	depends: [],
	optional: [],
	setup() {}
};

describe('base64', () => {
	test('round trips bytes and rejects text that is not base64', () => {
		const bytes = new Uint8Array(70_000).map((_, i) => i % 251);
		expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
		expect(base64ToBytes('not base64!')).toBeUndefined();
	});
});

describe('inspectGlb', () => {
	test('accepts a model and counts its triangles and draw calls', () => {
		const r = inspectGlb(model(12));
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.info).toMatchObject({ triangles: 24, meshNodes: 1, images: 1 });
	});

	test('rejects the wrong container, an external URI and a compressed extension', () => {
		expect(inspectGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}   padding'))).toEqual({
			ok: false,
			errors: [expect.stringContaining('glTF')]
		});
		const edit = (f: (doc: Record<string, unknown>) => void): Uint8Array => {
			const glb = model();
			const view = new DataView(glb.buffer);
			const jsonLength = view.getUint32(12, true);
			const doc = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
			f(doc);
			const text = new TextEncoder().encode(JSON.stringify(doc));
			const json = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
			json.set(text);
			const out = new Uint8Array(glb.length - jsonLength + json.length);
			out.set(glb.subarray(0, 20));
			out.set(json, 20);
			out.set(glb.subarray(20 + jsonLength), 20 + json.length);
			new DataView(out.buffer).setUint32(8, out.length, true);
			new DataView(out.buffer).setUint32(12, json.length, true);
			return out;
		};
		const external = inspectGlb(edit((d) => ((d.buffers as { uri?: string }[])[0]!.uri = 'a.bin')));
		expect(external.ok === false && external.errors[0]).toContain('buffers[0]');
		const draco = inspectGlb(edit((d) => (d.extensionsRequired = ['KHR_draco_mesh_compression'])));
		expect(draco.ok === false && draco.errors[0]).toContain('KHR_draco_mesh_compression');
		const webp = inspectGlb(
			edit((d) => ((d.images as { mimeType: string }[])[0]!.mimeType = 'image/webp'))
		);
		expect(webp.ok === false && webp.errors[0]).toContain('image/webp');
	});

	test('rejects a model over the triangle budget', () => {
		const side = Math.ceil(Math.sqrt(MAX_ASSET_TRIANGLES)) + 2;
		const heavy = buildGlb({
			meshes: [
				lathe(
					Array.from({ length: side }, (_, i) => [0.5, i / side] as [number, number]),
					side,
					0
				)
			],
			materials: [{ color: [1, 1, 1, 1] }],
			nodes: [{ name: 'body', mesh: 0 }],
			roots: [0]
		});
		const r = inspectGlb(heavy);
		expect(r.ok === false && r.errors[0]).toContain('triangles');
	});
});

describe('packages with assets', () => {
	test('format 1 without assets keeps the old fingerprint, format 2 covers the assets', async () => {
		const plain = await createModPackage(MANIFEST, source());
		expect(plain.formatVersion).toBe(1);
		expect(plain.sha256).toBe(await modCodeHash(plain.code));

		const withAsset = await createModPackage(MANIFEST, source(), { 'models/a.glb': model() });
		expect(withAsset.formatVersion).toBe(2);
		expect(withAsset.sha256).toBe(await modPackageFingerprint(withAsset.code, withAsset.assets));
		expect(withAsset.sha256).not.toBe(await modCodeHash(withAsset.code));
		const parsed = await parseModPackage(JSON.stringify(withAsset));
		expect(parsed.ok).toBe(true);
	});

	test('a flipped asset byte is caught by the asset hash, a swapped hash by the fingerprint', async () => {
		const pkg = await createModPackage(MANIFEST, source(), { 'models/a.glb': model() });
		const bytes = base64ToBytes(pkg.assets!['models/a.glb']!.data)!;
		bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
		const flipped = structuredClone(pkg);
		flipped.assets!['models/a.glb']!.data = bytesToBase64(bytes);
		const r1 = await parseModPackage(JSON.stringify(flipped));
		expect(r1.ok === false && r1.errors[0]).toContain('does not match its fingerprint');

		// An attacker who also fixes the asset hash still fails the package fingerprint.
		const forged = structuredClone(flipped);
		forged.assets!['models/a.glb']!.sha256 = await (
			await import('../src/index.ts')
		).sha256Hex(bytes);
		const r2 = await parseModPackage(JSON.stringify(forged));
		expect(r2.ok === false && r2.errors[0]).toContain('fingerprint');
	});

	test('oversize, wrong size, wrong type and bad path are refused with the asset named', async () => {
		const pkg = await createModPackage(MANIFEST, source(), { 'models/a.glb': model() });
		const text = (f: (p: typeof pkg) => void): string => {
			const copy = structuredClone(pkg);
			f(copy);
			return JSON.stringify(copy);
		};
		const sizeLies = await parseModPackage(text((p) => (p.assets!['models/a.glb']!.size += 1)));
		expect(sizeLies.ok === false && sizeLies.errors[0]).toContain('models/a.glb');
		const huge = await parseModPackage(
			text((p) => (p.assets!['models/a.glb']!.size = MAX_MOD_ASSET_BYTES + 1))
		);
		expect(huge.ok).toBe(false);
		const type = await parseModPackage(
			text((p) => ((p.assets!['models/a.glb'] as { type: string }).type = 'image/png'))
		);
		expect(type.ok).toBe(false);
		const path = await parseModPackage(
			text((p) => {
				p.assets!['../evil.glb'] = p.assets!['models/a.glb']!;
				delete p.assets!['models/a.glb'];
			})
		);
		expect(path.ok === false && path.errors.join(' ')).toContain('../evil.glb');
		const v1 = await parseModPackage(
			text((p) => ((p as { formatVersion: number }).formatVersion = 1))
		);
		expect(v1.ok === false && v1.errors[0]).toContain('format 1');
	});

	test('a newer format is refused with a message to update', async () => {
		const r = await parseModPackage(JSON.stringify({ format: 'orbital-mod', formatVersion: 5 }));
		expect(r.ok === false && r.errors[0]).toContain('newer game');
	});

	test('a file that is not a glb is refused at parse time', async () => {
		await expect(
			createModPackage(MANIFEST, source(), { 'models/a.glb': new Uint8Array(64) })
		).rejects.toThrow(/glTF/);
	});
});

describe('resolveMods with assets', () => {
	const part = (asset: string) =>
		`ctx.parts.register({ id: 'm.shiny', title: 'Shiny', mass: 1, shape: { kind: 'cylinder', radius: 0.5, height: 1 }, visual: { kind: 'tank', asset: ${JSON.stringify(asset)} } });`;
	const run = async (code: string, files: Record<string, Uint8Array>) => {
		const pkg = await createModPackage(MANIFEST, code, files);
		return resolveMods(
			[{ manifest: pkg.manifest as ModManifest, code: pkg.code, assets: pkg.assets }],
			{ builtin: [builtin], importModule: importModBundle }
		);
	};

	test('a part naming a shipped asset is accepted and listed', async () => {
		const r = await run(source(part('models/a.glb')), { 'models/a.glb': model() });
		expect(r.rejected).toEqual([]);
		expect(r.partAssets).toEqual([{ part: 'm.shiny', mod: 'm', path: 'models/a.glb' }]);
		expect(r.assets.get('m')!.get('models/a.glb')!.info!.triangles).toBe(24);
	});

	test('a part naming an asset the package lacks rejects the mod, naming both', async () => {
		const r = await run(source(part('models/b.glb')), { 'models/a.glb': model() });
		expect(r.plugins).toEqual([]);
		expect(r.rejected[0]!.reason).toContain('m.shiny');
		expect(r.rejected[0]!.reason).toContain('models/b.glb');
	});

	test('an invalid asset path in a visual fails the part definition', async () => {
		const r = await run(source(part('Models/A.png')), { 'models/a.glb': model() });
		expect(r.rejected).toHaveLength(1);
	});
});

describe('richer models (plan 065, ADR 0160)', () => {
	/** A body and a lid that turns 90 degrees about X over 1 s, sampled `samples` times. */
	const animated = (samples = 3): Uint8Array => {
		const times = new Float32Array(samples).map((_, i) => i / Math.max(1, samples - 1));
		const values = new Float32Array(samples * 4);
		times.forEach((t, i) =>
			values.set([Math.sin((t * Math.PI) / 4), 0, 0, Math.cos((t * Math.PI) / 4)], i * 4)
		);
		return buildGlb({
			meshes: [
				lathe(
					[
						[0.5, -0.5],
						[0.5, 0.5]
					],
					8,
					0
				)
			],
			materials: [{ color: [1, 1, 1, 1] }],
			nodes: [
				{ name: 'body', mesh: 0 },
				{ name: 'lid', mesh: 0, translation: [0, 0.5, 0] }
			],
			roots: [0, 1],
			animations: [{ name: 'deploy', channels: [{ node: 1, path: 'rotation', times, values }] }]
		});
	};

	test('an animated model is counted and accepted under the keyframe cap, refused over it', () => {
		const r = inspectGlb(animated(3));
		expect(r.ok && r.info).toMatchObject({ animations: 1, keyframes: 3 });
		const over = inspectGlb(animated(MAX_ASSET_KEYFRAMES + 1));
		expect(over.ok === false && over.errors[0]).toContain('keyframes');
	});

	test('KTX2 textures (KHR_texture_basisu) are accepted', () => {
		const ktx = buildGlb({
			meshes: [
				lathe(
					[
						[0.5, -0.5],
						[0.5, 0.5]
					],
					8,
					0
				)
			],
			materials: [{ color: [1, 1, 1, 1], texture: 0 }],
			nodes: [{ name: 'body', mesh: 0 }],
			roots: [0],
			images: [new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb])],
			imageMime: 'image/ktx2',
			extensionsUsed: ['KHR_texture_basisu']
		});
		const r = inspectGlb(ktx);
		expect(r.ok && r.info.extensions).toEqual(['KHR_texture_basisu']);
	});

	test('every LOD asset must be in the package, and each is listed with its level', async () => {
		const lodPart = (lods: string) =>
			`ctx.parts.register({ id: 'm.shiny', title: 'Shiny', mass: 1, shape: { kind: 'cylinder', radius: 0.5, height: 1 }, visual: { kind: 'tank', asset: 'models/a.glb', lods: ${lods} } });`;
		const run = async (code: string, files: Record<string, Uint8Array>) => {
			const pkg = await createModPackage(MANIFEST, code, files);
			return resolveMods(
				[{ manifest: pkg.manifest as ModManifest, code: pkg.code, assets: pkg.assets }],
				{
					builtin: [builtin],
					importModule: importModBundle
				}
			);
		};
		const ok = await run(source(lodPart('[{ asset: "models/far.glb", distance: 80 }]')), {
			'models/a.glb': model(),
			'models/far.glb': model(6)
		});
		expect(ok.partAssets).toEqual([
			{ part: 'm.shiny', mod: 'm', path: 'models/a.glb' },
			{ part: 'm.shiny', mod: 'm', path: 'models/far.glb', lod: 1 }
		]);
		const missing = await run(source(lodPart('[{ asset: "models/far.glb", distance: 80 }]')), {
			'models/a.glb': model()
		});
		expect(missing.rejected[0]!.reason).toContain('LOD asset "models/far.glb"');
		const order = await run(
			source(
				lodPart(
					'[{ asset: "models/a.glb", distance: 80 }, { asset: "models/a.glb", distance: 40 }]'
				)
			),
			{ 'models/a.glb': model() }
		);
		expect(order.rejected).toHaveLength(1);
	});
});

describe('image assets (format 3, plan 375, ADR 0313 point 4)', () => {
	const png = encodePng(2, 2, new Uint8Array(16).fill(200));

	test('a PNG makes a format 3 package that parses', async () => {
		const pkg = await createModPackage({ id: 'm', version: '1.0.0', api: '^0.1' }, 'x', {
			'faces/a.png': png
		});
		expect(pkg.formatVersion).toBe(3);
		expect(pkg.assets?.['faces/a.png']?.type).toBe('image/png');
		expect((await parseModPackage(JSON.stringify(pkg))).ok).toBe(true);
	});

	test('a file that is not the image it says, or an image in a format 2 package, is refused', async () => {
		const bad = await createModPackage({ id: 'm', version: '1.0.0', api: '^0.1' }, 'x', {
			'faces/a.png': new TextEncoder().encode('not a png at all')
		}).catch((e: Error) => e.message);
		expect(String(bad)).toContain('not a PNG file');
		const pkg = await createModPackage({ id: 'm', version: '1.0.0', api: '^0.1' }, 'x', {
			'faces/a.png': png
		});
		const two = await parseModPackage(JSON.stringify({ ...pkg, formatVersion: 2 }));
		expect(two.ok === false && two.errors[0]).toContain('format 3');
	});
});

describe('images up to 4 MiB, WebP and KTX2 (format 4, plan 405, ADR 0345)', () => {
	const manifest = { id: 'm', version: '1.0.0', api: '^0.1' };
	const png = encodePng(2, 2, new Uint8Array(16).fill(200));
	/** A KTX2 header with `sides` x `sides` texels: the 12-byte identifier and the fields after it. */
	const ktx2 = (over: { side?: number; faces?: number; levels?: number; scheme?: number } = {}) => {
		const b = new Uint8Array(96);
		b.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
		const v = new DataView(b.buffer);
		v.setUint32(20, over.side ?? 1024, true);
		v.setUint32(24, over.side ?? 1024, true);
		v.setUint32(36, over.faces ?? 1, true);
		v.setUint32(40, over.levels ?? 8, true);
		v.setUint32(44, over.scheme ?? 1, true);
		return b;
	};
	const webp = (() => {
		const b = new Uint8Array(32);
		b.set(
			[...'RIFF'].map((c) => c.charCodeAt(0)),
			0
		);
		b.set(
			[...'WEBP'].map((c) => c.charCodeAt(0)),
			8
		);
		return b;
	})();
	const make = (files: Record<string, Uint8Array>) =>
		createModPackage(manifest, 'x', files).catch((e: Error) => e.message);

	test('PNG, WebP and KTX2 within the caps make a package; KTX2 makes it format 4', async () => {
		const pkg = await createModPackage(manifest, 'x', {
			'maps/a.png': png,
			'maps/b.webp': webp,
			'maps/c.ktx2': ktx2()
		});
		expect(pkg.formatVersion).toBe(4);
		expect(Object.values(pkg.assets!).map((a) => a.type)).toEqual([
			'image/png',
			'image/webp',
			'image/ktx2'
		]);
		expect((await parseModPackage(JSON.stringify(pkg))).ok).toBe(true);
		const old = await parseModPackage(JSON.stringify({ ...pkg, formatVersion: 3 }));
		expect(old.ok === false && old.errors[0]).toContain('format 4');
	});

	test('an image over 4 MiB, a KTX2 with a bad header and a texture past 4096 are refused, naming the file', async () => {
		const big = new Uint8Array(4 * 1024 * 1024 + 1);
		big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(String(await make({ 'maps/big.png': big }))).toContain('maps/big.png');
		expect(String(await make({ 'maps/big.png': big }))).toContain('Too big');
		const badMagic = ktx2();
		badMagic[0] = 0;
		expect(String(await make({ 'maps/a.ktx2': badMagic }))).toContain('maps/a.ktx2');
		expect(String(await make({ 'maps/a.ktx2': badMagic }))).toContain('KTX2');
		expect(String(await make({ 'maps/a.ktx2': ktx2({ side: 8192 }) }))).toContain('4096');
		expect(String(await make({ 'maps/a.ktx2': ktx2({ faces: 3 }) }))).toContain('faces');
		expect(String(await make({ 'maps/a.ktx2': ktx2({ scheme: 9 }) }))).toContain(
			'supercompression'
		);
		const wide = encodePng(2, 2, new Uint8Array(16).fill(1));
		new DataView(wide.buffer, wide.byteOffset).setUint32(16, 5000);
		expect(String(await make({ 'maps/w.png': wide }))).toContain('4096');
	});

	test('the models keep their 6 MiB, the images and models together 32 MiB', async () => {
		const files: Record<string, Uint8Array> = {};
		for (let i = 0; i < 9; i++) {
			const big = new Uint8Array(3.9 * 1024 * 1024);
			big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			new DataView(big.buffer).setUint32(16, 2048);
			new DataView(big.buffer).setUint32(20, 2048);
			files[`maps/m${i}.png`] = big;
		}
		const msg = String(await make(files));
		expect(msg).toContain('in all is over');
	});
});
