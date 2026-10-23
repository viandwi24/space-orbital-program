/**
 * Mod packages and the runtime loader for mods that are not part of the build (plan 046, ADR 0057).
 * A package is one JSON file with a manifest that can be read without running anything, the code
 * of the mod as one ES module text, and a fingerprint of that code. Everything here is
 * environment-neutral: the only host-specific step, turning code text into a module, is the
 * `importModule` the caller passes (`importModBundle` is the one every host uses).
 */
import * as z from 'zod';
import { API_VERSION } from './version.ts';
import { pluginIdSchema } from './schemas.ts';
import { loadPlugins, type Plugin } from './plugin.ts';
import { parseVersion, satisfies } from './semver.ts';
import {
	bytesToBase64,
	decodeAssets,
	modAssetSchema,
	modPackageFingerprint,
	sha256Hex,
	assetTypeOfPath,
	MOD_ASSET_TYPE,
	type DecodedAssets,
	type ModAsset
} from './mod-assets.ts';

export const MOD_PACKAGE_FORMAT = 'orbital-mod';
/**
 * Newest package format this game reads: 2 adds `assets` (ADR 0076), 3 adds image assets (ADR
 * 0313 point 4); older packages still load.
 */
export const MOD_PACKAGE_VERSION = 3;
/** Largest `code` a package may carry, characters. */
export const MAX_MOD_CODE_LENGTH = 8_000_000;

const versionSchema = z
	.string()
	.refine((v) => parseVersion(v) !== undefined, 'expected a version "x.y.z"');
const rangeSchema = z.string().refine((r) => {
	try {
		satisfies('0.0.0', r);
		return true;
	} catch {
		return false;
	}
}, 'expected a version range such as "^0.1", "~1.2" or "*"');

const SPDX_OPERATORS: ReadonlySet<string> = new Set(['AND', 'OR', 'WITH']);

/**
 * An SPDX licence id or expression (`MIT`, `Apache-2.0`, `MIT OR Apache-2.0`, `GPL-2.0+`,
 * `LicenseRef-acme`, with parentheses). Checks the shape, not the SPDX list: the mod manager shows
 * what the author wrote (plan 075).
 */
export function isSpdxExpression(text: string): boolean {
	const tokens = text.replace(/[()]/g, ' $& ').trim().split(/\s+/);
	let depth = 0;
	let expectId = true;
	for (const t of tokens) {
		if (t === '(') {
			if (!expectId) return false;
			depth++;
		} else if (t === ')') {
			if (expectId || --depth < 0) return false;
		} else if (SPDX_OPERATORS.has(t)) {
			if (expectId) return false;
			expectId = true;
		} else {
			if (!expectId || !/^[A-Za-z0-9][A-Za-z0-9.-]*\+?$/.test(t)) return false;
			expectId = false;
		}
	}
	return depth === 0 && !expectId;
}

/** What a mod says about itself, readable before any of its code runs. */
export const modManifestSchema = z.strictObject({
	id: pluginIdSchema,
	version: versionSchema,
	/** Range of the mod API the mod was written for. */
	api: rangeSchema,
	title: z.string().min(1).max(80).optional(),
	description: z.string().max(500).optional(),
	author: z.string().max(80).optional(),
	homepage: z.string().max(300).optional(),
	/** The mod's licence as an SPDX id or expression (plan 075); absent means "not stated". */
	licence: z
		.string()
		.max(64)
		.refine(
			isSpdxExpression,
			'expected an SPDX licence id or expression such as "MIT" or "MIT OR Apache-2.0"'
		)
		.optional(),
	/** Other plugins this one needs: plugin id to version range. Built-ins (`stock`) count. */
	dependencies: z.record(pluginIdSchema, rangeSchema).default({})
});
export type ModManifest = z.output<typeof modManifestSchema>;

