/**
 * The mods this page load runs (plan 046, ADR 0057). `initModRuntime` reads the installed records,
 * checks that each enabled mod is still the code the player trusted, and resolves them with the
 * core loader; everything else (catalogue, Worker start, save checks) reads the result
 * synchronously. The set is fixed for the life of the page: changes need a reload.
 */
import {
	importModBundle,
	installModSdk,
	loadPlugins,
	modPackageFingerprint,
	resolveMods,
	type ModBundle,
	type PatchReport,
	type Plugin
} from '@orbital/core';
import * as sdk from '@orbital/sdk';
import { BUILTIN_PLUGINS } from '../builtins';
import type { ModRecord, ModStore } from './store';

export type ModState =
	| { kind: 'loaded' }
	| { kind: 'disabled' }
	/** Enabled but not booted: it threw, clashed, or needs something missing. */
	| { kind: 'failed'; reason: string }
	/** Enabled but its code is not what the player trusted. */
	| { kind: 'untrusted'; reason: string };

export interface ModEntry {
	record: ModRecord;
	state: ModState;
}

export interface ModRuntime {
	entries: ModEntry[];
	/** Plugins of the mods that booted, in boot order (after stock). */
	plugins: Plugin[];
	/** The same mods as bundles, for the sim Worker. */
	bundles: ModBundle[];
	/** Checked `.glb` bytes by part definition id, for parts whose `visual.asset` names a file a mod ships (ADR 0076). */
	partAssets: Map<string, Uint8Array>;
	/** Every data patch of the booted set, in apply order, with what it changed (plan 079). */
	patches: PatchReport[];
}

const EMPTY: ModRuntime = {
	entries: [],
	plugins: [],
	bundles: [],
	partAssets: new Map(),
	patches: []
};
let current: ModRuntime = EMPTY;

export interface EvaluateOptions {
	importModule?: (code: string) => Promise<unknown>;
	builtin?: readonly Plugin[];
}

/** Decide what runs for `records`. Pure of storage; the sdk is installed for the importer. */
export async function evaluateMods(
	records: readonly ModRecord[],
	options: EvaluateOptions = {}
): Promise<ModRuntime> {
	installModSdk(sdk);
	const states = new Map<string, ModState>();
	const candidates: ModBundle[] = [];
	for (const record of records) {
		if (!record.enabled) {
			states.set(record.id, { kind: 'disabled' });
			continue;
		}
		const actual = await modPackageFingerprint(record.code, record.assets);
		if (actual !== record.trusted || actual !== record.sha256) {
			states.set(record.id, {
				kind: 'untrusted',
				reason: 'its code changed since you trusted it; install it again to review it'
			});
			continue;
		}
		candidates.push({
			manifest: record.manifest,
			code: record.code,
			...(record.assets ? { assets: record.assets } : {})
		});
	}
	const resolved = await resolveMods(candidates, {
		builtin: options.builtin ?? [...BUILTIN_PLUGINS],
		importModule: options.importModule ?? importModBundle
	});
	for (const r of resolved.rejected) states.set(r.id, { kind: 'failed', reason: r.reason });
	for (const m of resolved.accepted) states.set(m.id, { kind: 'loaded' });
	const bootedIds = new Set(resolved.accepted.map((m) => m.id));
	const partAssets = new Map<string, Uint8Array>();
	for (const ref of resolved.partAssets) {
		const asset = resolved.assets.get(ref.mod)?.get(ref.path);
		// a lower-detail model is keyed like the renderer's `lodAssetKey` (plan 065, ADR 0160)
		if (asset) partAssets.set(ref.lod ? `${ref.part}#lod${ref.lod}` : ref.part, asset.bytes);
	}
	// The booted set loads once more, headless, for what its patches changed: the same list and
	// order the sim boots, so the mod manager shows what a flight will use.
	const builtin = options.builtin ?? [...BUILTIN_PLUGINS];
	let patches: PatchReport[] = [];
	try {
		patches = loadPlugins([...builtin, ...resolved.plugins]).report.patches;
	} catch {
		patches = [];
	}
	return {
		entries: records.map((record) => ({
			record,
			state: states.get(record.id) ?? { kind: 'failed', reason: 'it was not loaded' }
		})),
		plugins: resolved.plugins,
		bundles: candidates.filter((b) => bootedIds.has(b.manifest.id)),
		partAssets,
		patches
	};
}

/** Load the installed mods; call once per page load before anything reads the runtime. */
export async function initModRuntime(
	store: ModStore,
	options: EvaluateOptions = {}
): Promise<ModRuntime> {
	try {
		current = await evaluateMods(await store.list(), options);
	} catch {
		current = EMPTY; // a store that cannot be read means stock only; the game still starts
	}
	return current;
}

export const modRuntime = (): ModRuntime => current;
export const activePlugins = (): Plugin[] => current.plugins;
export const activeBundles = (): ModBundle[] => current.bundles;
export const activePartAssets = (): ReadonlyMap<string, Uint8Array> => current.partAssets;

/** Test support. */
export function resetModRuntime(next: ModRuntime = EMPTY): void {
	current = next;
}
