<script lang="ts">
	import { graphicsBadge } from '../graphics-progress';
	import type { PrecompileProgress } from '@orbital/renderer/precompile-progress';

	let { progress }: { progress: PrecompileProgress | null } = $props();
	const badge = $derived(graphicsBadge(progress));
</script>

<!-- Shown only while the renderer compiles in the background; never covers the HUD, never takes the pointer. -->
{#if badge}
	<div class="badge" role="status" aria-live="off">
		<span class="label">{badge.label}</span>
		<span class="bar" aria-hidden="true"><span style:width="{badge.percent}%"></span></span>
		<span class="pct">{badge.percent}%</span>
	</div>
{/if}

<style>
	.badge {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: 3px var(--s-3);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--text-dim);
		font-size: var(--t-sm);
		pointer-events: none;
		opacity: 0.85;
	}
	.bar {
		width: 64px;
		height: 3px;
		border-radius: 2px;
		background: var(--line);
		overflow: hidden;
	}
	.bar > span {
		display: block;
		height: 100%;
		background: var(--c-accent);
		transition: width var(--dur-med) var(--ease);
	}
	.pct {
		font-variant-numeric: tabular-nums;
		min-width: 3ch;
		text-align: right;
	}
</style>
