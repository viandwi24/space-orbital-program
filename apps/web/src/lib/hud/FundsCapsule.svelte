<script lang="ts">
	/** The world's funds beside the world capsule (plan 132); the page shows it only with the economy on. */
	import { formatFunds } from '../format';

	let { funds }: { funds: number } = $props();
</script>

<div class="funds" data-testid="hud-funds" aria-label="Funds">
	<span class="label">Funds</span>
	<span class="value num">{formatFunds(funds)}</span>
</div>

<style>
	.funds {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: var(--capsule);
		padding: 0 0.875rem;
		box-sizing: border-box;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.label {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.value {
		font-size: var(--t-small);
		font-weight: 600;
		color: var(--text-primary);
	}
</style>
