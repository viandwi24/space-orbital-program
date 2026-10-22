<script lang="ts">
	/** The coach mark beside the parts list after Build my own (plan 350, ADR 0299 point 2). */
	let { at, onclose }: { at: { x: number; y: number }; onclose: () => void } = $props();
</script>

<div class="coach" role="status" data-testid="vab-coach" style="left:{at.x}px;top:{at.y}px">
	<span class="arrow" aria-hidden="true"></span>
	<strong>Build your own</strong>
	<span
		>Pick a command pod in the parts list, then click the glowing ring on the platform. Add tanks
		and an engine below it.</span
	>
	<button type="button" class="x" onclick={onclose}>Got it</button>
</div>

<style>
	.coach {
		position: absolute;
		z-index: 5;
		display: grid;
		gap: 0.375rem;
		width: 15rem;
		padding: 0.75rem 0.875rem;
		border-radius: 0.875rem;
		background: #f4f4f5;
		color: #0b0b0c;
		box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
		animation: nudge 1.6s ease-in-out infinite;
	}
	.coach strong {
		font-size: var(--t-button);
	}
	.coach span {
		font-size: var(--t-small);
		line-height: 1.4;
	}
	.coach .arrow {
		position: absolute;
		left: -7px;
		top: 1.125rem;
		width: 14px;
		height: 14px;
		background: inherit;
		transform: rotate(45deg);
		border-radius: 2px;
	}
	.coach .x {
		justify-self: end;
		height: 1.75rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: #0b0b0c;
		color: #fff;
		font: inherit;
		font-size: var(--t-small);
		font-weight: 700;
		cursor: pointer;
	}
	@keyframes nudge {
		50% {
			transform: translateX(-4px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.coach {
			animation: none;
		}
	}
</style>
