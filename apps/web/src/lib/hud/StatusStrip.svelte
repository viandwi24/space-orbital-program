<script lang="ts">
	/**
	 * The status strip (V3 §2.2, plan 272, ADR 0253 point 7): the vessel's lasting conditions as
	 * chips under the navball module. A chip opens a popover with the cause and a fix; with no chip
	 * the strip says "All systems nominal". Colour is never alone: every chip has its words.
	 */
	import type { ChipFix, StatusChip } from './status-chips';

	let {
		chips,
		onfix,
		flash = null
	}: {
		chips: readonly StatusChip[];
		/** A chip a failed action points at flashes for 1.2 s (V3 §2.2, plan 274). */
		flash?: StatusChip['id'] | null;
		/** A chip's fix was pressed: open that dock panel. */
		onfix: (fix: ChipFix) => void;
	} = $props();

	let open = $state<StatusChip['id'] | null>(null);
	const shown = $derived(chips.find((c) => c.id === open) ?? null);
	$effect(() => {
		// a condition that ends closes its popover
		if (open && !shown) open = null;
	});
	function onkey(e: KeyboardEvent): void {
		if (e.key === 'Escape' && open) {
			e.stopPropagation();
			open = null;
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="strip" role="status" aria-label="Vessel status" onkeydown={onkey}>
	{#each chips as c (c.id)}
		<button
			type="button"
			class="chip {c.tone}"
			class:open={open === c.id}
			class:flash={flash === c.id}
			aria-expanded={open === c.id}
			data-testid={c.testid}
			data-tip="{c.title}: click for details"
			onclick={() => (open = open === c.id ? null : c.id)}
		>
			<span class="dot" aria-hidden="true"></span>{c.label}<span class="sr-only">, {c.reason}</span>
		</button>
	{:else}
		<span class="clear" data-testid="hud-nominal"
			><span class="dot ok" aria-hidden="true"></span>All systems nominal</span
		>
	{/each}
</div>

{#if shown}
	<div class="pop" role="dialog" aria-label={shown.title} data-testid="status-popover">
		<div class="head">
			<span class="dot {shown.tone}" aria-hidden="true"></span>
			<span class="title">{shown.title}</span>
			<button type="button" class="x" aria-label="Close" onclick={() => (open = null)}
				><svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"
					><path d="M6 6 L18 18 M18 6 L6 18" /></svg
				></button
			>
		</div>
		<p>{shown.body}</p>
		{#if shown.fix}
			{@const fix = shown.fix}
			<button
				type="button"
				class="fix"
				data-testid="status-fix"
				onclick={() => {
					open = null;
					onfix(fix);
				}}>{fix.label}</button
			>
		{/if}
	</div>
{/if}

<style>
	.strip {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-height: 1.25rem;
		pointer-events: auto;
	}
	/* pill 20 px, 8/700 caps (10 px floor), a 5 px dot (V3 §2.2) */
	.chip {
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		height: 1.25rem;
		padding: 0 0.4375rem;
		border: 1px solid transparent;
		border-radius: var(--radius-pill);
		background: var(--surface-inset);
		font: inherit;
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: var(--tracking-chip);
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
	}
	.chip.danger {
		--tone: var(--danger);
	}
	.chip.warning {
		--tone: var(--warn);
	}
	.chip.info {
		--tone: var(--ok);
	}
	.chip {
		color: var(--tone);
	}
	.chip:hover,
	.chip.open {
		background: var(--surface-chip);
	}
	.chip.open {
		border-color: rgb(255 255 255 / 0.22);
	}
	.chip.flash {
		background: var(--surface-chip);
		border-color: var(--tone);
		animation: flash 1.2s ease-out;
	}
	@keyframes flash {
		0%,
		50% {
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone) 35%, transparent);
		}
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chip.flash {
			animation: none;
		}
	}
	.chip:focus-visible,
	.x:focus-visible,
	.fix:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.dot {
		flex: none;
		width: 0.3125rem;
		height: 0.3125rem;
		border-radius: 50%;
		background: var(--tone, currentColor);
	}
	.dot.danger {
		background: var(--danger);
	}
	.dot.warning {
		background: var(--warn);
	}
	.dot.ok {
		width: 0.375rem;
		height: 0.375rem;
		background: var(--ok);
	}
	.clear {
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		font-size: var(--t-label);
		font-weight: 600;
		color: var(--text-muted);
	}
	.pop {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 0.5rem);
		transform: translateX(-50%);
		width: 17.5rem;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 0.875rem;
		background: rgb(22 23 26 / 0.9);
		border: 1px solid rgb(255 255 255 / 0.12);
		-webkit-backdrop-filter: blur(24px);
		backdrop-filter: blur(24px);
		pointer-events: auto;
		z-index: 2;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.head .dot {
		width: 0.375rem;
		height: 0.375rem;
	}
	.title {
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.x {
		margin-left: auto;
		display: grid;
		place-items: center;
		width: 1.375rem;
		height: 1.375rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-subtle);
		cursor: pointer;
	}
	.x svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
	}
	p {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1.45;
		color: var(--text-muted);
	}
	.fix {
		height: 1.875rem;
		border: 0;
		border-radius: 0.5rem;
		background: var(--selected-bg);
		color: var(--selected-fg);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 700;
		cursor: pointer;
	}
	:global(:root[data-contrast='more']) .chip {
		border-color: var(--tone);
	}
</style>
