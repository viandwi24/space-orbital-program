/**
 * The Mods page as a mod manager (plan 376, ADR 0312): one card per mod, built-in or installed,
 * with its status chip, what it adds by kind, its dependencies and API range checked, and the
 * actions it allows; then search, filter and sort. Pure: the records, the runtime's status and
 * the registries' owners in, cards out. The counts come from the registries the loader filled
 * (`Registry.owner`), the same data the Developer page's viewers and loader log read.
 */
import { satisfies, type PatchReport, type Registries } from '@orbital/core';
import type { ModStatus } from './manager.svelte';
import type { ModRecord } from './store';
import { licenceLabel, sourceLabel } from './format';

/** What the counts group registrations into, in the order the card shows them. */
export const COUNT_KINDS = [
	{ key: 'parts', label: 'parts', one: 'part', registries: ['parts'], tab: 'parts' },
	{
		key: 'blueprints',
		label: 'blueprints',
		one: 'blueprint',
		registries: ['blueprints'],
		tab: 'blueprints'
	},
	{
		key: 'crew',
		label: 'crew content',
		one: 'crew content',
		registries: ['crewTraits', 'crewNames'],
		tab: 'crew'
	},
	{
		key: 'programs',
		label: 'programs',
		one: 'program',
		registries: ['autopilots'],
		tab: 'programs'
	},
	{ key: 'panels', label: 'panels', one: 'panel', registries: ['panels'], tab: 'panels' },
	{ key: 'overlays', label: 'overlays', one: 'overlay', registries: ['overlays'], tab: 'overlays' },
	{
		key: 'world',
		label: 'world content',
		one: 'world content',
		registries: [
			'bodies',
			'buildings',
			'systems',
			'techNodes',
			'missions',
			'contracts',
			'scenarios'
		],
		tab: 'mods'
	}
] as const satisfies readonly {
	key: string;
	label: string;
	one: string;
	registries: readonly (keyof Registries)[];
	tab: string;
}[];
export type CountKey = (typeof COUNT_KINDS)[number]['key'];

/** Registrations per plugin per kind, from the registries' owners. */
export function countsByPlugin(
	registries: Registries
): Map<string, Partial<Record<CountKey, number>>> {
	const out = new Map<string, Partial<Record<CountKey, number>>>();
	for (const kind of COUNT_KINDS) {
		for (const name of kind.registries) {
			const reg = registries[name] as {
				list(): readonly { id: string }[];
				owner(id: string): string | undefined;
			};
			for (const def of reg.list()) {
				const by = reg.owner(def.id);
				if (!by) continue;
				const row = out.get(by) ?? {};
				row[kind.key] = (row[kind.key] ?? 0) + 1;
				out.set(by, row);
			}
		}
	}
	return out;
}

/** The Developer page's viewer of one kind, filtered by a mod. */
export const viewerHref = (tab: string, mod: string): string =>
	`/developer?tab=${encodeURIComponent(tab)}&mod=${encodeURIComponent(mod)}`;

export type ChipTone = 'ok' | 'warn' | 'bad' | 'off' | 'pending';
export interface ModChip {
	tone: ChipTone;
	label: string;
	/** Why, for the tooltip and the card's note. */
	reason?: string;
}

export interface ModCard {
	id: string;
	title: string;
	version: string;
	author: string | null;
	licence: string;
	description: string | null;
	/** "Built-in", the file name or the address. */
	source: string;
	/** Characters of code plus asset bytes; null for a built-in. */
	size: number | null;
	builtin: boolean;
	enabled: boolean;
	chip: ModChip;
	counts: { key: CountKey; label: string; n: number; href: string }[];
	api: { range: string; ok: boolean };
	deps: { id: string; range: string; ok: boolean; why: string | null }[];
	patches: { total: number; failed: number };
	installedAt: number | null;
	/** An installed mod can be removed; a built-in cannot. */
	removable: boolean;
	/** Downloaded from an address: Update fetches it again. */
	updateUrl: string | null;
}

const chipOf = (status: ModStatus, failedPatches: number, badDeps: number): ModChip => {
	switch (status.kind) {
		case 'failed':
			return { tone: 'bad', label: 'Failed', reason: status.reason };
		case 'untrusted':
			return { tone: 'bad', label: 'Blocked', reason: status.reason };
		case 'starts-after-reload':
			return {
				tone: 'pending',
				label: 'Needs a reload',
				reason: 'It starts when the page reloads.'
			};
		case 'stops-after-reload':
			return {
				tone: 'pending',
				label: 'Needs a reload',
				reason: 'It stops when the page reloads.'
			};
		case 'off':
			return { tone: 'off', label: 'Off' };
		case 'running':
			if (failedPatches > 0 || badDeps > 0)
				return {
					tone: 'warn',
					label: 'Loaded with warnings',
					reason: [
						failedPatches > 0
							? `${failedPatches} patch${failedPatches === 1 ? '' : 'es'} did not apply`
							: '',
						badDeps > 0 ? `${badDeps} dependenc${badDeps === 1 ? 'y' : 'ies'} not met` : ''
					]
						.filter(Boolean)
						.join('; ')
				};
			return { tone: 'ok', label: 'Loaded' };
	}
};

