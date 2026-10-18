<script lang="ts">
	import type { Snippet } from 'svelte';
	/**
	 * The Mission Center's overlay (plan 113, refs `Map.dc.html`): the world capsule and the
	 * `Map | Mission Center` switch on top, Tracking with its filters and the crew and agency on the
	 * left, Upcoming and Contracts on the right, the selected object's card at the bottom, the layer
	 * toggles bottom right, and labels and the Network layer (plan 115) over the canvas.
	 */
	import NetworkLayer from '../comms/NetworkLayer.svelte';
	import type { ScreenNetwork } from '../comms/network-model';
	import BackButton from '../ui/BackButton.svelte';
	import Button from '../ui/Button.svelte';
	import Capsule from '../ui/Capsule.svelte';
	import ListRow from '../ui/ListRow.svelte';
	import Panel from '../ui/Panel.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import StatCell from '../ui/StatCell.svelte';
	import {
		TRACK_FILTERS,
		timeUntil,
		type MapLabel,
		type ObjectCard,
		type TrackFilter,
		type TrackRow,
		type UpcomingEvent
	} from './model';

	export interface Layers {
		orbits: boolean;
		network: boolean;
		labels: boolean;
	}

	let {
		worldName,
		clock,
		warp,
		now,
		filter,
		onfilter,
		rows,
		selected,
		onselect,
		upcoming,
		onwarp,
		contracts,
		crew,
		agency,
		card,
		onfly,
		canFly,
		layers,
		onlayers,
		labels,
		network,
		note,
		planningOpen = false,
		onplanning,
		planning
	}: {
		worldName: string;
		clock: string;
		warp: number;
		now: number;
		filter: TrackFilter;
		onfilter: (f: TrackFilter) => void;
		rows: readonly TrackRow[];
		selected: string | null;
		onselect: (key: string | null) => void;
		upcoming: readonly UpcomingEvent[];
		onwarp: (e: UpcomingEvent) => void;
		contracts: readonly { id: string; label: string; progress: number; status: string }[];
		crew: readonly { id: string; name: string; sub: string }[];
		agency: { funds: string; science: string; reputation: string } | null;
		card: ObjectCard | null;
		onfly: () => void;
		/** The `Map` tab flies the save's vessel; false when there is none. */
		canFly: boolean;
		layers: Layers;
		onlayers: (l: Layers) => void;
		/** Labels in CSS pixels: objects on screen and clusters of close vessels. */
		labels: readonly MapLabel[];
		/** The Network layer in CSS pixels (plan 115, ADR 0158). */
		network: ScreenNetwork;
		note: string | null;
		/** The comms planning panel (plan 118, ADR 0163 point 6), drawn in place of the card while open. */
		planningOpen?: boolean;
		onplanning?: () => void;
		planning?: Snippet;
	} = $props();

	const toggle = (name: keyof Layers) => onlayers({ ...layers, [name]: !layers[name] });
</script>

