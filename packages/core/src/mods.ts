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

export const MOD_PACKAGE_FORMAT = 'orbital-mod';
export const MOD_PACKAGE_VERSION = 1;
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
	/** Other plugins this one needs: plugin id to version range. Built-ins (`stock`) count. */
	dependencies: z.record(pluginIdSchema, rangeSchema).default({})
});
export type ModManifest = z.output<typeof modManifestSchema>;

export const modPackageSchema = z.strictObject({
	format: z.literal(MOD_PACKAGE_FORMAT),
	formatVersion: z.literal(MOD_PACKAGE_VERSION),
	manifest: modManifestSchema,
	code: z.string().min(1).max(MAX_MOD_CODE_LENGTH),
	/** Hex SHA-256 of `code` (UTF-8). */
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
	const actual = await modCodeHash(parsed.data.code);
	if (actual !== parsed.data.sha256) {
		return {
			ok: false,
			errors: ['The code does not match the package fingerprint: the file was edited or damaged.']
		};
	}
	return { ok: true, package: parsed.data };
}

/** Builds package text from a manifest and the mod's code (used by the build tool). */
export async function createModPackage(manifest: unknown, code: string): Promise<ModPackage> {
	return modPackageSchema.parse({
		format: MOD_PACKAGE_FORMAT,
		formatVersion: MOD_PACKAGE_VERSION,
		manifest,
		code,
		sha256: await modCodeHash(code)
	});
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
}

export interface RejectedMod {
	id: string;
	version: string;
	/** Shown to the player. */
	reason: string;
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
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

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
	const owners = new Map<string, string>(
		options.builtin.map((p) => [p.meta.id, 'a built-in plugin'])
	);
	const reject = (m: ModManifest, reason: string): void => {
		rejected.push({ id: m.id, version: m.version, reason });
	};

	// Cheap, static checks first; dependency waits are resolved in passes below.
	let pending: ModBundle[] = [];
	for (const bundle of bundles) {
		const m = bundle.manifest;
		const owner = owners.get(m.id);
		if (owner) {
			reject(m, `plugin id "${m.id}" is already used by ${owner}; a mod cannot replace it`);
			continue;
		}
		if (pending.some((b) => b.manifest.id === m.id)) {
			const first = pending.find((b) => b.manifest.id === m.id)!.manifest;
			reject(
				m,
				`duplicate plugin id "${m.id}": mod "${first.id}" ${first.version} and mod "${m.id}" ${m.version} are both installed`
			);
			continue;
		}
		try {
			if (!satisfies(apiVersion, m.api)) {
				reject(m, `requires mod API "${m.api}" but this game provides ${apiVersion}`);
				continue;
			}
		} catch (e) {
			reject(m, `invalid api range: ${message(e)}`);
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
				reject(m, failure);
				progress = true;
				continue;
			}
			if (waiting) {
				still.push(bundle);
				continue;
			}
			progress = true;

			let plugin: Plugin;
			try {
				const ns = await options.importModule(bundle.code);
				const candidate = (ns as { default?: unknown } | null)?.default;
				if (!isPlugin(candidate)) {
					reject(m, 'the code does not default-export a plugin (definePlugin(...))');
					continue;
				}
				plugin = candidate;
			} catch (e) {
				reject(m, `could not be loaded: ${message(e)}`);
				continue;
			}
			const meta = plugin.meta;
			if (meta.id !== m.id || meta.version !== m.version) {
				reject(
					m,
					`the manifest says ${m.id} ${m.version} but the code is plugin "${meta.id}" ${meta.version}`
				);
				continue;
			}
			try {
				const trial = loadPlugins([...options.builtin, ...plugins, plugin], { apiVersion });
				const off = trial.report.disabled.find((d) => d.id === m.id);
				if (off) {
					reject(m, off.reason);
					continue;
				}
			} catch (e) {
				reject(m, message(e));
				continue;
			}
			plugins.push(plugin);
			accepted.push(m);
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
		reject(m, `depends on mods that wait for each other: ${cycle.join(', ')}`);
	}
	return { plugins, accepted, rejected };
}
