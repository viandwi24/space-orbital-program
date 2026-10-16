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
			title={o.hint}
			class:on={o.value === value}
			onclick={() => onchange(o.value)}
			onkeydown={(e) => key(e, i)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		overflow: hidden;
	}
	button {
		min-height: 32px;
		padding: 0 var(--s-3);
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-dim);
		background: var(--panel-raised);
		border: 0;
		border-right: 1px solid var(--line);
	}
	button:last-child {
		border-right: 0;
	}
	button:hover {
		color: var(--text);
	}
	button.on {
		color: var(--c-ink);
		background: var(--c-accent);
		font-weight: 600;
	}
	button:focus-visible {
		outline-offset: -2px;
	}
</style>
