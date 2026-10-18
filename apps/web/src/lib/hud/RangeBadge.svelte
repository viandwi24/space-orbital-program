<script lang="ts">
	let { warning }: { warning: string | null } = $props();
</script>

<!-- Plan 127, ADR 0155 point 6: the next spent stage, dropped now, would break the range. -->
{#if warning}
	<div class="badge" role="status" aria-live="polite" data-testid="hud-range">
		<span class="label">Range</span>
		<span class="why">{warning} (predicted)</span>
	</div>
{/if}

<style>
	.badge {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		padding: 3px var(--s-4);
		background: var(--panel);
		border: 1px solid var(--c-warning);
		border-radius: 999px;
		font-size: var(--t-sm);
		pointer-events: none;
	}
	.label {
		font-weight: 600;
		color: var(--c-warning);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.why {
		color: var(--text-dim);
	}
</style>
