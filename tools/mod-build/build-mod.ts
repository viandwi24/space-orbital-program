/**
 * Builds a mod folder into an installable package (plan 046, ADR 0057):
 *
 *   bun run tools/mod-build/build-mod.ts <mod folder>      ->  <mod folder>/dist/<id>-<version>.orbital-mod.json
 *
 * The folder holds `mod.json` (the manifest) and `src/index.ts` (default-exports the plugin).
 * Models are optional (plan 051, ADR 0076): every `*.glb` (and since plan 375, every `*.png` and
 * `*.webp` image) under `assets/` is packed at its path relative to that folder, and an `assets.ts` whose default export is a function returning
 * `{ "models/x.glb": bytes }` (sync or async) generates more at build time, so a mod needs no
 * binary art in its repository.
 * `@orbital/sdk` is not bundled: it is replaced by a shim that reads the SDK the game puts on
 * `globalThis` (one copy of the SDK and of zod for every mod).
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { createModPackage, MOD_SDK_KEY } from '@orbital/core';
import * as sdk from '@orbital/sdk';

/** Source of the module that stands in for `@orbital/sdk`: every runtime export, read from the host. */
export function sdkShim(): string {
	const names = Object.keys(sdk).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
	return [
		`const sdk = globalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(MOD_SDK_KEY))})];`,
		`if (!sdk) throw new Error('This mod needs the Orbital game: the host SDK is not installed.');`,
		...names.map((n) => `export const ${n} = sdk.${n};`)
	].join('\n');
}

export interface BuiltMod {
	/** Where the package was written. */
	file: string;
	/** The package text. */
	text: string;
}

/** Files under `<dir>/assets` (any depth), keyed by their path inside it with `/` separators. */
async function assetFiles(dir: string): Promise<Record<string, Uint8Array>> {
	const root = join(dir, 'assets');
	const out: Record<string, Uint8Array> = {};
	if (!existsSync(root)) return out;
	const walk = async (folder: string): Promise<void> => {
		for (const entry of await readdir(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (/\.(glb|png|webp)$/.test(entry.name)) {
				out[relative(root, path).split(sep).join('/')] = new Uint8Array(await readFile(path));
			}
		}
	};
	await walk(root);
	return out;
}

/** The assets a mod generates in code: `assets.ts` default-exports a function returning path to bytes. */
async function generatedAssets(dir: string): Promise<Record<string, Uint8Array>> {
	const file = join(dir, 'assets.ts');
	if (!existsSync(file)) return {};
	const module = (await import(file)) as { default?: unknown };
	if (typeof module.default !== 'function') {
		throw new Error(`${file} must default-export a function returning { path: bytes }.`);
	}
	return (await module.default()) as Record<string, Uint8Array>;
}

export async function buildMod(folder: string): Promise<BuiltMod> {
	const dir = resolve(folder);
	const manifest: unknown = JSON.parse(await readFile(join(dir, 'mod.json'), 'utf8'));
	const result = await Bun.build({
		entrypoints: [join(dir, 'src/index.ts')],
		format: 'esm',
		target: 'browser',
		minify: true,
		plugins: [
			{
				name: 'orbital-sdk-shim',
				setup(build) {
					build.onResolve({ filter: /^@orbital\/sdk$/ }, () => ({
						path: 'orbital-sdk',
						namespace: 'orbital-sdk-shim'
					}));
					build.onLoad({ filter: /.*/, namespace: 'orbital-sdk-shim' }, () => ({
						contents: sdkShim(),
						loader: 'js'
					}));
				}
			}
		]
	});
	if (!result.success || result.outputs.length !== 1) {
		throw new Error(`Build failed:\n${result.logs.map((l) => l.message).join('\n')}`);
	}
	const code = await result.outputs[0]!.text();
	const pkg = await createModPackage(manifest, code, {
		...(await assetFiles(dir)),
		...(await generatedAssets(dir))
	});
	const file = join(dir, 'dist', `${pkg.manifest.id}-${pkg.manifest.version}.orbital-mod.json`);
	const text = JSON.stringify(pkg);
	await mkdir(join(dir, 'dist'), { recursive: true });
	await writeFile(file, text);
	return { file, text };
}

if (import.meta.main) {
	const folder = process.argv[2];
	if (!folder) {
		console.error('usage: bun run tools/mod-build/build-mod.ts <mod folder>');
		process.exit(2);
	}
	const built = await buildMod(folder);
	console.log(`wrote ${built.file} (${built.text.length} bytes)`);
	const assets = Object.keys(JSON.parse(built.text).assets ?? {});
	if (assets.length > 0) console.log(`assets: ${assets.join(', ')}`);
}
