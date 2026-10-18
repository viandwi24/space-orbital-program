<script lang="ts">
	/**
	 * The Launch screen (plan 094, ADR 0150; refs Launch): the site's pad or runway, a design it
	 * accepts, seats, the summary, then the flight.
	 */
	import { designLocks, loadWorldTech, NO_TREE, type WorldTech } from '../../lib/tech/world-tech';
	import { goto } from '$app/navigation';
	import {
		designCost,
		homeBodyOf,
		loadPlugins,
		sitesOf,
		type Site,
		type VesselDesign,
		type WorldInfo
	} from '@orbital/core';
	import { onMount } from 'svelte';
	import { loadContent, partLookup } from '../../lib/catalog';
	import { parseDesign, serialiseDesign } from '../../lib/design';
	import { designStats } from '../../lib/editor/stats';
	import { formatFunds, formatMass } from '../../lib/format';
	import {
		accepts,
		facilitiesOf,
		placementOf,
		saveLaunchChoice,
		seatsOf,
		toggleSeat,
		type Facility
	} from '../../lib/launch/launch-model';
	import { limitsOn, massUpgrade } from '../../lib/capacity';
	import { activePlugins } from '../../lib/mods/runtime';
	import { BUILTIN_PLUGINS } from '../../lib/builtins';
	import { GAME_NAME } from '../../lib/public/about';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import { loadDraft, saveDraft } from '../../lib/storage';
	import BackButton from '../../lib/ui/BackButton.svelte';
	import Icon from '../../lib/ui/Icon.svelte';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import Panel from '../../lib/ui/Panel.svelte';
	import StatCell from '../../lib/ui/StatCell.svelte';
	import { listEntries, memoryStore, withFallback } from '../../lib/vab/library';
	import { indexedDbStore } from '../../lib/vab/library-idb';
	import { activeWorldId } from '../../lib/worlds/worlds';
	import { fanText, launchRange, rangeModeOf, type LaunchRange } from '../../lib/range/range-model';

	interface Choice {
		key: string;
		name: string;
		design: VesselDesign;
		wet: number;
		cost: number;
		seats: number;
		parts: number;
		from: 'hangar' | 'library';
	}

	const { catalog, content } = loadContent();
	// the world's own system (plan 124): a Sol world's site is on `sol.earth` (fixed with plan 125)
	let registries = $state.raw(loadPlugins([...BUILTIN_PLUGINS, ...activePlugins()]).registries);
	const lookup = partLookup(catalog);
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(`/flight?load=${encodeURIComponent(id)}`),
		world: activeWorldId
	});

	/** Available crew of the world's newest save (plan 108, ADR 0152 point 5). */
	let roster = $state.raw<{ id: string; name: string; profession: string }[]>([]);
	let seated = $state.raw<{ member: string; part: number }[]>([]);

	let site = $state.raw<Site | null>(null);
	let designs = $state.raw<Choice[]>([]);
	let facilityId = $state<string | null>(null);
	let designKey = $state<string | null>(null);

	let limits = $state(false);
	const facilities = $derived(site ? facilitiesOf(site, registries.buildings, limits) : []);
	// an aircraft from the Hangar starts on a runway by default (plan 063, ADR 0161 point 3)
	const preferred = $derived(designs[0]?.design.aircraft === true ? 'runway' : 'pad');
	const facility = $derived(
		facilities.find((f) => f.id === facilityId) ??
			facilities.find((f) => f.kind === preferred) ??
			facilities[0] ??
			null
	);
	// an aircraft rolls out to a runway, anything else stands on a pad (plan 063, ADR 0161 point 3)
	const aircraftOf = (d: Choice): boolean => d.design.aircraft === true;
	const fitting = $derived(
		facility ? designs.filter((d) => accepts(facility, d.wet, aircraftOf(d))) : []
	);
	const tooHeavy = $derived(facility ? designs.filter((d) => !accepts(facility, d.wet)) : []);
	const chosen = $derived(fitting.find((d) => d.key === designKey) ?? fitting[0] ?? null);
	const body = $derived(site ? registries.bodies.get(site.body) : undefined);
	const seats = $derived(chosen ? seatsOf(chosen.design, registries.parts) : []);
	// range safety: the site's fan and a nominal estimate of the drops (plan 127, ADR 0155 point 6)
	let worldInfo = $state.raw<WorldInfo | null>(null);
	const range = $derived.by((): LaunchRange | null => {
		if (!site || !body || !chosen || !worldInfo) return null;
		const g = (6.6743e-11 * body.mass) / (body.radius * body.radius);
		const dv = designStats(chosen.design, content, 'sea-level', g)
			.rows.filter((r) => r.dv > 0)
			.map((r) => r.dv);
		const home = homeBodyOf(registries.bodies.list())?.id === body.id;
		const mode = rangeModeOf(worldInfo, registries.rules, registries.presets);
		return launchRange(mode, site, body, home, worldInfo, dv);
	});
	const dropText = (d: LaunchRange['drops'][number]): string =>
		d.place === 'orbit'
			? 'reaches orbit'
			: `falls ${Math.round((d.downrange ?? 0) / 1000)} km downrange, ${
					d.place === 'site' ? `on site "${d.site}"` : d.place === 'land' ? 'on land' : 'at sea'
				}`;
	$effect(() => {
		void chosen?.key;
		seated = [];
	});
	// the world's tech tree (plan 105, ADR 0154 point 4)
	let tech = $state<WorldTech>(NO_TREE);
	const locks = $derived(
		chosen ? designLocks(chosen.design, registries.techNodes.list(), registries.parts, tech) : []
	);

	function choiceOf(key: string, design: VesselDesign, from: Choice['from']): Choice {
		const g = body ? (6.6743e-11 * body.mass) / (body.radius * body.radius) : 9.81;
		const stats = designStats(design, content, 'sea-level', g);
		const seats = design.parts.reduce(
			(n, p) => n + (registries.parts.get(p.part)?.crewCapacity ?? 0),
			0
		);
		return {
			key,
			name: design.name,
			design,
			wet: stats.wetMass,
			cost: designCost(design, registries).total,
			seats,
			parts: stats.partCount,
			from
		};
	}

	onMount(() => {
		void (async () => {
			const worlds = await saves.worldsService();
			const info = await worlds.startInfo(activeWorldId());
			if (info)
				registries = loadPlugins([...BUILTIN_PLUGINS, ...activePlugins()], {
					system: { id: info.systemId, variant: info.variant }
				}).registries;
			site = sitesOf(info ?? { sites: [] })[0] ?? null;
			worldInfo = info ?? null;
			limits = limitsOn(info, registries);
			const list: Choice[] = [];
			const draft = loadDraft();
			if (draft) {
				const parsed = parseDesign(draft, lookup);
				if (parsed.ok) list.push(choiceOf('hangar', parsed.design, 'hangar'));
			}
			const store = withFallback(
				typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore()
			);
			for (const e of await listEntries(store, lookup, 'vessel'))
				if (e.ok && !list.some((d) => d.name === e.design.name && d.from === 'hangar'))
					list.push(choiceOf(e.record.id, e.design, 'library'));
			designs = list;
			await saves.refresh();
			const newest = saves.entries.find((e) => e.ok);
			if (newest?.ok) {
				const save = await saves.read(newest.meta.id);
				roster = (save.sim.crew?.members ?? [])
					.filter((m) => m.status === 'available')
					.map((m) => ({ id: m.id, name: m.name, profession: m.profession }));
			}
			tech = await loadWorldTech(saves, activeWorldId());
		})();
	});

	function launch(): void {
		if (!site || !facility || !chosen || !body || locks.length > 0) return;
		saveDraft(serialiseDesign(chosen.design));
		saveLaunchChoice({
			facility: facility.id,
			placement: placementOf(site, facility, body.radius),
			...(seated.length > 0 ? { crew: seated } : {})
		});
		void goto('/flight');
	}

	const limit = (f: Facility): string =>
		f.massLimit === null ? 'Any vessel' : `Up to ${formatMass(f.massLimit * 1000)}`;
