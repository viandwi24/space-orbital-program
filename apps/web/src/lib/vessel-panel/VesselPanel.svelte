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
	import type { CommsTab } from '../comms/network-model';
	import {
		controlCommand,
		groupCommand,
		type ControlRow,
		type PartRow,
		type VesselView
	} from './vessel-model';

	let {
		vessel,
		name,
		view,
		oncommand,
		onhighlight,
		comms = null,
		transmitters = [],
		initialTab = 'overview'
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
		initialTab?: 'overview' | 'parts' | 'comms';
	} = $props();

	// svelte-ignore state_referenced_locally
	let tab = $state<'overview' | 'parts' | 'comms'>(initialTab);
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
			aria-selected={tab === 'comms'}
			disabled={!comms}
			title={comms ? undefined : 'This world has no comms network'}
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
						{[comms.rate, comms.latency && `light time ${comms.latency}`].filter(Boolean).join(' · ')}
					</p>{/if}
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
						<Button onclick={() => oncommand(q.cancel)} data-testid="comms-cancel-{q.id}">Cancel</Button>
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
					<div class="row endpoint" title={c.enabled ? undefined : c.reason}>
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
				<span>{g.label} ({g.parts})</span>
				<Switch
					checked={g.state === 'mixed' ? 'mixed' : g.state === 'on'}
					label="{g.label} ({g.parts})"
					testid="group-{g.id}"
					onchange={() => oncommand(groupCommand(vessel, g))}
				/>
			</div>
		{:else}
			<p class="none">No group on this vessel.</p>
		{/each}
	{:else}
		{#each view.parts as p (p.entity)}
			<!-- svelte-ignore a11y_no_static_element_interactions: hover points at the part in the view -->
			<section
				class="part"
				aria-label={p.title}
				data-testid="vessel-part"
				onmouseenter={() => onhighlight(p.entity)}
				onmouseleave={() => onhighlight(null)}
				onfocusin={() => onhighlight(p.entity)}
				onfocusout={() => onhighlight(null)}
			>
				<h3>{p.title}</h3>
				{#each p.controls as c (c.module + '/' + c.id)}
					<div class="row" title={c.enabled ? undefined : c.reason}>
						{#if c.kind === 'toggle'}
							<span class="toggle-label">{c.label}</span>
							<Switch
								checked={c.value === true}
								label={c.label}
								disabled={!c.enabled}
								testid="part-{p.entity}-{c.id}"
								onchange={(on) => send(p.entity, c, on)}
							/>
						{:else if c.kind === 'value'}
							<label class="slider">
								<span>{c.label}</span>
								<input
									type="range"
									min={c.min}
									max={c.max}
									step={c.step ?? 'any'}
									value={c.value as number}
									disabled={!c.enabled}
									data-testid="part-{p.entity}-{c.id}"
									onchange={(e) => send(p.entity, c, Number(e.currentTarget.value))}
								/>
								<span class="num">{c.value}{c.unit ? ` ${c.unit}` : ''}</span>
							</label>
						{:else if c.kind === 'mode'}
							<div class="modes" role="radiogroup" aria-label={c.label}>
								{#each c.options ?? [] as o (o.value)}
									<button
										type="button"
										role="radio"
										aria-checked={c.value === o.value}
										disabled={!c.enabled}
										onclick={() => send(p.entity, c, o.value)}>{o.label}</button
									>
								{/each}
							</div>
						{:else}
							<Button
								disabled={!c.enabled}
								onclick={() => send(p.entity, c)}
								data-testid="part-{p.entity}-{c.id}">{c.label}</Button
							>
						{/if}
					</div>
				{/each}
			</section>
		{:else}
			<p class="none">No part with controls.</p>
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
	.part {
		padding: 0.5rem;
		margin-bottom: 0.375rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
	}
	.part:hover,
	.part:focus-within {
		outline: 1px solid var(--border-strong);
	}
	h3 {
		margin: 0 0 0.25rem;
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.row {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.slider {
		display: grid;
		grid-template-columns: 1fr 2fr auto;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		font-size: var(--t-small);
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
	.modes button[aria-pressed='true'],
	.modes button[aria-checked='true'] {
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
	.toggle-label {
		margin-right: auto;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
</style>
