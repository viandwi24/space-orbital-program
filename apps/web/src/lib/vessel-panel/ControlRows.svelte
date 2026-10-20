<script lang="ts">
	/**
	 * A part's state and controls from its descriptors (ADR 0174): the temperature bar while hot, the
	 * modules' readouts, then a row per control. The vessel panel's Parts tab and the part inspector
	 * (plan 214) both draw it; the inspector adds typed values with units and keeps `more` controls
	 * under "More".
	 */
	import type { EntityId } from '@orbital/core';
	import Button from '../ui/Button.svelte';
	import Meter from '../ui/Meter.svelte';
	import Switch from '../ui/Switch.svelte';
	import { resourceLabel } from '../format';
	import { formatTyped, parseTyped, unitsOf } from '../inspector/units';
	import type { ControlRow, PartRow } from './vessel-model';
	import { stepped } from './stepper';

	let {
		part,
		send,
		prefix = 'part',
		typed = false
	}: {
		part: PartRow;
		send: (part: EntityId, c: ControlRow, value?: boolean | number | string) => void;
		/** Test ids read `${prefix}-${part}-${control}`. */
		prefix?: string;
		/** Values take typed numbers with units, advanced controls go under "More" (the inspector). */
		typed?: boolean;
	} = $props();

	const main = $derived(typed ? part.controls.filter((c) => !c.more) : part.controls);
	const more = $derived(typed ? part.controls.filter((c) => c.more) : []);
	let note = $state<string | null>(null);

	function commit(c: ControlRow, input: HTMLInputElement): void {
		const r = parseTyped(c, input.value);
		if ('error' in r) {
			note = r.error;
			input.value = formatTyped(c, c.value as number); // the old value comes back
			return;
		}
		note = null;
		// shown in the control's own unit at once: a value equal to the current one changes no prop, so
		// the field would keep the raw text (plan 238, "50" stayed "50" instead of "50 %")
		input.value = formatTyped(c, r.value);
		send(part.entity, c, r.value);
	}
	const shown = (c: ControlRow): string =>
		unitsOf(c).length > 0
			? formatTyped(c, c.value as number)
			: `${c.value}${c.unit ? ` ${c.unit}` : ''}`;
</script>

