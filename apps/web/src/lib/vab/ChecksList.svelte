<script lang="ts">
	import { verdictOf, type Check } from '../editor/checks';

	/**
	 * Pre-flight checks (plan 093, ADR 0148; refs Hangar): one verdict, then each check with a dot for
	 * its level and the part at fault. Hovering or focusing a check highlights its parts.
	 */
	let {
		checks,
		onflag,
		titleOf
	}: {
		checks: readonly Check[];
		/** Parts to highlight in the 3D view while a check is hovered or focused. */
		onflag: (parts: number[]) => void;
		/** A part's title by design index, to name the part at fault. */
		titleOf?: (index: number) => string;
	} = $props();

	const verdict = $derived(verdictOf(checks));
	const VERDICT = { go: 'Go', caution: 'Caution', 'no-go': 'No-go' } as const;
	const where = (c: Check): string | null => {
		if (!titleOf || c.parts.length === 0) return null;
		const first = titleOf(c.parts[0]!);
		return c.parts.length === 1 ? first : `${first} and ${c.parts.length - 1} more`;
	};
</script>

<section class="checks" aria-label="Pre-flight checks">
	<header>
		<h2>Pre-flight checks</h2>
		<span class="verdict {verdict}" data-testid="preflight-verdict"
			><span class="dot" aria-hidden="true"></span>{VERDICT[verdict]}</span
		>
	</header>
	{#if checks.length === 0}
		<p class="ok"><span class="dot go" aria-hidden="true"></span>Ready for launch.</p>
	{:else}
		<ul>
			{#each checks as c (c.id)}
				{@const at = where(c)}
				<li onmouseenter={() => onflag(c.parts)} onmouseleave={() => onflag([])}>
					<button
						type="button"
						onfocus={() => onflag(c.parts)}
						onblur={() => onflag([])}
						aria-label="{c.level === 'no-go' ? 'No-go' : 'Caution'}: {c.text}{at
							? ` At ${at}.`
							: ''} {c.hint}"
					>
						<span class="dot {c.level}" aria-hidden="true"></span>
						<span class="text">
							<span class="what">{c.text}</span>
							{#if at}<span class="at">{at}</span>{/if}
							<span class="how">{c.hint}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	/* refs: a glass panel, a capital header, rows with a status dot */
	.checks {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--panel-pad);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 1.375rem;
		padding: 0 0.375rem;
	}
	h2 {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.verdict {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		text-transform: uppercase;
		color: var(--text-primary);
	}
	.dot {
		flex: none;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--text-subtle);
	}
	.go .dot,
	.dot.go {
		background: var(--ok);
	}
	.caution .dot,
	.dot.caution {
		background: var(--warn);
	}
	.no-go .dot,
	.dot.no-go {
		background: var(--offline);
	}
	.ok {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.375rem;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	button {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		font: inherit;
		cursor: default;
	}
	button:hover,
	button:focus-visible {
		background: var(--surface-hover);
		outline: none;
	}
	button .dot {
		margin-top: 0.25rem;
	}
	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.what {
		font-size: var(--t-small);
		line-height: 1.25;
		color: var(--text-body);
	}
	.at {
		font-size: var(--t-label);
		font-weight: 600;
		color: var(--text-primary);
	}
	.how {
		font-size: var(--t-label);
		line-height: 1.25;
		color: var(--text-muted);
	}
</style>
