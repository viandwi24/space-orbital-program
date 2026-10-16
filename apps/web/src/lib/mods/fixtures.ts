/** Test support: mod records and package text built in memory. */
import { createModPackage, type ModManifest } from '@orbital/core';
import type { ModRecord } from './store';

export const pluginSource = (id: string, version = '1.0.0', body = `ctx.parts.register({ id: '${id}.thing', title: 'Thing', mass: 2, shape: { kind: 'cylinder', radius: 0.5, height: 1 } });`): string =>
	`export default { meta: { id: ${JSON.stringify(id)}, version: ${JSON.stringify(version)}, api: '^0.1' }, depends: ['stock'], optional: [], setup(ctx) { ${body} } };`;

export async function packageText(
	id: string,
	options: { version?: string; code?: string; manifest?: Partial<ModManifest> } = {}
): Promise<string> {
	const version = options.version ?? '1.0.0';
	const pkg = await createModPackage(
		{ id, version, api: '^0.1', title: `Mod ${id}`, ...options.manifest },
		options.code ?? pluginSource(id, version)
	);
	return JSON.stringify(pkg);
}

export async function recordOf(
	id: string,
	options: { order?: number; enabled?: boolean; code?: string; trusted?: string } = {}
): Promise<ModRecord> {
	const pkg = JSON.parse(await packageText(id, options.code === undefined ? {} : { code: options.code }));
	return {
		id,
		manifest: pkg.manifest,
		code: pkg.code,
		sha256: pkg.sha256,
		trusted: options.trusted ?? pkg.sha256,
		source: { kind: 'file', name: `${id}.orbital-mod.json` },
		installedAt: 1,
		enabled: options.enabled ?? true,
		order: options.order ?? 0
	};
}

/**
 * A stand-in for `importModBundle` in vitest, whose transform cannot `import()` a `blob:` URL (the
 * real path is tested in `packages/core/test/mods.test.ts`, the sample mod's test and the browser
 * run). Handles the fixtures' one shape: `export default <expression>;`.
 */
export async function importCode(code: string): Promise<unknown> {
	const expression = code.replace(/^\s*export default\s*/, '').replace(/;\s*$/, '');
	return { default: Reflect.apply(new Function(`return (${expression});`), undefined, []) };
}
