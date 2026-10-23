<script lang="ts">
	/**
	 * The Finances tab of Administration (player-journey audit Q3, ADR 0324): where the money comes
	 * from and goes every 30 days, the loan with Borrow and Repay, and how the agency's money works.
	 */
	import Button from '../ui/Button.svelte';
	import Panel from '../ui/Panel.svelte';
	import { financeAmount, type FinanceView } from './finances-model';
	import { formatFunds } from '../format';

	let {
		view,
		disabled = false,
		onloan
	}: {
		view: FinanceView | null;
		disabled?: boolean;
		onloan: (action: 'take' | 'repay', amount: number) => void;
	} = $props();
</script>

{#if !view}
	<p class="empty" data-testid="finances-off">This world has no money to count.</p>
{:else}
	<div class="cards" data-testid="finances">
		<Panel title="Every 30 days">
			<dl class="lines">
				{#each view.lines as l (l.label)}
					<dt>{l.label}</dt>
					<dd class:cost={l.amount < 0}>{financeAmount(l.amount)}</dd>
				{/each}
				<dt class="net">Net, with no launches</dt>
				<dd class="net" class:cost={view.net < 0} data-testid="finances-net">
					{financeAmount(view.net)}
				</dd>
			</dl>
		</Panel>
		<Panel title="Loan">
			<p class="line" data-testid="loan-owed">
				Owed: {formatFunds(view.loan.owed)} of {formatFunds(view.loan.limit)} funds
				{#if view.loan.owed > 0}· interest {financeAmount(-view.loan.interest)} every 30 days{/if}
			</p>
			<div class="actions">
				<Button
					disabled={disabled || view.loan.borrow <= 0}
					onclick={() => onloan('take', view.loan.borrow)}
					data-testid="loan-take">Borrow {formatFunds(view.loan.borrow)}</Button
				>
				<Button
					disabled={disabled || view.loan.repay <= 0}
					onclick={() => onloan('repay', view.loan.repay)}
					data-testid="loan-repay">Repay {formatFunds(view.loan.repay)}</Button
				>
			</div>
		</Panel>
		<Panel title="How the money works">
			<ul class="notes">
				{#each view.notes as n (n)}<li>{n}</li>{/each}
			</ul>
		</Panel>
	</div>
{/if}

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: 0.75rem;
	}
	.empty,
	.line,
	.notes {
		color: var(--text-secondary);
		font-size: var(--t-sm, 0.8125rem);
	}
	.lines {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.375rem 1rem;
		margin: 0;
		font-size: var(--t-sm, 0.8125rem);
	}
	dt {
		color: var(--text-secondary);
	}
	dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	dd.cost {
		color: var(--text-muted);
	}
	.net {
		font-weight: 700;
		border-top: 1px solid var(--border-subtle);
		padding-top: 0.375rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.notes {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.375rem;
	}
</style>
