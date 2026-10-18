<script lang="ts">
	/**
	 * The Contracts tab of Administration (plan 099, ADR 0186; refs W5): Offered / Active /
	 * Completed with reward and stars, and the chosen contract's brief, objectives with checkboxes,
	 * terms, expected value and actions.
	 */
	import type { Snapshot } from '@orbital/core';
	import Button from '../ui/Button.svelte';
	import Panel from '../ui/Panel.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import { contractDetail, contractRows, type ContractTab } from './contracts-model';

	let {
		snapshot,
		day,
		tab,
		selected,
		disabled = false,
		ontab,
		onselect,
		onaction
	}: {
		snapshot: Snapshot | null;
		/** World-tick day length, s. */
		day: number;
		tab: ContractTab;
		selected: string | null;
		disabled?: boolean;
		ontab: (tab: ContractTab) => void;
		onselect: (id: string) => void;
		onaction: (action: 'accept' | 'decline' | 'cancel', id: string) => void;
	} = $props();

	const rows = $derived(contractRows(snapshot?.contracts, tab, snapshot?.t ?? 0, day));
	const detail = $derived(contractDetail(snapshot, selected ?? rows[0]?.id ?? null, day));
	const LABEL = { accept: 'Accept', decline: 'Decline', cancel: 'Cancel contract' } as const;
	const EMPTY = {
		offered: 'No offers right now; a new one can come each day.',
		active: 'No active contract. Accept one from the offers.',
		completed: 'Nothing completed or failed yet.'
	} as const;
</script>

<div class="bar">
	<Segmented
		label="Contracts"
		value={tab}
		options={[
			{ value: 'offered', label: 'Offered' },
			{ value: 'active', label: 'Active' },
			{ value: 'completed', label: 'Completed' }
		]}
		onchange={ontab}
		testid="contracts-tab"
	/>
</div>
{#if snapshot && !snapshot.contracts}
	<p class="empty" data-testid="contracts-off">
		Contracts need the economy and the contracts rule.
	</p>
{:else}
	<div class="cols">
		<Panel title="Contracts" data-testid="contracts-list">
			{#each rows as r (r.id)}
				<button
					type="button"
					class="row pick"
					aria-pressed={detail?.id === r.id}
					data-testid="contract-row"
					onclick={() => onselect(r.id)}
				>
					<span class="text"
						><span class="name">{r.title}</span><span class="sub"
							><span class="stars" aria-label="{r.stars} of 3 stars"
								>{'★'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)}</span
							>
							· {r.reward} · {r.status}</span
						></span
					>
				</button>
			{:else}
				<p class="empty">{EMPTY[tab]}</p>
			{/each}
		</Panel>

		<Panel title="Contract" data-testid="contract-detail">
			{#if detail}
				<h2>{detail.title}</h2>
				<p class="brief">{detail.brief}</p>
				<span class="cap">Objectives</span>
				<ul class="objectives">
					{#each detail.objectives as o, i (i)}
						<li data-done={o.done}>
							<input type="checkbox" checked={o.done} disabled aria-label={o.label} />
							<span>{o.label}</span>
						</li>
					{/each}
				</ul>
				<dl class="terms">
					{#each detail.terms as t (t.label)}
						<div>
							<dt>{t.label}</dt>
							<dd>{t.value}</dd>
						</div>
					{/each}
				</dl>
				<p class="value" data-testid="contract-value">{detail.value}</p>
				{#if detail.actions.length > 0}
					<div class="actions">
						{#each detail.actions as a (a)}
							<Button
								{disabled}
								variant={a === 'accept' ? 'primary' : a === 'cancel' ? 'danger' : 'default'}
								onclick={() => onaction(a, detail.id)}
								data-testid="contract-{a}">{LABEL[a]}</Button
							>
						{/each}
					</div>
				{/if}
			{:else}
				<p class="empty">Choose a contract on the list.</p>
			{/if}
		</Panel>
	</div>
{/if}

<style>
	.bar {
		margin-bottom: 0.75rem;
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 24rem) minmax(0, 32rem);
		gap: 0.75rem;
		align-items: start;
	}
	.row {
		display: flex;
		align-items: center;
		width: 100%;
		min-height: 3rem;
		padding: 0.25rem 0.5rem;
		border: 0;
		border-radius: var(--radius-row);
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		font: inherit;
	}
	.pick {
		cursor: pointer;
	}
	.pick:hover,
	.pick[aria-pressed='true'] {
		background: var(--surface-tile);
	}
	.text {
		display: grid;
		gap: 0.25rem;
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
	}
	.sub,
	.empty,
	.brief,
	.value {
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.stars {
		color: var(--text-secondary);
		letter-spacing: 0.05em;
	}
	h2 {
		margin: 0 0.25rem 0.5rem;
		font-size: 1.25rem;
		font-weight: 300;
		color: var(--text-primary);
	}
	.cap {
		display: block;
		margin: 0.75rem 0.25rem 0.25rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.objectives {
		margin: 0;
		padding: 0 0.25rem;
		list-style: none;
		font-size: var(--t-small);
		color: var(--text-primary);
	}
	.objectives li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.75rem;
	}
	.terms {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0.75rem 0.25rem;
	}
	.terms dt {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.terms dd {
		margin: 0.25rem 0 0;
		font-size: var(--t-small);
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin: 0.75rem 0.25rem 0.25rem;
	}
	@media (max-width: 760px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
