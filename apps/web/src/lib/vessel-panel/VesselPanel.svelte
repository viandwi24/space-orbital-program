<script lang="ts">
	/**
	 * The vessel panel (plan 111, ADR 0153; refs): Overview with a switch per group, Parts with each
	 * part's controls from its descriptors, Comms with the route, the stations and the transmitters
	 * (plan 115, ADR 0158), and the link budget's terms (plan 116, ADR 0185).
	 */
	import { untrack } from 'svelte';
	import type { Command, EntityId } from '@orbital/core';
	import Panel from '../ui/Panel.svelte';
	import Switch from '../ui/Switch.svelte';
	import Button from '../ui/Button.svelte';
	import SignalBars from '../ui/SignalBars.svelte';
	import Meter from '../ui/Meter.svelte';
	import type { CommsTab } from '../comms/network-model';
	import {
		controlCommand,
		filterParts,
		groupCommand,
		groupText,
		lockCommand,
		resourceGroups,
		stagesOf,
		transferCommand,
		type ControlRow,
		type PartRow,
		type VesselView
	} from './vessel-model';
	import ControlRows from './ControlRows.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Icon from '../ui/Icon.svelte';
	import { openRows } from './open-rows.svelte';
	import { categoryKey, partKey, partSummary } from './part-summary';
	import { formatDuration, resourceLabel } from '../format';
	import type { ResourceSnapshot, TransferSnapshot } from '@orbital/core';

	let {
		vessel,
		name,
		view,
		oncommand,
		onhighlight,
		comms = null,
		transmitters = [],
		initialTab = 'overview',
		oninspect = () => {},
		highlighted = null,
		totals = [],
		transfers = []
	}: {
		vessel: EntityId;
		name: string;
		view: VesselView;
		oncommand: (command: Command) => void;
		/** A part row is hovered or focused (null: none). */
		onhighlight: (part: EntityId | null) => void;
		/** The Comms tab (null: this world has no comms network). */
		comms?: CommsTab | null;
		transmitters?: PartRow[];
		initialTab?: Tab;
		/** Open the part inspector (plan 214). */
		oninspect?: (part: EntityId) => void;
		/** The part lit in the 3D view (two-way highlight, plan 214). */
		highlighted?: EntityId | null;
		/** The vessel's resource totals and running transfers (plan 213's snapshot). */
		totals?: readonly ResourceSnapshot[];
		transfers?: readonly TransferSnapshot[];
	} = $props();

	type Tab = 'overview' | 'parts' | 'resources' | 'comms';
	// svelte-ignore state_referenced_locally
	let tab = $state<Tab>(initialTab);
	let search = $state('');
	let stage = $state<number | null>(null);
	const shownParts = $derived(filterParts(view.parts, { search, stage }));
	const stages = $derived(stagesOf(view.parts));
	/** The shown parts under their category, in order; the category is a foldable heading (plan 256). */
	const categories = $derived(
		shownParts.reduce<{ name: string; parts: PartRow[] }[]>((out, p) => {
			const name = p.category.replace(/^.*\./, '');
			const last = out.at(-1);
			if (last && last.name === name) last.parts.push(p);
			else out.push({ name, parts: [p] });
			return out;
		}, [])
	);
	const vesselKey = $derived(String(vessel));
	const groups = $derived(resourceGroups(view, { resources: [...totals] }));
	/** The transfer picker: resource, from and to containers (plan 214 on plan 213's command). */
	let pick = $state<{ resource: string; from: string; to: string }>({
		resource: '',
		from: '',
		to: ''
	});
	/** Resources in two containers or more: the ones a transfer can move. */
	const movable = $derived(groups.filter((g) => g.containers.length >= 2));
	const pickGroup = $derived(movable.find((g) => g.resource === pick.resource) ?? movable[0]);
	const rate = (r: Pick<ResourceSnapshot, 'rate'>): string =>
		Math.abs(r.rate) < 1e-3 ? 'steady' : `${r.rate > 0 ? '+' : ''}${r.rate.toFixed(2)}/s`;
	let problem = $state<string | null>(null);
	// the link inspector (ADR 0185 point 9): the sim carries this vessel's budget while the tab is open
	const inspecting = $derived(tab === 'comms' && comms !== null);
	$effect(() => {
		if (!inspecting) return;
		const id = vessel;
		// only the tab and the vessel restart it, not a new `oncommand` closure
		untrack(() => oncommand({ type: 'comms-inspect', vessel: id }));
		return () => untrack(() => oncommand({ type: 'comms-inspect', vessel: null }));
	});

	function send(part: EntityId, c: ControlRow, value?: boolean | number | string): void {
		const r = controlCommand(vessel, part, c, value);
		if ('reason' in r) problem = r.reason;
		else {
			problem = null;
			oncommand(r.command);
		}
	}