<div class="overlay" data-testid="mission-center">
	{#if layers.network}
		<div data-testid="mc-network"><NetworkLayer {network} /></div>
	{/if}
	{#if layers.labels}
		{#each labels as l (l.key)}
			<button
				type="button"
				class="label {l.kind}"
				class:selected={l.key === selected ||
					(selected !== null && l.members?.includes(selected) === true)}
				style:left="{l.x}px"
				style:top="{l.y}px"
				onclick={() => onselect(l.members?.[0] ?? l.key)}
				data-testid="mc-label-{l.key}">{l.label}</button
			>
		{/each}
	{/if}

	<div class="top">
		<BackButton label="Space Center" href="/space-center" testid="mc-home" />
		<Capsule data-testid="world-capsule"
			><span class="world">{worldName}</span><span class="u num">{clock}</span>{#if warp > 1}<span
					class="u num">{warp.toLocaleString('en-US')}×</span
				>{/if}</Capsule
		>
	</div>

	<div class="switch" role="tablist" aria-label="View">
		<button
			type="button"
			role="tab"
			aria-selected="false"
			disabled={!canFly}
			title={canFly ? 'Back to the flight' : 'There is no flight in this save'}
			onclick={onfly}
			data-testid="mc-tab-map">Map</button
		>
		<button type="button" role="tab" aria-selected="true" class="on" data-testid="mc-tab-mc"
			>Mission Center</button
		>
	</div>

	<aside class="left">
		<Panel title="Tracking">
			<Segmented
				label="Show"
				value={filter}
				options={TRACK_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
				onchange={onfilter}
				testid="mc-filter"
			/>
			<ul class="list" data-testid="mc-tracking">
				{#each rows as row (row.key)}
					<li>
						<ListRow
							name={row.label}
							sub={row.sub}
							icon={row.kind === 'body' ? 'orbit' : 'vessel'}
							selected={row.key === selected}
							onclick={() => onselect(row.key)}
							testid="mc-row-{row.key}"
						/>
					</li>
				{:else}
					<li class="calm">
						{filter === 'relays'
							? 'No relays yet: they come with relay antennas.'
							: 'Nothing to track.'}
					</li>
				{/each}
			</ul>
		</Panel>
		<Panel title="Crew roster">
			{#if crew.length === 0}
				<p class="calm">No one is hired yet.</p>
			{:else}
				<ul class="list" data-testid="mc-crew">
					{#each crew as c (c.id)}<li><ListRow name={c.name} sub={c.sub} /></li>{/each}
				</ul>
			{/if}
		</Panel>
		{#if agency}
			<div class="agency" data-testid="mc-agency">
				<StatCell label="Funds" value={agency.funds} />
				<StatCell label="Science" value={agency.science} />
				<StatCell label="Reputation" value={agency.reputation} />
			</div>
		{/if}
	</aside>

	<aside class="right">
		<Panel title="Upcoming">
			{#if upcoming.length === 0}
				<p class="calm">Nothing scheduled.</p>
			{:else}
				<ul class="list" data-testid="mc-upcoming">
					{#each upcoming as e (e.key)}
						<li class="event">
							<div>
								<span class="name">{e.label}</span>
								<span class="sub">{e.detail} · {timeUntil(e.time, now)}</span>
							</div>
							<Button onclick={() => onwarp(e)} data-testid="mc-warp-{e.key}">Warp to</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>
		<Panel title="Contracts">
			{#if contracts.length === 0}
				<p class="calm">No contract or mission started.</p>
			{:else}
				<ul class="list" data-testid="mc-contracts">
					{#each contracts as c (c.id)}
						<li><ListRow name={c.label} sub="{c.status} · {Math.round(c.progress * 100)} %" /></li>
					{/each}
				</ul>
			{/if}
		</Panel>
	</aside>

	{#if planningOpen && planning}
		{@render planning()}
	{:else if card}
		<section class="card" aria-label="{card.title} details" data-testid="mc-card">
			<header>
				<div>
					<h2>{card.title}</h2>
					<p class="sub">{card.sub}</p>
				</div>
				<Button variant="ghost" onclick={() => onselect(null)}>Close</Button>
			</header>
			<div class="facts">
				{#each card.facts as f (f.label)}<StatCell label={f.label} value={f.value} />{/each}
			</div>
			{#if card.fly}
				{#if card.fly.enabled}
					<Button variant="primary" onclick={onfly} data-testid="mc-fly">Fly this vessel</Button>
				{:else}
					<p class="why" data-testid="mc-fly-why">{card.fly.reason}</p>
				{/if}
			{/if}
		</section>
	{/if}

	<div class="layers" role="group" aria-label="Layers">
		{#each ['orbits', 'network', 'labels'] as const as name (name)}
			<button
				type="button"
				aria-pressed={layers[name]}
				class:on={layers[name]}
				onclick={() => toggle(name)}
				data-testid="mc-layer-{name}">{name.charAt(0).toUpperCase() + name.slice(1)}</button
			>
		{/each}
		{#if onplanning}
			<button
				type="button"
				aria-pressed={planningOpen}
				class:on={planningOpen}
				onclick={onplanning}
				data-testid="mc-planning-toggle">Planning</button
			>
		{/if}
	</div>

	{#if note}<p class="note" role="alert" data-testid="mc-note">{note}</p>{/if}
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		font-family: var(--font-ui);
		color: var(--text);
	}
	.overlay :global(button),
	.overlay :global(a),
	.overlay :global(section),
	.overlay :global(aside),
	.overlay .top,
	.overlay .switch,
	.overlay .layers {
		pointer-events: auto;
	}
	.label {
		position: absolute;
		transform: translate(-50%, calc(-100% - 10px));
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-pill, 999px);
		border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		backdrop-filter: blur(10px) brightness(0.4);
		color: var(--text-secondary, #c4c4cc);
		font: inherit;
		font-size: var(--t-xs, 0.6875rem);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.label.body {
		color: var(--text);
	}
	.label.selected {
		border-color: var(--accent-text);
		color: var(--text);
	}
	.top {
		position: absolute;
		top: var(--space-4, 1rem);
		left: var(--space-4, 1rem);
		display: flex;
		gap: var(--space-3, 0.75rem);
		align-items: center;
	}
	.world {
		font-weight: 600;
	}
	.u {
		color: var(--text-muted);
		margin-left: 0.5rem;
		font-size: var(--t-sm, 0.8125rem);
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.switch {
		position: absolute;
		top: var(--space-4, 1rem);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: var(--radius-pill, 999px);
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		border: 1px solid var(--border-subtle);
		backdrop-filter: blur(28px) saturate(160%);
	}
	.switch button,
	.layers button {
		height: 2.125rem;
		padding: 0 0.875rem;
		border: 0;
		border-radius: var(--radius-pill, 999px);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--t-sm, 0.8125rem);
		font-weight: 600;
		cursor: pointer;
	}
	.switch button.on,
	.layers button.on {
		background: var(--selected-bg, #f4f4f5);
		color: var(--selected-fg, #0b0b0c);
	}
	.switch button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.left,
	.right {
		position: absolute;
		top: 4.5rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		max-height: calc(100% - 9rem);
		overflow-y: auto;
	}
	.left {
		left: var(--space-4, 1rem);
		width: 16.25rem;
	}
	.right {
		right: var(--space-4, 1rem);
		width: 18.75rem;
	}
	.list {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
	}
	.calm,
	.why,
	.sub {
		color: var(--text-muted);
		font-size: var(--t-sm, 0.8125rem);
		margin: 0;
	}
	.event {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.375rem 0;
	}
	.event .name {
		display: block;
		font-weight: 600;
		font-size: var(--t-sm, 0.8125rem);
	}
	.event .sub {
		display: block;
		font-size: var(--t-xs, 0.6875rem);
	}
	.agency {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.375rem;
	}
	.card {
		position: absolute;
		bottom: var(--space-4, 1rem);
		left: 50%;
		transform: translateX(-50%);
		width: min(35rem, calc(100% - 2rem));
		padding: 0.75rem;
		border-radius: var(--radius-card, 1rem);
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		border: 1px solid var(--border-subtle);
		backdrop-filter: blur(28px) saturate(160%) brightness(0.4);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.card header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	.card h2 {
		margin: 0;
		font-size: var(--t-md, 0.9375rem);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.375rem;
	}
	@media (max-width: 1100px) {
		/* the card sits above the layer toggles when they would meet */
		.card {
			bottom: 4.25rem;
		}
	}
	.layers {
		position: absolute;
		right: var(--space-4, 1rem);
		bottom: var(--space-4, 1rem);
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: var(--radius-pill, 999px);
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		border: 1px solid var(--border-subtle);
	}
	.note {
		position: absolute;
		top: 4.5rem;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-card, 0.75rem);
		background: var(--surface-solid);
		color: var(--danger);
	}
</style>
