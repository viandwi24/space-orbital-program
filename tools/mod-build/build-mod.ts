/**
 * Builds a mod folder into an installable package (plan 046, ADR 0057):
 *
 *   bun run tools/mod-build/build-mod.ts <mod folder>      ->  <mod folder>/dist/<id>-<version>.orbital-mod.json
 *
 * The folder holds `mod.json` (the manifest) and `src/index.ts` (default-exports the plugin).
 * `@orbital/sdk` is not bundled: it is replaced by a shim that reads the SDK the game puts on
 * `globalThis` (one copy of the SDK and of zod for every mod).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
	const pkg = await createModPackage(manifest, code);
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
}