export const modPackageSchema = z.strictObject({
	format: z.literal(MOD_PACKAGE_FORMAT),
	formatVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	manifest: modManifestSchema,
	code: z.string().min(1).max(MAX_MOD_CODE_LENGTH),
	/** Files the mod ships, by path (format 2). Models are `.glb` (ADR 0076). */
	assets: z.record(z.string(), modAssetSchema).optional(),
	/**
	 * The fingerprint of the package: the hex SHA-256 of `code` (UTF-8); with assets, also of each
	 * asset's path and hash (`modPackageFingerprint`).
	 */
	sha256: z.string().regex(/^[0-9a-f]{64}$/, 'expected 64 lower-case hex digits')
});
export type ModPackage = z.output<typeof modPackageSchema>;

/** Hex SHA-256 of a mod's code, the fingerprint the trust prompt shows. */
export async function modCodeHash(code: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type ParsedModPackage = { ok: true; package: ModPackage } | { ok: false; errors: string[] };

/**
 * Reads package text (a file or a response): JSON, shape, manifest and the fingerprint of the
 * code. Runs nothing. The errors are meant to be shown to the player.
 */
export async function parseModPackage(text: string): Promise<ParsedModPackage> {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, errors: ['This file is not JSON, so it is not an Orbital mod package.'] };
	}
	if (
		typeof raw !== 'object' ||
		raw === null ||
		(raw as { format?: unknown }).format !== MOD_PACKAGE_FORMAT
	) {
		return {
			ok: false,
			errors: [`Not an Orbital mod package (expected "format": "${MOD_PACKAGE_FORMAT}").`]
		};
	}
	const version = (raw as { formatVersion?: unknown }).formatVersion;
	if (typeof version === 'number' && version > MOD_PACKAGE_VERSION) {
		return {
			ok: false,
			errors: ['This package was made for a newer game. Update the game first.']
		};
	}
	const parsed = modPackageSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'package'}: ${i.message}`)
		};
	}
	const assets = parsed.data.assets;
	if (assets !== undefined && parsed.data.formatVersion < 2) {
		return { ok: false, errors: ['assets: a format 1 package cannot carry assets.'] };
	}
	if (
		assets !== undefined &&
		parsed.data.formatVersion < 3 &&
		Object.values(assets).some((a) => a.type !== MOD_ASSET_TYPE)
	) {
		return { ok: false, errors: ['assets: images need a format 3 package.'] };
	}
	if (assets !== undefined) {
		const decoded = await decodeAssets(assets);
		if (!decoded.ok) return { ok: false, errors: decoded.errors };
	}
	const actual = await modPackageFingerprint(parsed.data.code, assets);
	if (actual !== parsed.data.sha256) {
		return {
			ok: false,
			errors: [
				'The code and assets do not match the package fingerprint: the file was edited or damaged.'
			]
		};
	}
	return { ok: true, package: parsed.data };
}

/**
 * Builds a package from a manifest, the mod's code and optional asset files (path to bytes), for
 * the build tool. Without assets the package is format 1, byte-compatible with older games.
 */
export async function createModPackage(
	manifest: unknown,
	code: string,
	files: Readonly<Record<string, Uint8Array>> = {}
): Promise<ModPackage> {
	const paths = Object.keys(files).sort();
	const assets: Record<string, ModAsset> = {};
	for (const path of paths) {
		const bytes = files[path]!;
		assets[path] = {
			type: assetTypeOfPath(path) ?? MOD_ASSET_TYPE,
			size: bytes.byteLength,
			sha256: await sha256Hex(bytes),
			data: bytesToBase64(bytes)
		};
	}
	const withAssets = paths.length > 0;
	const pkg = modPackageSchema.parse({
		format: MOD_PACKAGE_FORMAT,
		formatVersion: Object.values(assets).some((a) => a.type !== MOD_ASSET_TYPE)
			? 3
			: withAssets
				? 2
				: 1,
		manifest,
		code,
		...(withAssets ? { assets } : {}),
		sha256: await modPackageFingerprint(code, withAssets ? assets : undefined)
	});
	if (withAssets) {
		const decoded = await decodeAssets(assets);
		if (!decoded.ok) throw new Error(`Invalid assets:\n${decoded.errors.join('\n')}`);
	}
	return pkg;
}

// ---------------------------------------------------------------------------------------------
// Host side: the SDK a bundle sees, and importing code text
// ---------------------------------------------------------------------------------------------

/** Where the host puts the SDK for the shim a mod is built against (ADR 0057 point 3). */
export const MOD_SDK_KEY = Symbol.for('orbital.mod-sdk');

/** Makes `sdk` (the `@orbital/sdk` namespace) visible to mod bundles. Call before `importModBundle`. */
export function installModSdk(sdk: object): void {
	Reflect.set(globalThis, MOD_SDK_KEY, sdk);
}

/**
 * Imports mod code text as an ES module through a `blob:` URL and returns its namespace. Works
 * in the page, in a Worker, in Bun and in Node. The code runs here: call it only for a mod the
 * player trusted.
 */
export async function importModBundle(code: string): Promise<unknown> {
	const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
	try {
		return await import(/* @vite-ignore */ url);
	} finally {
		URL.revokeObjectURL(url);
	}
}

// ---------------------------------------------------------------------------------------------
// Resolving a set of bundles into plugins
// ---------------------------------------------------------------------------------------------

export interface ModBundle {
	manifest: ModManifest;
	code: string;
	/** The package's assets as parsed (checked again by `resolveMods`); absent for a code-only mod. */
	assets?: Readonly<Record<string, ModAsset>>;
}

/** A part whose look is a model the mod ships: which part, which mod, which asset. */
export interface PartAssetRef {
	part: string;
	mod: string;
	path: string;
	/** A lower-detail model (`visual.lods[lod - 1]`, ADR 0160 point 2); absent for the base `asset`. */
	lod?: number;
}

/**
 * What kind of problem rejected a mod (plan 375): the loader log groups and explains by it.
 * - `api`: the mod wants another mod API version.
 * - `dependency`: a dependency is missing, disabled or the wrong version.
 * - `duplicate`: its plugin id is taken.
 * - `manifest`: the manifest and the code disagree.
 * - `import`: the code could not be evaluated or does not export a plugin.
 * - `setup`: its `setup` threw.
 * - `content`: a definition it registers is invalid or clashes.
 * - `assets`: its assets are invalid, or a part names an asset the package lacks.
 * - `cycle`: mods that depend on each other.
 */
export type ModProblemCode =
	| 'api'
	| 'dependency'
	| 'duplicate'
	| 'manifest'
	| 'import'
	| 'setup'
	| 'content'
	| 'assets'
	| 'cycle';

export interface RejectedMod {
	id: string;
	version: string;
	/** Shown to the player. */
	reason: string;
	code: ModProblemCode;
	/** The thrown error's stack, where an error was thrown (import, setup, content). */
	stack?: string;
}

export interface ResolveModsOptions {
	/** Plugins that are part of the build (stock). Always loaded first. */
	builtin: readonly Plugin[];
	/** Turns code text into a module namespace (`importModBundle` in every host). */
	importModule: (code: string) => Promise<unknown>;
	apiVersion?: string;
}

export interface ResolvedMods {
	/** Accepted mods' plugins, in the order of `bundles` (dependencies first when it matters). */
	plugins: Plugin[];
	/** Manifests of the accepted ones, same order. */
	accepted: ModManifest[];
	rejected: RejectedMod[];
	/** Parts of the accepted mods that name an asset (`visual.asset`), all present in their package. */
	partAssets: PartAssetRef[];
	/** Decoded assets of the accepted mods, by mod id. */
	assets: Map<string, DecodedAssets>;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** The deepest stack of an error and its causes: a setup failure's stack is the mod's own. */
function stackOf(e: unknown): string | undefined {
	let best: string | undefined;
	for (let at: unknown = e, i = 0; at instanceof Error && i < 5; at = at.cause, i++) {
		if (at.stack) best = at.stack;
	}
	return best;
}
/** Sorts a loader error into a problem code. */
function codeOf(e: unknown): ModProblemCode {
	const text = message(e);
	if (/setup failed|async setup/.test(text)) return 'setup';
	return 'content';
}

function isPlugin(value: unknown): value is Plugin {
	if (typeof value !== 'object' || value === null) return false;
	const p = value as Record<string, unknown>;
	const meta = p.meta as Record<string, unknown> | undefined;
	return (
		typeof meta === 'object' &&
		meta !== null &&
		typeof meta.id === 'string' &&
		typeof meta.version === 'string' &&
		typeof meta.api === 'string' &&
		typeof p.setup === 'function' &&
		Array.isArray(p.depends) &&
		Array.isArray(p.optional)
	);
}

/**
 * Imports, checks and orders mod bundles. A bundle that cannot be used is rejected with a reason
 * and the rest still load. A bundle whose dependency is a mod later in the list waits for it.
 * Never throws for a bad mod; the plugins returned boot together without error (each was tried
 * against the built-ins and the mods accepted before it).
 */
export async function resolveMods(
	bundles: readonly ModBundle[],
	options: ResolveModsOptions
): Promise<ResolvedMods> {
	const apiVersion = options.apiVersion ?? API_VERSION;
	const rejected: RejectedMod[] = [];
	const accepted: ModManifest[] = [];
	const plugins: Plugin[] = [];
	const versions = new Map<string, string>(options.builtin.map((p) => [p.meta.id, p.meta.version]));
	const partAssets: PartAssetRef[] = [];
	const assetsById = new Map<string, DecodedAssets>();
	const owners = new Map<string, string>(
		options.builtin.map((p) => [p.meta.id, 'a built-in plugin'])
	);
	const reject = (m: ModManifest, reason: string, code: ModProblemCode, error?: unknown): void => {
		const stack = error === undefined ? undefined : stackOf(error);
		rejected.push({ id: m.id, version: m.version, reason, code, ...(stack ? { stack } : {}) });
	};

	// Cheap, static checks first; dependency waits are resolved in passes below.
	let pending: ModBundle[] = [];
	for (const bundle of bundles) {
		const m = bundle.manifest;
		const owner = owners.get(m.id);
		if (owner) {
			reject(m, `plugin id "${m.id}" is already used by ${owner}; a mod cannot replace it`, 'duplicate');
			continue;
		}
		if (pending.some((b) => b.manifest.id === m.id)) {
			const first = pending.find((b) => b.manifest.id === m.id)!.manifest;
			reject(
				m,
				`duplicate plugin id "${m.id}": mod "${first.id}" ${first.version} and mod "${m.id}" ${m.version} are both installed`,
				'duplicate'
			);
			continue;
		}
		try {
			if (!satisfies(apiVersion, m.api)) {
				reject(m, `requires mod API "${m.api}" but this game provides ${apiVersion}`, 'api');
				continue;
			}
		} catch (e) {
			reject(m, `invalid api range: ${message(e)}`, 'api');
			continue;
		}
		pending.push(bundle);
	}

	for (let progress = true; progress && pending.length > 0;) {
		progress = false;
		const still: ModBundle[] = [];
		for (const bundle of pending) {
			const m = bundle.manifest;
			// Dependencies: must be built in or already accepted, with a matching version.
			let waiting = false;
			let failure: string | undefined;
			for (const [dep, range] of Object.entries(m.dependencies)) {
				const have = versions.get(dep);
				if (have === undefined) {
					if (pending.some((b) => b !== bundle && b.manifest.id === dep)) waiting = true;
					else failure = `needs "${dep}" ${range}, which is not installed or enabled`;
				} else if (!satisfies(have, range)) {
					failure = `needs "${dep}" ${range} but ${have} is installed`;
				}
				if (failure) break;
			}
			if (failure) {
				reject(m, failure, 'dependency');
				progress = true;
				continue;
			}
			if (waiting) {
				still.push(bundle);
				continue;
			}
			progress = true;

			let decoded: DecodedAssets = new Map();
			if (bundle.assets) {
				const checked = await decodeAssets(bundle.assets);
				if (!checked.ok) {
					reject(m, `its assets are not valid: ${checked.errors.join('; ')}`, 'assets');
					continue;
				}
				decoded = checked.assets;
			}

			let plugin: Plugin;
			try {
				const ns = await options.importModule(bundle.code);
				const candidate = (ns as { default?: unknown } | null)?.default;
				if (!isPlugin(candidate)) {
					reject(m, 'the code does not default-export a plugin (definePlugin(...))', 'import');
					continue;
				}
				plugin = candidate;
			} catch (e) {
				reject(m, `could not be loaded: ${message(e)}`, 'import', e);
				continue;
			}
			const meta = plugin.meta;
			if (meta.id !== m.id || meta.version !== m.version) {
				reject(
					m,
					`the manifest says ${m.id} ${m.version} but the code is plugin "${meta.id}" ${meta.version}`,
					'manifest'
				);
				continue;
			}
			try {
				const trial = loadPlugins([...options.builtin, ...plugins, plugin], { apiVersion });
				const off = trial.report.disabled.find((d) => d.id === m.id);
				if (off) {
					reject(m, off.reason, /mod API/.test(off.reason) ? 'api' : 'dependency');
					continue;
				}
				// A part's `visual.asset` must name a file the package ships: a typo is the mod's error,
				// reported at install time, not a part that silently loses its model.
				const refs: PartAssetRef[] = [];
				let missing: string | undefined;
				for (const { def, by } of trial.registries.parts.entries()) {
					const path = def.visual?.asset;
					if (by !== m.id || path === undefined) continue;
					if (!decoded.has(path)) {
						missing = `part "${def.id}" names the asset "${path}", which the package does not carry`;
						break;
					}
					refs.push({ part: def.id, mod: m.id, path });
					for (const [i, lod] of (def.visual?.lods ?? []).entries()) {
						if (!decoded.has(lod.asset)) {
							missing = `part "${def.id}" names the LOD asset "${lod.asset}", which the package does not carry`;
							break;
						}
						refs.push({ part: def.id, mod: m.id, path: lod.asset, lod: i + 1 });
					}
					if (missing) break;
				}
				// A crew portrait names an image the package ships (ADR 0313 point 4).
				for (const { def, by } of trial.registries.crewPortraits.entries()) {
					if (by !== m.id || missing) continue;
					const asset = decoded.get(def.image);
					if (!asset) {
						missing = `portrait "${def.id}" names the image "${def.image}", which the package does not carry`;
					} else if (asset.type === MOD_ASSET_TYPE) {
						missing = `portrait "${def.id}" names "${def.image}", which is not an image`;
					}
				}
				if (missing) {
					reject(m, missing, 'assets');
					continue;
				}
				partAssets.push(...refs);
			} catch (e) {
				reject(m, message(e), codeOf(e), e);
				continue;
			}
			plugins.push(plugin);
			accepted.push(m);
			assetsById.set(m.id, decoded);
			versions.set(m.id, m.version);
			owners.set(m.id, `mod "${m.id}" ${m.version}`);
		}
		pending = still;
	}
	for (const bundle of pending) {
		const m = bundle.manifest;
		const cycle = Object.keys(m.dependencies).filter((d) =>
			pending.some((b) => b.manifest.id === d)
		);
		reject(m, `depends on mods that wait for each other: ${cycle.join(', ')}`, 'cycle');
	}
	return { plugins, accepted, rejected, partAssets, assets: assetsById };
}
