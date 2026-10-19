<script lang="ts">
	/**
	 * The part inspector in the Hangar (plan 218, ADR 0225): the selected part's build-time controls
	 * (fuel fill, thrust limiter, gimbal, chute settings, crossfeed) drawn by the same rows as the
	 * flight inspector, writing the design's per-part settings for its whole symmetry group unless
	 * "Only this part" is set.
	 */
	import ControlRows from '../vessel-panel/ControlRows.svelte';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();

	const row = $derived(vab.selectedBuild);
</script>

{#if row && row.controls.length > 0}
	<section class="settings" aria-label="Part settings" data-testid="build-settings">
		<h3>Settings</h3>
		<ControlRows
			part={row}
			prefix="build"
			typed
			send={(_part, c, value) => {
				if (value !== undefined) vab.setBuild(c, value);
			}}
		/>
	</section>
{/if}

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 4px;
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
</style>
