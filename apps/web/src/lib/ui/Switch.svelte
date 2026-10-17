<script lang="ts">
	/**
	 * An on/off switch (refs: 30 x 18, white knob, accent when on). `mixed` is for a switch that stands
	 * for a group (some on, some off); it is then a tri-state checkbox to assistive tech, since the
	 * `switch` role has no mixed state. Clicking a mixed switch turns it on.
	 */
	let {
		checked,
		label,
		onchange,
		disabled = false,
		testid
	}: {
		checked: boolean | 'mixed';
		label: string;
		onchange?: (on: boolean) => void;
		disabled?: boolean;
		testid?: string;
	} = $props();
	const mixed = $derived(checked === 'mixed');
</script>

<button
	type="button"
	class="switch"
	class:on={checked === true}
	class:mixed
	role={mixed ? 'checkbox' : 'switch'}
	aria-checked={mixed ? 'mixed' : checked === true}
	aria-label={label}
	{disabled}
	data-testid={testid}
	onclick={() => onchange?.(checked !== true)}
></button>

<style>
	.switch {
		position: relative;
		flex: none;
		width: 1.875rem;
		height: 1.125rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-track);
		transition: background var(--dur-fast) var(--ease);
	}
	/* the hit area grows to the touch minimum on touch screens; the drawing stays 30 x 18 */
	@media (pointer: coarse) {
		.switch::after {
			content: '';
			position: absolute;
			inset: 50% auto auto 50%;
			width: var(--touch-min);
			height: var(--touch-min);
			transform: translate(-50%, -50%);
		}
	}
	.switch::before {
		content: '';
		position: absolute;
		top: 0.125rem;
		left: 0.125rem;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		background: var(--text-primary);
		transition: transform var(--dur-fast) var(--ease);
	}
	.on {
		background: var(--accent);
	}
	.on::before {
		transform: translateX(0.75rem);
	}
	.mixed {
		background: var(--accent-mixed);
	}
	.mixed::before {
		transform: translateX(0.375rem);
	}
	.switch:disabled {
		opacity: 0.45;
	}
</style>
