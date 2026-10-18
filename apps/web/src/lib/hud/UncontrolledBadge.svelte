<script lang="ts">
	/** Why the vessel takes no control commands (plan 208, ADR 0214); null hides the chip. */
	let { reason }: { reason: 'no-source' | 'no-power' | null } = $props();
	const WHY = { 'no-source': 'no crew or probe core', 'no-power': 'no power' } as const;
</script>

<!-- ADR 0109: the vessel ignores throttle, staging and SAS; text, never colour alone -->
{#if reason}
	<div class="badge" role="status" aria-live="polite" data-testid="hud-uncontrolled">
		<span class="label">Uncontrolled</span>
		<span class="why">{WHY[reason]}</span>
	</div>
{/if}

<style>
	.badge {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		padding: 3px var(--s-4);
		background: var(--panel);
		border: 1px solid var(--c-danger);
		border-radius: 999px;
		font-size: var(--t-sm);
		pointer-events: none;
	}
	.label {
		font-weight: 600;
		color: var(--c-danger);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.why {
		color: var(--text-dim);
	}
</style>
