<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	/**
	 * The Mission Center's overlay (plan 113, refs `Map.dc.html`): the world capsule and the
	 * `Map | Mission Center` switch on top, Tracking with its filters and the crew and agency on the
	 * left, Upcoming and Contracts on the right, the selected object's card at the bottom, the layer
	 * toggles bottom right, and labels and the Network layer (plan 115) over the canvas.
	 */
	import NetworkLayer from '../comms/NetworkLayer.svelte';
	import type { ScreenNetwork } from '../comms/network-model';
	import type { SiteRow } from '../space-center/branch-model';
	import BackButton from '../ui/BackButton.svelte';
	import Button from '../ui/Button.svelte';
	import Icon from '../ui/Icon.svelte';
	import Capsule from '../ui/Capsule.svelte';
	import ListRow from '../ui/ListRow.svelte';
	import Panel from '../ui/Panel.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import StatCell from '../ui/StatCell.svelte';
	import AlarmTools, { type AlarmDraft } from './AlarmTools.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import RecoverDialog from '../hud/RecoverDialog.svelte';
	import { VESSEL_TYPES, type VesselType } from '@orbital/core';
	import PerfOverlay from '../perf/PerfOverlay.svelte';
	import type { PerfSample } from '../perf/perf-stats';
	import {
		TRACK_FILTERS,
		VESSEL_TYPE_LABEL,
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
		onstack,
		upcoming,
		onwarp,
		onalarmsave,
		onalarmremove,
		counts = null,
		trackType = null,
		ontracktype,
		search = '',
		onsearch,
		sort = 'name',
		onsort,
		onrecover,
		onterminate,
		onrename,
		onsettype,
		windowDestinations = [],
		windowDestination = null,
		onwindowdestination,
		transferWindow = null,
		onwindowalarm,
		contracts,
		crew,
		agency,
		rivals = [],
		news = [],
		card,
		onfly,
		canFly,
		layers,
		onlayers,
		labels,
		network,
		sites = [],
		note,
		planningOpen = false,
		onplanning,
		planning,
		perf = null
	}: {
		/** The performance overlay's sample (plan 294): shown at the head of the right column; null hides it. */
		perf?: (() => PerfSample | null) | null;
		worldName: string;
		clock: string;
		warp: number;
		now: number;
		filter: TrackFilter;
		onfilter: (f: TrackFilter) => void;
		rows: readonly TrackRow[];
		selected: string | null;
		onselect: (key: string | null) => void;
		/** A cluster's label: the pick list of its members (plan 270); without it, the first member. */
		onstack?: (keys: readonly string[], at: { x: number; y: number }) => void;
		upcoming: readonly UpcomingEvent[];
		onwarp: (e: UpcomingEvent) => void;
		/** The fleet list (plan 223): counts per type, the type kept, the search and the order. */
		counts?: { all: number; byType: Record<VesselType, number> } | null;
		trackType?: VesselType | null;
		ontracktype?: (type: VesselType | null) => void;
		search?: string;
		onsearch?: (text: string) => void;
		sort?: 'name' | 'distance';
		onsort?: (sort: 'name' | 'distance') => void;
		/** Fleet actions on the selected vessel (plan 223). */
		onrecover?: (vessel: number) => void;
		onterminate?: (vessel: number) => void;
		onrename?: (vessel: number, name: string) => void;
		onsettype?: (vessel: number, type: VesselType) => void;
		/** Alarms (plan 224): add or replace one, and delete one by id. */
		onalarmsave?: (draft: AlarmDraft) => void;
		onalarmremove?: (id: string) => void;
		/** The next transfer window from the focused vessel (plan 224). */
		windowDestinations?: readonly { id: string; label: string }[];
		windowDestination?: string | null;
		onwindowdestination?: (id: string | null) => void;
		transferWindow?: { date: string; wait: number; dv: number } | string | null;
		onwindowalarm?: () => void;
		contracts: readonly { id: string; label: string; progress: number; status: string }[];
		crew: readonly { id: string; name: string; sub: string }[];
		agency: { funds: string; science: string; reputation: string } | null;
		/** Rival agencies (plan 126, ADR 0190). */
		rivals?: readonly { id: string; name: string; sub: string }[];
		/** Their news, newest first. */
		news?: readonly { key: string; text: string; when: string }[];
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
		/** The world's sites and their ground stations (plan 236, ADR 0229 point 7). */
		sites?: readonly SiteRow[];
		note: string | null;
		/** The comms planning panel (plan 118, ADR 0163 point 6), drawn in place of the card while open. */
		planningOpen?: boolean;
		onplanning?: () => void;
		planning?: Snippet;
	} = $props();

	const toggle = (name: keyof Layers) => onlayers({ ...layers, [name]: !layers[name] });
	let editing = $state<AlarmDraft | null>(null);
	let recovering = $state<number | null>(null);
	let terminating = $state<number | null>(null);
	let renaming = $state<number | null>(null);
	let newName = $state('');
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
				onclick={() =>
					l.members && onstack
						? onstack(l.members, { x: l.x, y: l.y })
						: onselect(l.members?.[0] ?? l.key)}
				data-testid="mc-label-{l.key}">{l.label}</button
			>
		{/each}
	{/if}

	<div class="top">
		<BackButton label="Space Center" href={resolve('/(world)/space-center')} testid="mc-home" />
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
			data-tip={canFly ? 'Back to the flight' : 'There is no flight in this save'}
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
			{#if onsearch}
				<div class="fleet">
					<input
						type="search"
						placeholder="Search"
						value={search}
						oninput={(e) => onsearch(e.currentTarget.value)}
						aria-label="Search vessels and bodies"
						data-testid="mc-search"
					/>
					<select
						value={trackType ?? ''}
						onchange={(e) => ontracktype?.((e.currentTarget.value || null) as VesselType | null)}
						aria-label="Vessel type"
						data-testid="mc-type"
					>
						<option value="">All types{counts ? ` (${counts.all})` : ''}</option>
						{#each VESSEL_TYPES as t (t)}
							<option value={t}
								>{VESSEL_TYPE_LABEL[t]}{counts ? ` (${counts.byType[t]})` : ''}</option
							>
						{/each}
					</select>
					<select
						value={sort}
						onchange={(e) => onsort?.(e.currentTarget.value as 'name' | 'distance')}
						aria-label="Order"
						data-testid="mc-sort"
					>
						<option value="name">By name</option>
						<option value="distance">By distance</option>
					</select>
				</div>
			{/if}
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
		{#if sites.length > 0}
			<Panel title="Sites">
				<ul class="list" data-testid="mc-sites">
					{#each sites as s (s.id)}
						<li data-testid="mc-site-{s.id}">
							<ListRow name="{s.name} · {s.kind}" sub="{s.place} · {s.station}" />
						</li>
					{/each}
				</ul>
			</Panel>
		{/if}
		{#if agency}
			<div class="agency" data-testid="mc-agency">
				<StatCell label="Funds" value={agency.funds} />
				<StatCell label="Science" value={agency.science} />
				<StatCell label="Reputation" value={agency.reputation} />
			</div>
		{/if}
	</aside>

	<aside class="right">
		{#if perf}<PerfOverlay sample={perf} />{/if}
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
							<div class="acts">
								<Button onclick={() => onwarp(e)} data-testid="mc-warp-{e.key}">Warp to</Button>
								{#if e.alarm !== undefined && onalarmsave}
									<button
										type="button"
										class="act"
										aria-label="Edit alarm"
										data-tip="Edit alarm"
										onclick={() =>
											(editing = {
												id: e.alarm,
												name: e.label.replace(/^Alarm: /, ''),
												inSeconds: Math.max(1, e.time - now)
											})}
										data-testid="mc-alarm-edit-{e.alarm}"><Icon name="pencil" size={12} /></button
									>
									<button
										type="button"
										class="act"
										aria-label="Delete alarm"
										data-tip="Delete alarm"
										onclick={() => onalarmremove?.(e.alarm!)}
										data-testid="mc-alarm-delete-{e.alarm}"><Icon name="trash" size={12} /></button
									>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			{#if onalarmsave}
				<AlarmTools
					{editing}
					onsave={(d) => {
						onalarmsave(d);
						editing = null;
					}}
					oncancel={() => (editing = null)}
					destinations={windowDestinations}
					destination={windowDestination}
					ondestination={onwindowdestination}
					window={transferWindow}
					{onwindowalarm}
				/>
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
		{#if rivals.length > 0}
			<Panel title="Rivals">
				<ul class="list" data-testid="mc-rivals">
					{#each rivals as r (r.id)}
						<li><ListRow name={r.name} sub={r.sub} /></li>
					{/each}
				</ul>
			</Panel>
			<Panel title="News">
				{#if news.length === 0}
					<p class="calm">No news yet.</p>
				{:else}
					<ul class="list" data-testid="mc-news">
						{#each news as n (n.key)}
							<li><ListRow name={n.text} sub={n.when} /></li>
						{/each}
					</ul>
				{/if}
			</Panel>
		{/if}
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
			{#if card.vessel}
				{@const v = card.vessel}
				<div class="fleetacts" data-testid="mc-fleet-actions">
					{#if v.recovery && onrecover}
						<Button onclick={() => (recovering = v.id)} data-testid="mc-recover"
							>Recover · {Math.round(v.recovery.factor * 1000) / 10} %</Button
						>
					{/if}
					{#if onsettype}
						<select
							value={v.type}
							onchange={(e) => onsettype(v.id, e.currentTarget.value as VesselType)}
							aria-label="Type of {v.name}"
							data-testid="mc-set-type"
						>
							{#each VESSEL_TYPES as t (t)}<option value={t}>{VESSEL_TYPE_LABEL[t]}</option>{/each}
						</select>
					{/if}
					{#if onrename}
						{#if renaming === v.id}
							<form
								class="rename"
								onsubmit={(e) => {
									e.preventDefault();
									if (newName.trim()) onrename(v.id, newName.trim());
									renaming = null;
								}}
							>
								<input
									bind:value={newName}
									maxlength="60"
									aria-label="New name"
									data-testid="mc-rename-input"
								/>
								<Button type="submit" data-testid="mc-rename-save">Save</Button>
							</form>
						{:else}
							<Button
								variant="ghost"
								onclick={() => {
									renaming = v.id;
									newName = v.name;
								}}
								data-testid="mc-rename">Rename</Button
							>
						{/if}
					{/if}
					{#if onterminate}
						<Button variant="ghost" onclick={() => (terminating = v.id)} data-testid="mc-terminate"
							>Terminate</Button
						>
					{/if}
				</div>
				{#if v.recovery && onrecover}
					<RecoverDialog
						open={recovering === v.id}
						quote={v.recovery}
						cancel="Not now"
						onrecover={() => {
							recovering = null;
							onrecover(v.id);
						}}
						onclose={() => (recovering = null)}
					/>
				{/if}
				<Dialog
					open={terminating === v.id}
					title="Terminate {v.name}?"
					onclose={() => (terminating = null)}
				>
					<p class="why">
						The vessel leaves the world for good. Crew aboard follow the world's crew rule, as in a
						crash.
					</p>
					<div class="fleetacts">
						<Button variant="ghost" onclick={() => (terminating = null)}>Keep it</Button>
						<Button
							variant="primary"
							onclick={() => {
								terminating = null;
								onterminate?.(v.id);
							}}
							data-testid="mc-terminate-confirm">Terminate</Button
						>
					</div>
				</Dialog>
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
	.fleet {
		display: flex;
		gap: 0.25rem;
		margin: 0.5rem 0;
	}
	.fleet input,
	.fleet select,
	.fleetacts select,
	.rename input {
		min-width: 0;
		flex: 1 1 0;
		padding: 0.25rem 0.5rem;
		font: inherit;
		font-size: var(--t-sm);
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	.fleetacts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.rename {
		display: flex;
		gap: 0.25rem;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: auto;
	}
	/* the v2 Upcoming row's icon buttons (refs Map.dc.html): 26 px, 7 px radius */
	.act {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		flex: none;
		padding: 0;
		border: none;
		border-radius: 7px;
		background: rgb(255 255 255 / 0.08);
		color: var(--text-body);
		cursor: pointer;
	}
	.act:hover,
	.act:focus-visible {
		background: rgb(255 255 255 / 0.14);
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
