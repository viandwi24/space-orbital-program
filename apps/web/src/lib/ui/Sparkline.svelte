<script lang="ts">
	/** A small line of recent values (plan 112), scaled to its own range; no axes. */
	let { values, label }: { values: readonly number[]; label: string } = $props();

	const W = 120;
	const H = 28;
	const d = $derived.by(() => {
		if (values.length < 2) return '';
		const lo = Math.min(...values);
		const hi = Math.max(...values);
		const span = hi - lo || 1;
		return values
			.map((v, i) => {
				const x = (i / (values.length - 1)) * W;
				const y = H - 2 - ((v - lo) / span) * (H - 4);
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join('');
	});
</script>

<svg
	viewBox="0 0 {W} {H}"
	width="100%"
	height={H}
	role="img"
	aria-label={label}
	preserveAspectRatio="none"
>
	<path
		{d}
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
	/>
</svg>

<style>
	svg {
		display: block;
		color: var(--text-primary);
	}
</style>
