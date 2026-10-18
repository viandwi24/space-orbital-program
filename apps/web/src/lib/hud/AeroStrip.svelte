<script lang="ts">
	import type { AeroReadout } from '../aircraft/aero-readout';

	let { aero }: { aero: AeroReadout } = $props();
</script>

<!-- Plan 063, ADR 0161 point 6: angle of attack, indicated airspeed, glide ratio, stall warning. -->
<div class="strip" class:stall={aero.stall} role="status" aria-live="polite" data-testid="hud-aero">
	<span><span class="k">AoA</span> <span class="num">{aero.aoa.toFixed(1)}°</span></span>
	<span><span class="k">IAS</span> <span class="num">{aero.ias.toFixed(0)} m/s</span></span>
	{#if aero.glide !== null}<span
			><span class="k">Glide</span> <span class="num">{aero.glide.toFixed(1)}</span></span
		>{/if}
	{#if aero.stall}<span class="warn" data-testid="hud-stall">Stall</span>{/if}
</div>

<style>
	.strip {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		padding: 3px var(--s-4);
		background: var(--panel);
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: var(--t-sm);
		color: var(--text-dim);
		pointer-events: none;
	}
	.stall {
		border-color: var(--c-warning);
	}
	.k {
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.num {
		color: var(--text, inherit);
		font-variant-numeric: tabular-nums;
	}
	.warn {
		font-weight: 700;
		color: var(--c-warning);
		text-transform: uppercase;
	}
</style>
