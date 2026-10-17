<script lang="ts">
	let {
		value,
		tone = 'accent',
		label,
		vertical = false
	}: {
		/** 0..1 */
		value: number;
		tone?: 'accent' | 'positive' | 'warning' | 'danger';
		label: string;
		vertical?: boolean;
	} = $props();
	const clamped = $derived(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)));
</script>

<div
	class="meter {tone}"
	class:vertical
	role="meter"
	aria-label={label}
	aria-valuemin="0"
	aria-valuemax="100"
	aria-valuenow={Math.round(clamped * 100)}
>
	<div class="fill" style:--v={clamped}></div>
</div>

<style>
	.meter {
		position: relative;
		height: 0.375rem;
		background: var(--surface-track);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}
	.vertical {
		height: 100%;
		width: 0.5rem;
	}
	.fill {
		position: absolute;
		inset: 0;
		background: var(--tone);
		transform-origin: left center;
		transform: scaleX(var(--v));
	}
	.vertical .fill {
		transform-origin: center bottom;
		transform: scaleY(var(--v));
	}
	.accent {
		--tone: var(--accent);
	}
	.positive {
		--tone: var(--ok);
	}
	.warning {
		--tone: var(--warn);
	}
	.danger {
		--tone: var(--danger);
	}
</style>
