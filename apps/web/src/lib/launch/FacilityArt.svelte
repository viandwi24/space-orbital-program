<script lang="ts">
	/** Line art of a launch pad or a runway for the Launch page's facility cards (plan 346). */
	let { kind }: { kind: 'pad' | 'runway' } = $props();
</script>

<svg viewBox="0 0 96 56" width="96" height="56" aria-hidden="true">
	{#if kind === 'pad'}
		<ellipse cx="48" cy="44" rx="34" ry="8" class="ground" />
		<ellipse cx="48" cy="44" rx="18" ry="4" class="line" />
		<path
			d="M66 44 V10 M72 44 V10 M66 14 H72 M66 22 H72 M66 30 H72 M66 38 H72 M66 18 H56"
			class="line"
		/>
		<path d="M44 40 V20 L48 12 L52 20 V40 Z" class="line ship" />
	{:else}
		<path d="M4 48 L36 18 H60 L92 48 Z" class="ground" />
		<path d="M48 22 V26 M48 30 V35 M48 39 V46" class="line dash" />
		<path d="M20 48 L42 18 M76 48 L54 18" class="line faint" />
	{/if}
</svg>

<style>
	svg {
		display: block;
		flex: none;
	}
	.ground {
		fill: rgb(255 255 255 / 0.05);
		stroke: rgb(255 255 255 / 0.18);
		stroke-width: 1;
	}
	.line {
		fill: none;
		stroke: var(--text-secondary);
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ship {
		fill: rgb(255 255 255 / 0.08);
	}
	.dash {
		stroke-width: 2;
	}
	.faint {
		stroke: rgb(255 255 255 / 0.18);
	}
</style>
