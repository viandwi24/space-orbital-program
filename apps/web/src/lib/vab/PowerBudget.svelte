<script lang="ts">
	/**
	 * The power budget (plan 218): electric charge made and drawn by day and by night, by kind of
	 * part, and how long the batteries last when the night balance is negative.
	 */
	import type { PowerView } from '../editor/power';
	import { formatDuration } from '../format';

	let { power }: { power: PowerView | null } = $props();

	const rate = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
</script>

{#if power}
	{@const t = power.total}
	<details class="power" aria-label="Power budget" data-testid="power-budget">
		<summary>
			<h3>Power · EC/s</h3>
			<span class="sum num" class:neg={t.night < 0 || t.day < 0}
				>{rate(t.day)} day · {rate(t.night)} night</span
			>
		</summary>
		<table>
			<thead>
				<tr><th scope="col">Part</th><th scope="col">Day</th><th scope="col">Night</th></tr>
			</thead>
			<tbody>
				{#each power.rows as r (r.part)}
					<tr>
						<td>{r.count > 1 ? `${r.count} × ` : ''}{r.title}</td>
						<td class="num">{rate(r.day)}</td>
						<td class="num">{rate(r.night)}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<th scope="row">Balance</th>
					<td class="num" class:neg={t.day < 0} data-testid="power-day">{rate(t.day)}</td>
					<td class="num" class:neg={t.night < 0} data-testid="power-night">{rate(t.night)}</td>
				</tr>
			</tfoot>
		</table>
		<p class="status" data-testid="power-status">
			<span class="dot" class:warn={t.night < 0 || t.day < 0} aria-hidden="true"></span>
			{#if t.day < 0}
				Drains even in sun{t.capacity > 0
					? ` · ${formatDuration(t.capacity / -t.day)} of charge`
					: ''}
			{:else if t.nightReserve !== null}
				Batteries last {formatDuration(t.nightReserve)} at night · {Math.round(t.capacity)} EC
			{:else}
				Balanced day and night · {Math.round(t.capacity)} EC stored
			{/if}
		</p>
	</details>
{/if}

<style>
	.power {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		backdrop-filter: blur(28px) saturate(160%);
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 6px;
		min-height: 22px;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.sum {
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	h3 {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	th,
	td {
		padding: 3px 6px;
		text-align: right;
		font-weight: 400;
	}
	th:first-child,
	td:first-child {
		text-align: left;
	}
	thead th {
		color: var(--text-muted);
	}
	tfoot th,
	tfoot td {
		color: var(--text-primary);
		font-weight: 600;
	}
	.neg {
		color: var(--warn);
	}
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 0 6px;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.dot {
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 50%;
		background: var(--ok);
	}
	.dot.warn {
		background: var(--warn);
	}
</style>