{#snippet row(c: ControlRow)}
	<div class="row" data-tip={c.enabled ? undefined : c.reason}>
		{#if c.kind === 'toggle'}
			<span class="toggle-label">{c.label}</span>
			<Switch
				checked={c.value === true}
				label={c.label}
				disabled={!c.enabled}
				testid="{prefix}-{part.entity}-{c.id}"
				onchange={(on) => send(part.entity, c, on)}
			/>
		{:else if c.kind === 'value'}
			<label class="slider">
				<span>{c.label}</span>
				<button
					type="button"
					class="step"
					aria-label="{c.label}, less"
					disabled={!c.enabled}
					data-testid="{prefix}-{part.entity}-{c.id}-down"
					onclick={() => send(part.entity, c, stepped(c, -1))}>−</button
				>
				<input
					type="range"
					min={c.min}
					max={c.max}
					step={c.step ?? 'any'}
					value={c.value as number}
					disabled={!c.enabled}
					data-testid="{prefix}-{part.entity}-{c.id}"
					onchange={(e) => send(part.entity, c, Number(e.currentTarget.value))}
				/>
				<button
					type="button"
					class="step"
					aria-label="{c.label}, more"
					disabled={!c.enabled}
					data-testid="{prefix}-{part.entity}-{c.id}-up"
					onclick={() => send(part.entity, c, stepped(c, 1))}>+</button
				>
				{#if typed}
					<input
						class="typed num"
						type="text"
						inputmode="decimal"
						value={shown(c)}
						disabled={!c.enabled}
						aria-label="{c.label}, with a unit"
						data-testid="{prefix}-{part.entity}-{c.id}-typed"
						onkeydown={(e) => {
							if (e.key === 'Enter') commit(c, e.currentTarget);
						}}
						onchange={(e) => commit(c, e.currentTarget)}
					/>
				{:else}
					<span class="num">{shown(c)}</span>
				{/if}
			</label>
		{:else if c.kind === 'mode'}
			<div class="modes" role="radiogroup" aria-label={c.label}>
				{#each c.options ?? [] as o (o.value)}
					<button
						type="button"
						role="radio"
						aria-checked={c.value === o.value}
						disabled={!c.enabled}
						onclick={() => send(part.entity, c, o.value)}>{o.label}</button
					>
				{/each}
			</div>
		{:else}
			<Button
				disabled={!c.enabled}
				onclick={() => send(part.entity, c)}
				data-testid="{prefix}-{part.entity}-{c.id}">{c.label}</Button
			>
		{/if}
	</div>
{/snippet}

{#if part.heat}
	{@const f = part.heat.temperature / part.heat.max}
	<div class="row heat">
		<span>Temperature</span>
		<span class="bar"
			><Meter
				value={Math.min(1, f)}
				tone={f >= 0.8 ? 'danger' : f >= 0.5 ? 'warning' : 'accent'}
				label="{part.title} temperature"
			/></span
		>
		<span class="value num" data-testid="{prefix}-{part.entity}-temperature"
			>{Math.round(part.heat.temperature)} K of {part.heat.max} K</span
		>
	</div>
{/if}
{#each part.resources ?? [] as r (r.resource)}
	{@const f = r.capacity > 0 ? r.amount / r.capacity : 0}
	<div class="row heat" data-testid="{prefix}-{part.entity}-store-{r.resource}">
		<span>{resourceLabel(r.resource)}</span>
		<span class="bar"><Meter value={f} label="{part.title} {resourceLabel(r.resource)}" /></span>
		<span class="value num">{Math.round(r.amount)} / {Math.round(r.capacity)}</span>
	</div>
{/each}
{#each part.readouts as r (r.module + '/' + r.id)}
	<div class="row readout">
		<span>{r.label}</span>
		<span class="value" data-testid="{prefix}-{part.entity}-{r.id}">{r.value}</span>
	</div>
{/each}
{#each main as c (c.module + '/' + c.id)}
	{@render row(c)}
{/each}
{#if more.length > 0}
	<details class="more">
		<summary>More</summary>
		{#each more as c (c.module + '/' + c.id)}
			{@render row(c)}
		{/each}
	</details>
{/if}
{#if note}<p class="note" role="status" data-testid="{prefix}-{part.entity}-note">{note}</p>{/if}

<style>
	.row {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
		/* below 300 px a slider gives way to − and + (plan 250, rancangan §7.1) */
		container-type: inline-size;
	}
	.step {
		display: none;
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: var(--surface-button);
		color: var(--text-primary);
		font: inherit;
	}
	@container (max-width: 299px) {
		.slider {
			grid-template-columns: 1fr auto auto auto;
		}
		.slider input[type='range'] {
			display: none;
		}
		.step {
			display: inline-block;
		}
	}
	.readout {
		justify-content: space-between;
		min-height: 1.75rem;
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.heat {
		gap: var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.heat .bar {
		flex: 1;
	}
	.heat .value {
		color: var(--text-primary);
	}
	.readout .value {
		color: var(--text-primary);
		font-weight: 600;
	}
	.slider {
		display: grid;
		grid-template-columns: 1fr 2fr auto;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		font-size: var(--t-small);
	}
	.typed {
		width: 5.5rem;
		padding: 0.25rem 0.375rem;
		font: inherit;
		color: var(--text-primary);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-tile);
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
	.toggle-label {
		margin-right: auto;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.more summary {
		cursor: pointer;
		font-size: var(--t-small);
		color: var(--text-muted);
		padding: 0.25rem 0;
	}
	.note {
		margin: 0.25rem 0 0;
		font-size: var(--t-small);
		color: var(--warn);
	}
</style>
