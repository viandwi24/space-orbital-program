/**
 * What the developer viewers load (plan 375, ADR 0311 point 2): the plugin list a world boots
 * (built-ins, then the installed mods that are on), or with the "Include disabled mods" switch the
 * turned-off mods too. Also, for every registered item, which plugin registered it and which
 * patched it, from the load report. Pure but `devPlugins`, which reads the mod store.
 */
import type { LoadReport, PatchTarget, Plugin, RegistryKind } from '@orbital/core';
import { BUILTIN_PLUGINS } from '../builtins';
import { activePlugins, evaluateMods } from '../mods/runtime';
import { openModStore } from '../mods/store-idb';

export const INCLUDE_DISABLED_KEY = 'orbital.dev.includeDisabled';

export interface DevPlugins {
	plugins: Plugin[];
	/** Mod ids booted only because of the switch (they are off in Mods). */
	extra: string[];
}

/** The plugin list for the viewers. */
export async function devPlugins(includeDisabled: boolean): Promise<DevPlugins> {
	const base = [...BUILTIN_PLUGINS, ...activePlugins()];
	if (!includeDisabled) return { plugins: base, extra: [] };
	try {
		const records = await (await openModStore()).store.list();
		const all = await evaluateMods(records, { includeDisabled: true });
		const on = new Set(activePlugins().map((p) => p.meta.id));
		return {
			plugins: [...BUILTIN_PLUGINS, ...all.plugins],
			extra: all.plugins.map((p) => p.meta.id).filter((id) => !on.has(id))
		};
	} catch {
		return { plugins: base, extra: [] };
	}
}

export function readIncludeDisabled(): boolean {
	try {
		return globalThis.localStorage?.getItem(INCLUDE_DISABLED_KEY) === '1';
	} catch {
		return false;
	}
}
export function saveIncludeDisabled(on: boolean): void {
	try {
		globalThis.localStorage?.setItem(INCLUDE_DISABLED_KEY, on ? '1' : '0');
	} catch {
		// blocked storage: the switch lasts for this page
	}
}

/** Where one registered item came from. */
export interface ItemOrigin {
	/** The plugin that registered it. */
	by: string;
	/** Plugins whose patches changed it, in apply order (no repeats). */
	patchedBy: string[];
	/** Each change: which patch, by whom, which field, from and to. */
	changes: Array<{ patch: string; by: string; path: string; from: unknown; to: unknown }>;
}

/** Origins of every item of `kind` (a registry kind; patches reach the patchable ones). */
export function originsOf(report: LoadReport, kind: RegistryKind): Map<string, ItemOrigin> {
	const out = new Map<string, ItemOrigin>();
	for (const e of report.registered[kind] ?? [])
		out.set(e.id, { by: e.by, patchedBy: [], changes: [] });
	const target = kind as PatchTarget;
	for (const p of report.patches) {
		if (p.target !== target || p.disabled) continue;
		for (const c of p.changes) {
			const o = out.get(c.entry);
			if (!o) continue;
			if (!o.patchedBy.includes(p.by)) o.patchedBy.push(p.by);
			o.changes.push({ patch: p.id, by: p.by, path: c.path, from: c.from, to: c.to });
		}
	}
	return out;
}

/** True when `origin` belongs to `mod`: registered or patched by it. */
export const touchedBy = (origin: ItemOrigin | undefined, mod: string | null): boolean =>
	mod === null || (!!origin && (origin.by === mod || origin.patchedBy.includes(mod)));

/** The plugins that register or patch an item of `kind`, with counts, in boot order. */
export function modsOf(
	report: LoadReport,
	origins: ReadonlyMap<string, ItemOrigin>
): Array<{ id: string; registered: number; patched: number }> {
	const counts = new Map<string, { registered: number; patched: number }>();
	for (const o of origins.values()) {
		const c = counts.get(o.by) ?? { registered: 0, patched: 0 };
		c.registered++;
		counts.set(o.by, c);
		for (const by of o.patchedBy) {
			const p = counts.get(by) ?? { registered: 0, patched: 0 };
			p.patched++;
			counts.set(by, p);
		}
	}
	return report.order.filter((id) => counts.has(id)).map((id) => ({ id, ...counts.get(id)! }));
}

/** A field change as short text: `mass: 120 → 90`. */
export function changeText(c: ItemOrigin['changes'][number]): string {
	const v = (x: unknown): string => {
		const s = JSON.stringify(x);
		return s === undefined ? '—' : s.length > 40 ? `${s.slice(0, 37)}…` : s;
	};
	return `${c.path}: ${v(c.from)} → ${v(c.to)}`;
}