</script>

<PageMeta title="Launch · {GAME_NAME}" />

<main class="launch">
	<header>
		<BackButton href="/vab" label="Back to the Hangar" />
		<div class="title">
			<span class="cap">Launch</span>
			<h1>{site?.name ?? 'Space Center'}</h1>
		</div>
	</header>

	<div class="cols">
		<Panel title="Facility" data-testid="launch-facilities">
			<div class="list" role="radiogroup" aria-label="Launch facility">
				{#each facilities as f (f.id)}
					<button
						type="button"
						role="radio"
						class="row"
						aria-checked={facility?.id === f.id}
						data-testid="launch-facility-{f.id}"
						onclick={() => (facilityId = f.id)}
					>
						<span class="tile"><Icon name={f.kind === 'pad' ? 'launch' : 'map'} size={16} /></span>
						<span class="text"
							><span class="name">{f.label}</span><span class="sub">{limit(f)}</span></span
						>
						<span class="dot" aria-hidden="true"></span>
					</button>
				{:else}
					<p class="empty">This site has no launch pad or runway. Build one in the Space Center.</p>
				{/each}
			</div>
		</Panel>

		<Panel title="Vessel" data-testid="launch-designs">
			<div class="list" role="radiogroup" aria-label="Vessel">
				{#each fitting as d (d.key)}
					<button
						type="button"
						role="radio"
						class="row"
						aria-checked={chosen?.key === d.key}
						data-testid="launch-design"
						onclick={() => (designKey = d.key)}
					>
						<span class="tile"><Icon name="vessel" size={16} /></span>
						<span class="text"
							><span class="name">{d.name}</span><span class="sub"
								>{d.from === 'hangar' ? 'From the Hangar' : 'Library'} · {formatMass(d.wet)}</span
							></span
						>
						<span class="dot" aria-hidden="true"></span>
					</button>
				{:else}
					<p class="empty">
						{designs.length === 0
							? 'No vessel yet. Build one in the Hangar.'
							: 'No vessel fits this facility. Choose another, or build a lighter one.'}
					</p>
				{/each}
				<!-- designs over this pad's limit, with the upgrade that takes them (plan 096, ADR 0123) -->
				{#each tooHeavy as d (d.key)}
					<p class="over" data-testid="launch-over-limit">
						<span class="name">{d.name}</span> · {formatMass(d.wet)}: {massUpgrade(
							registries.buildings,
							d.wet
						) ?? 'no pad takes this mass'}
					</p>
				{/each}
			</div>
			<a class="edit" href="/vab">Edit in Hangar</a>
		</Panel>

		<Panel title="Flight" data-testid="launch-summary">
			<div class="stats">
				<StatCell label="Mass" value={chosen ? formatMass(chosen.wet) : null} />
				<StatCell label="Cost" value={chosen ? formatFunds(chosen.cost) : null} />
				<StatCell label="Parts" value={chosen?.parts} />
			</div>
			<span class="cap seats-cap">Crew · {seated.length} of {chosen?.seats ?? 0} seats</span>
			<div class="seats">
				{#each seats as p (p.part)}
					{#each Array.from({ length: p.capacity }) as _, i (i)}
						{@const who = seated.filter((s) => s.part === p.part)[i]}
						<span class="seat" class:on={who} title="{p.title}, seat {i + 1}"
							>{who
								? (roster.find((r) => r.id === who.member)?.name ?? who.member).slice(0, 2)
								: '[—]'}</span
						>
					{/each}
				{/each}
			</div>
			{#if roster.length > 0 && seats.length > 0}
				<div class="crew" role="group" aria-label="Available crew">
					{#each roster as m (m.id)}
						<button
							type="button"
							class="member"
							aria-pressed={seated.some((s) => s.member === m.id)}
							data-testid="launch-crew-{m.id}"
							onclick={() => (seated = toggleSeat(seated, seats, m.id))}
						>
							<span class="mname">{m.name}</span><span class="sub">{m.profession}</span>
						</button>
					{/each}
				</div>
			{:else}
				<p class="note">
					{seats.length === 0
						? 'This vessel has no seats.'
						: 'No crew available: hire in the Astronaut Complex.'}
				</p>
			{/if}
			{#each locks as l (l.title)}
				<p class="locked" role="status" data-testid="launch-locked">
					"{l.title}" is locked: research "{l.node}" in R&D.
				</p>
			{/each}
			{#if range}
				<div class="range" data-testid="launch-range">
					<span class="cap seats-cap"
						>Range safety · {range.mode === 'hard' ? 'enforced' : 'penalties'}</span
					>
					<p class="note">
						Safe fan: {fanText(range.fan)}{range.east ? '' : '; the eastward ascent is outside it'}.
					</p>
					{#each range.drops as d (d.stage)}
						<p class="note" data-testid="launch-drop">Stage {d.stage + 1} {dropText(d)}.</p>
					{/each}
					{#if range.penalty.funds > 0}
						<p class="warn" role="status" data-testid="launch-range-penalty">
							{range.mode === 'hard'
								? 'Staging over land or a site will be refused in flight.'
								: `Estimated penalty: ${formatFunds(range.penalty.funds)} and ${range.penalty.reputation} reputation.`}
						</p>
					{/if}
					<p class="note">An estimate: each drop is judged in flight, when the stage separates.</p>
				</div>
			{/if}
			<button
				type="button"
				class="go"
				disabled={!chosen || !facility || locks.length > 0}
				data-testid="launch-go"
				onclick={launch}
			>
				<Icon name="launch" size={18} />
				{facility?.kind === 'runway' ? 'Roll out to runway' : 'Launch from pad'}
			</button>
		</Panel>
	</div>
</main>

<style>
	.launch {
		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		padding: var(--margin-hud);
		background: var(--bg-ground);
	}
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.title {
		display: grid;
		gap: 0.25rem;
	}
	.cap {
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		line-height: 1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		align-items: start;
		max-width: 72rem;
	}
	.list {
		display: grid;
		gap: 2px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: 3.25rem;
		padding: 0 0.75rem 0 0.5rem;
		border: 0;
		border-radius: 0.6875rem;
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.row:hover,
	.row[aria-checked='true'] {
		background: var(--surface-tile);
	}
	.row:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.tile {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.875rem;
		height: 1.875rem;
		border-radius: 0.5625rem;
		background: var(--surface-tile);
		color: var(--text-secondary);
	}
	.text {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
	}
	.sub {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.dot {
		width: 4px;
		height: 4px;
		margin-left: auto;
		border-radius: 50%;
	}
	.row[aria-checked='true'] .dot {
		background: var(--text-primary);
	}
	.empty,
	.over,
	.note {
		margin: 0.5rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.edit {
		display: inline-block;
		margin: 0.5rem;
		font-size: var(--t-small);
		color: var(--accent-text);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.seats-cap {
		display: block;
		margin: 0.75rem 0.375rem 0.375rem;
	}
	.seats {
		display: flex;
		gap: 0.375rem;
		padding: 0 0.375rem;
	}
	.seat {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--surface-inset);
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.seat.on {
		background: var(--selected-bg);
		color: var(--selected-fg);
		font-weight: 700;
	}
	.crew {
		display: grid;
		gap: 2px;
		margin: 0.5rem 0;
	}
	.member {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.375rem 0.5rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		cursor: pointer;
	}
	.member:hover,
	.member[aria-pressed='true'] {
		background: var(--surface-tile);
	}
	.mname {
		font-weight: 600;
	}
	.locked,
	.warn {
		margin: 0.5rem 0.375rem 0;
		font-size: var(--t-small);
		color: var(--warn);
	}
	.go {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		height: 2.75rem;
		margin-top: 0.75rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--selected-bg);
		color: var(--selected-fg);
		font: inherit;
		font-size: var(--t-button);
		font-weight: 700;
		cursor: pointer;
	}
	.go:disabled {
		background: var(--surface-button);
		color: var(--text-disabled);
		cursor: default;
	}
	@media (max-width: 899px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
