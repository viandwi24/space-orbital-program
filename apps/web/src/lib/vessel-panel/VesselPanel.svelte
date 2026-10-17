<script lang="ts">
	/**
	 * The vessel panel (plan 111, ADR 0153; refs): Overview with a switch per group, Parts with each
	 * part's controls from its descriptors, Comms reserved for plan 115.
	 */
	import type { Command, EntityId } from '@orbital/core';
	import Panel from '../ui/Panel.svelte';
	import Switch from '../ui/Switch.svelte';
	import Button from '../ui/Button.svelte';
	import { controlCommand, groupCommand, type ControlRow, type VesselView } from './vessel-model';

	let {
		vessel,
		name,
		view,
		oncommand,
		onhighlight,
		initialTab = 'overview'
	}: {
		vessel: EntityId;
		name: string;
		view: VesselView;
		oncommand: (command: Command) => void;
		/** A part row is hovered or focused (null: none). */
		onhighlight: (part: EntityId | null) => void;
		initialTab?: 'overview' | 'parts';
	} = $props();

	// svelte-ignore state_referenced_locally
	let tab = $state<'overview' | 'parts'>(initialTab);
	let problem = $state<string | null>(null);

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
		<button type="button" role="tab" aria-selected="false" disabled title="Comms come with plan 115"
			>Comms</button
		>
	</div>
	{#if problem}<p class="problem" role="status">{problem}</p>{/if}

	{#if tab === 'overview'}
		{#each view.groups as g (g.id)}
			<div class="row">
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
</style>