export interface CardInput {
	builtins: readonly {
		id: string;
		title: string;
		version: string;
		api: string;
		description?: string;
	}[];
	records: readonly ModRecord[];
	statusOf: (record: ModRecord) => ModStatus;
	patchesOf: (id: string) => readonly PatchReport[];
	counts: ReadonlyMap<string, Partial<Record<CountKey, number>>>;
	apiVersion: string;
}

/** Every mod as a card: built-ins first (always on), then the installed ones in boot order. */
export function modCards(input: CardInput): ModCard[] {
	// what can satisfy a dependency: the built-ins, and installed mods that are on
	const present = new Map<string, string>([
		...input.builtins.map((b) => [b.id, b.version] as const),
		...input.records.filter((r) => r.enabled).map((r) => [r.id, r.manifest.version] as const)
	]);
	const countsOf = (id: string): ModCard['counts'] =>
		COUNT_KINDS.flatMap((k) => {
			const n = input.counts.get(id)?.[k.key] ?? 0;
			return n > 0
				? [{ key: k.key, label: n === 1 ? k.one : k.label, n, href: viewerHref(k.tab, id) }]
				: [];
		});
	const patchesOf = (id: string) => {
		const all = input.patchesOf(id);
		return { total: all.length, failed: all.filter((p) => p.disabled !== undefined).length };
	};
	const builtins = input.builtins.map((b): ModCard => {
		const patches = patchesOf(b.id);
		return {
			id: b.id,
			title: b.title,
			version: b.version,
			author: null,
			licence: 'part of the game',
			description: b.description ?? null,
			source: 'Built-in',
			size: null,
			builtin: true,
			enabled: true,
			chip: chipOf({ kind: 'running' }, patches.failed, 0),
			counts: countsOf(b.id),
			api: { range: b.api, ok: satisfies(input.apiVersion, b.api) },
			deps: [],
			patches,
			installedAt: null,
			removable: false,
			updateUrl: null
		};
	});
	const installed = [...input.records]
		.sort((a, b) => a.order - b.order)
		.map((r): ModCard => {
			const deps = Object.entries(r.manifest.dependencies ?? {}).map(([id, range]) => {
				const have = present.get(id);
				const ok = have !== undefined && satisfies(have, range);
				return {
					id,
					range,
					ok,
					why: have === undefined ? 'not installed or off' : ok ? null : `${have} installed`
				};
			});
			const patches = patchesOf(r.id);
			const status = input.statusOf(r);
			return {
				id: r.id,
				title: r.manifest.title ?? r.id,
				version: r.manifest.version,
				author: r.manifest.author ?? null,
				licence: licenceLabel(r.manifest),
				description: r.manifest.description ?? null,
				source: sourceLabel(r.source),
				size: r.code.length + Object.values(r.assets ?? {}).reduce((n, a) => n + a.size, 0),
				builtin: false,
				enabled: r.enabled,
				chip: chipOf(status, patches.failed, deps.filter((d) => !d.ok).length),
				counts: countsOf(r.id),
				api: { range: r.manifest.api, ok: satisfies(input.apiVersion, r.manifest.api) },
				deps,
				patches,
				installedAt: r.installedAt,
				removable: true,
				updateUrl: r.source.kind === 'url' ? r.source.url : null
			};
		});
	return [...builtins, ...installed];
}

export type ModFilter = 'all' | 'enabled' | 'disabled' | 'errors';
export type ModSort = 'order' | 'name' | 'recent';
export const FILTER_LABELS: Record<ModFilter, string> = {
	all: 'All',
	enabled: 'On',
	disabled: 'Off',
	errors: 'Problems'
};
export const SORT_LABELS: Record<ModSort, string> = {
	order: 'Load order',
	name: 'Name',
	recent: 'Recently installed'
};

/** The cards to show: searched (name, id, author, description), filtered and sorted. */
export function shownCards(
	cards: readonly ModCard[],
	opts: { query: string; filter: ModFilter; sort: ModSort }
): ModCard[] {
	const q = opts.query.trim().toLowerCase();
	const hit = (c: ModCard): boolean =>
		q === '' ||
		[c.title, c.id, c.author ?? '', c.description ?? ''].some((t) => t.toLowerCase().includes(q));
	const keep = (c: ModCard): boolean =>
		opts.filter === 'enabled'
			? c.enabled
			: opts.filter === 'disabled'
				? !c.enabled
				: opts.filter === 'errors'
					? c.chip.tone === 'bad' || c.chip.tone === 'warn' || !c.api.ok
					: true;
	const out = cards.filter((c) => hit(c) && keep(c));
	if (opts.sort === 'name') out.sort((a, b) => a.title.localeCompare(b.title));
	if (opts.sort === 'recent') out.sort((a, b) => (b.installedAt ?? -1) - (a.installedAt ?? -1));
	return out;
}

/** A hue for a mod's monogram tile, the same for an id everywhere. */
export function modHue(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) % 360;
}

/** Up to two letters for the monogram: "Guidance Computer" -> "GC", "autodock" -> "AU". */
export function monogram(title: string): string {
	const words = title.split(/[\s._-]+/).filter(Boolean);
	return (
		words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)
	).toUpperCase();
}
