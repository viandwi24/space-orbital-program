<script lang="ts" generics="T extends string">
	/** A row of mutually exclusive choices (a radio group drawn as a segmented control). */
	let {
		label,
		value,
		options,
		onchange,
		testid
	}: {
		label: string;
		value: T;
		options: readonly { value: T; label: string; hint?: string }[];
		onchange: (value: T) => void;
		testid?: string;
	} = $props();

	function key(e: KeyboardEvent, index: number): void {
		const step =
			e.key === 'ArrowRight' || e.key === 'ArrowDown'
				? 1
				: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		e.preventDefault();
		const next = options[(index + step + options.length) % options.length]!;
		onchange(next.value);
		queueMicrotask(() =>
			(e.currentTarget as HTMLElement | null)?.parentElement
				?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)
				?.focus()
		);
	}
</script>

<div class="seg" role="radiogroup" aria-label={label} data-testid={testid}>
	{#each options as o, i (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={o.value === value}
			tabindex={o.value === value ? 0 : -1}
			data-value={o.value}
			data-tip={o.hint}
			class:on={o.value === value}
			onclick={() => onchange(o.value)}
			onkeydown={(e) => key(e, i)}>{o.label}</button
		>
	{/each}
</div>

<style>
	/* Refs segmented control: a pill track with padding 4; the chosen item is the selected white. */
	.seg {
		display: inline-flex;
		gap: 0.125rem;
		padding: 0.25rem;
		border-radius: var(--radius-pill);
		background: var(--surface-button);
	}
	button {
		min-height: 2.125rem;
		padding: 0 0.875rem;
		font-size: var(--t-small);
		font-weight: 700;
		color: var(--text-muted);
		background: transparent;
		border: 0;
		border-radius: var(--radius-pill);
	}
	@media (pointer: coarse) {
		button {
			min-height: var(--touch-min);
		}
	}
	button:hover {
		color: var(--text-primary);
	}
	button.on {
		color: var(--selected-fg);
		background: var(--selected-bg);
	}
	button:focus-visible {
		outline-offset: -2px;
	}
</style>