</script>

<Panel title="Vessel" data-testid="vessel-panel">
	{#snippet aside()}<span class="vname">{name}</span>{/snippet}
	<div class="tabs" role="tablist" aria-label="Vessel panel">
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'overview'}
			onclick={() => (tab = 'overview')}>Overview</button
		>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'parts'}
			data-testid="vessel-tab-parts"
			onclick={() => (tab = 'parts')}>Parts</button
		>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'resources'}
			data-testid="vessel-tab-resources"
			onclick={() => (tab = 'resources')}>Resources</button
		>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'comms'}
			disabled={!comms}
			data-tip={comms ? undefined : 'This world has no comms network'}
			data-testid="vessel-tab-comms"
			onclick={() => (tab = 'comms')}>Comms</button
		>
	</div>
	{#if problem}<p class="problem" role="status">{problem}</p>{/if}

	{#if tab === 'comms' && comms}
		<section class="comms" data-testid="vessel-comms">
			<div class="route">
				<span class="cap">Route · {comms.routeLabel}</span>
				<p class="path" data-testid="comms-path">
					<SignalBars level={comms.bars} offline={!comms.linked} />
					{comms.path.join(' → ')}
				</p>
				{#if comms.reason}<p class="problem" data-testid="comms-reason">{comms.reason}</p>{/if}
				{#if comms.rate || comms.latency}<p class="dim" data-testid="comms-rate">
						{[comms.rate, comms.latency && `light time ${comms.latency}`]
							.filter(Boolean)
							.join(' · ')}
					</p>{/if}
				{#if comms.channel}<p class="dim" data-testid="comms-channel">{comms.channel}</p>{/if}
				{#if comms.licence}
					<Button onclick={() => oncommand(comms.licence!.command)} data-testid="comms-licence"
						>{comms.licence.label}</Button
					>
				{/if}
				<div class="modes" role="group" aria-label="Route mode" data-testid="comms-modes">
					{#each comms.modes as m (m.id)}
						<button
							type="button"
							aria-pressed={m.active}
							data-testid="comms-mode-{m.id}"
							onclick={() => oncommand(m.command)}>{m.label}</button
						>
					{/each}
				</div>
			</div>
			{#if comms.queue.length > 0}
				<span class="cap">Sending</span>
				{#if comms.contact}<p class="dim" data-testid="comms-contact">{comms.contact}</p>{/if}
				{#each comms.queue as q (q.id)}
					<div class="row endpoint" data-testid="comms-queue-item">
						<span>{q.label} · {Math.round(q.progress * 100)}% · {q.eta}</span>
						<Button onclick={() => oncommand(q.cancel)} data-testid="comms-cancel-{q.id}"
							>Cancel</Button
						>
					</div>
				{/each}
			{/if}
			{#if comms.budget}
				<span class="cap">Link budget</span>
				<dl class="budget" data-testid="comms-budget">
					{#each comms.budget as term (term.id)}
						<div class="row" data-term={term.id}>
							<dt>{term.label}</dt>
							<dd>{term.value}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			<span class="cap">Ground stations</span>
			{#each comms.endpoints as e (e.id)}
				<div class="row endpoint" class:current={e.current}>
					<span>{e.label}</span><span class="dim">{e.body}{e.current ? ' · linked' : ''}</span>
				</div>
			{:else}
				<p class="none">No ground station.</p>
			{/each}
			<span class="cap">Transmitters</span>
			{#each transmitters as p (p.entity)}
				{#each p.controls.filter((c) => c.kind === 'toggle') as c (c.module + '/' + c.id)}
					<div class="row endpoint" data-tip={c.enabled ? undefined : c.reason}>
						<span>{p.title} · {c.label}</span>
						<Switch
							checked={c.value === true}
							label="{p.title} · {c.label}"
							disabled={!c.enabled}
							testid="comms-{p.entity}-{c.id}"
							onchange={(on) => send(p.entity, c, on)}
						/>
					</div>
				{/each}
			{:else}
				<p class="none">No antenna on board.</p>
			{/each}
		</section>
	{:else if tab === 'overview'}
		{#each view.groups as g (g.id)}
			<div class="row endpoint">
				<span data-testid="group-{g.id}-count">{groupText(g)}</span>
				<Switch
					checked={g.state === 'mixed' ? 'mixed' : g.state === 'on'}
					label={groupText(g)}
					testid="group-{g.id}"
					onchange={() => oncommand(groupCommand(vessel, g))}
				/>
			</div>
		{:else}
			<p class="none">No group on this vessel.</p>
		{/each}
	{:else if tab === 'resources'}
		<section class="resources" data-testid="vessel-resources">
			{#each groups as g (g.resource)}
				<div class="cap">{resourceLabel(g.resource)}</div>
				{#if g.total}
					<p class="dim total" data-testid="resource-{g.resource}-total">
						{Math.round(g.total.amount)} / {Math.round(g.total.capacity)} · {rate(g.total)}{g.total
							.timeToEmpty !== null
							? ` · empty in ${formatDuration(g.total.timeToEmpty)}`
							: ''}
					</p>
				{/if}
				{#each g.containers as c (c.entity)}
					{@const f = c.capacity > 0 ? c.amount / c.capacity : 0}
					<div class="row container" data-testid="container-{c.entity}-{g.resource}">
						<span class="ctitle">{c.title}</span>
						<span class="bar"
							><Meter value={f} label="{c.title} {resourceLabel(g.resource)}" /></span
						>
						<span class="num">{Math.round(c.amount)}/{Math.round(c.capacity)}</span>
						<span class="num dim" data-testid="container-{c.entity}-{g.resource}-rate"
							>{rate(c)}{c.timeToEmpty !== null
								? ` · empty in ${formatDuration(c.timeToEmpty)}`
								: ''}</span
						>
						{#if c.locked}<span class="locked">Locked</span>{/if}
						<Switch
							checked={!c.locked}
							label="{c.title} {resourceLabel(g.resource)} flows"
							testid="lock-{c.entity}-{g.resource}"
							onchange={(on) => oncommand(lockCommand(vessel, c.entity, g.resource, !on))}
						/>
					</div>
				{/each}
			{:else}
				<p class="none">Nothing on board.</p>
			{/each}
			{#if pickGroup && pickGroup.containers.length >= 2}
				<div class="cap">Transfer</div>
				<div class="transfer" data-testid="transfer-picker">
					<select
						aria-label="Resource"
						data-testid="transfer-resource"
						value={pickGroup.resource}
						onchange={(e) => (pick = { resource: e.currentTarget.value, from: '', to: '' })}
					>
						{#each movable as x (x.resource)}
							<option value={x.resource}>{resourceLabel(x.resource)}</option>
						{/each}
					</select>
					<select aria-label="From" data-testid="transfer-from" bind:value={pick.from}>
						<option value="">From…</option>
						{#each pickGroup.containers as c (c.entity)}
							<option value={String(c.entity)}>{c.title} ({Math.round(c.amount)})</option>
						{/each}
					</select>
					<select aria-label="To" data-testid="transfer-to" bind:value={pick.to}>
						<option value="">To…</option>
						{#each pickGroup.containers as c (c.entity)}
							<option value={String(c.entity)}>{c.title} ({Math.round(c.amount)})</option>
						{/each}
					</select>
					<Button
						disabled={pick.from === '' || pick.to === '' || pick.from === pick.to}
						data-testid="transfer-start"
						onclick={() =>
							oncommand(
								transferCommand(vessel, pickGroup.resource, {
									from: Number(pick.from) as EntityId,
									to: Number(pick.to) as EntityId
								})
							)}>Transfer</Button
					>
					{#if transfers.some((t) => t.resource === pickGroup.resource)}
						<Button
							data-testid="transfer-stop"
							onclick={() => oncommand(transferCommand(vessel, pickGroup.resource, 'stop'))}
							>Stop</Button
						>
					{/if}
				</div>
			{/if}
		</section>
	{:else}
		<div class="filters">
			<input
				type="search"
				placeholder="Search parts"
				aria-label="Search parts"
				data-testid="vessel-search"
				bind:value={search}
			/>
			{#if stages.length > 1}
				<select
					aria-label="Stage"
					data-testid="vessel-stage-filter"
					value={stage === null ? '' : String(stage)}
					onchange={(e) => {
						const v = e.currentTarget.value;
						stage = v === '' ? null : Number(v);
					}}
				>
					<option value="">All stages</option>
					{#each stages as n (n)}<option value={String(n)}>Stage {n + 1}</option>{/each}
				</select>
			{/if}
		</div>
		{#each categories as cat (cat.name)}
			<details
				class="cat"
				open={openRows.isOpen(vesselKey, categoryKey(cat.name), true)}
				ontoggle={(e) => openRows.set(vesselKey, categoryKey(cat.name), e.currentTarget.open)}
			>
				<summary class="cap">
					<span class="chev" aria-hidden="true"><Icon name="chevron" size={12} /></span>
					{cat.name}<span class="count">{cat.parts.length}</span>
				</summary>
				{#each cat.parts as p (p.entity)}
					{@const sum = partSummary(p)}
					<!-- svelte-ignore a11y_no_static_element_interactions: hover points at the part in the view -->
					<section
						class="part"
						class:lit={highlighted === p.entity}
						aria-label={p.title}
						data-testid="vessel-part"
						data-part={p.entity}
						onmouseenter={() => onhighlight(p.entity)}
						onmouseleave={() => onhighlight(null)}
						onfocusin={() => onhighlight(p.entity)}
						onfocusout={() => onhighlight(null)}
					>
						<details
							open={openRows.isOpen(vesselKey, partKey(p.entity), false)}
							ontoggle={(e) => openRows.set(vesselKey, partKey(p.entity), e.currentTarget.open)}
						>
							<summary class="head" data-testid="part-{p.entity}-row">
								<span class="chev" aria-hidden="true"><Icon name="chevron" size={14} /></span>
								<span class="title">{p.title}</span>
								<span class="sum {sum.tone}">{sum.text}</span>
							</summary>
							<div class="body"><ControlRows part={p} {send} /></div>
						</details>
						<div class="acts">
							{#if p.controlPoint}
								<IconButton
									icon="navball"
									label={p.controlling ? 'Controlling from here' : 'Control from here'}
									pressed={p.controlling === true}
									disabled={p.controlling}
									data-testid="part-{p.entity}-control-from"
									onclick={() => oncommand({ type: 'set-control-part', vessel, part: p.entity })}
								/>
							{/if}
							<IconButton
								icon="info"
								label="Inspect"
								data-testid="part-{p.entity}-inspect"
								onclick={() => oninspect(p.entity)}
							/>
						</div>
					</section>
				{/each}
			</details>
		{:else}
			<p class="none">No part matches.</p>
		{/each}
	{/if}
</Panel>

<style>
	.vname {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.tabs {
		display: flex;
		gap: 2px;
		margin-bottom: 0.5rem;
		padding: 2px;
		border-radius: var(--radius-pill);
		background: var(--surface-inset);
	}
	.tabs button {
		flex: 1;
		min-height: 2rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.tabs button:disabled {
		cursor: default;
		opacity: 0.5;
	}
	/* a part is one collapsed line: chevron, name, what matters, then icon actions (plan 256) */
	.part {
		position: relative;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
	}
	.part:hover,
	.part:focus-within {
		outline: 1px solid var(--border-strong);
	}
	summary {
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 2.25rem;
		/* room for the two icon buttons on the right */
		padding: 0 4.75rem 0 0.5rem;
		min-width: 0;
	}
	.title {
		flex: none;
		max-width: 55%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.sum {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.sum.warn {
		color: var(--warn);
	}
	.sum.danger {
		color: var(--danger);
	}
	.acts {
		position: absolute;
		top: 0;
		right: 0.25rem;
		height: 2.25rem;
		display: flex;
		align-items: center;
		gap: 0.125rem;
	}
	.acts :global(.ib) {
		min-width: 2rem;
		height: 2rem;
	}
	.body {
		padding: 0 0.5rem 0.5rem;
	}
	.chev {
		display: grid;
		flex: none;
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	details[open] > summary > .chev,
	details[open] > summary .chev {
		transform: rotate(90deg);
	}
	.cat > summary.cap {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0 var(--s-1);
	}
	/* even gaps on the 4 px grid (plan 268): header to rows and row to row s-2, group to group s-4 */
	.cat[open] > summary.cap {
		margin-bottom: var(--s-2);
	}
	.part + .part {
		margin-top: var(--s-2);
	}
	.cat + .cat {
		margin-top: var(--s-4);
	}
	.count {
		margin-left: 0.25rem;
		font-weight: 500;
		color: var(--text-faint);
	}
	.row {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.modes {
		display: flex;
		gap: 2px;
	}
	.modes button {
		min-height: 2.75rem;
		padding: 0 0.625rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: var(--surface-button);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
	}
	.route .modes {
		flex-wrap: wrap;
		margin: 0.25rem;
	}
	.modes button[aria-pressed='true'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.problem,
	.none {
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.problem {
		color: var(--warn);
	}
	.comms {
		display: grid;
		gap: 0.25rem;
	}
	.cap {
		margin: 0.5rem 0.25rem 0;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.path {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-primary);
	}
	.endpoint {
		justify-content: space-between;
		padding: 0 0.25rem;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.endpoint.current {
		color: var(--text-primary);
	}
	.dim {
		color: var(--text-muted);
	}
	.route .dim {
		margin: 0 0.25rem;
		font-size: var(--t-small);
	}
	.budget {
		margin: 0;
		padding: 0 0.25rem;
		font-size: var(--t-small);
		font-variant-numeric: tabular-nums;
	}
	.budget .row {
		min-height: 1.75rem;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.budget dt {
		color: var(--text-secondary);
	}
	.budget dd {
		margin: 0;
		color: var(--text-primary);
	}
	.filters {
		display: flex;
		gap: 0.375rem;
		margin: 0 0.25rem var(--s-3);
	}
	.filters input,
	.transfer select {
		flex: 1;
		min-width: 0;
		min-height: 2rem;
		padding: 0 0.5rem;
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-primary);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-tile);
	}
	.filters select {
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-primary);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-tile);
	}
	.part.lit {
		outline: 1px solid var(--accent-text);
		outline-offset: 2px;
		border-radius: var(--radius-tile);
	}
	.resources {
		display: grid;
		gap: 0.25rem;
	}
	.total {
		margin: 0 0.25rem;
		font-size: var(--t-small);
	}
	.container {
		gap: 0.375rem;
		padding: 0 0.25rem;
		font-size: var(--t-small);
	}
	.ctitle {
		flex: 0 1 6rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-secondary);
	}
	.container .bar {
		flex: 1;
	}
	.locked {
		font-size: var(--t-label);
		font-weight: 700;
		color: var(--warn);
	}
	.transfer {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.375rem;
		margin: 0 0.25rem;
	}
</style>
