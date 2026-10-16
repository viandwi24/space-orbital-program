<script lang="ts">
	import Icon from '../ui/Icon.svelte';
	import type { Check } from '../editor/checks';

	let {
		checks,
		onflag
	}: {
		checks: readonly Check[];
		/** Parts to highlight in the 3D view while a check is hovered or focused. */
		onflag: (parts: number[]) => void;
	} = $props();
</script>

<section class="checks" aria-label="Launch checks">
	{#if checks.length === 0}
		<p class="ok"><Icon name="check" size={16} /> Ready for launch.</p>
	{:else}
		<ul>
			{#each checks as c (c.id)}
				<li class={c.severity} onmouseenter={() => onflag(c.parts)} onmouseleave={() => onflag([])}>
					<button
						type="button"
						onfocus={() => onflag(c.parts)}
						onblur={() => onflag([])}
						aria-label="{c.severity === 'error' ? 'Problem' : 'Warning'}: {c.text} {c.hint}"
					>
						<span class="ico"
							><Icon name={c.severity === 'error' ? 'flame' : 'alert'} size={16} /></span
						>
						<span class="text">
							<span class="what">{c.text}</span>
							<span class="how">{c.hint}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.checks {
		padding: var(--s-2) var(--s-3);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	.ok {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin: 0;
		font-size: var(--t-sm);
		color: var(--c-positive);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
		max-height: 190px;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	li button {
		display: grid;
		grid-template-columns: 18px 1fr;
		gap: var(--s-2);
		width: 100%;
		padding: var(--s-1) 0;
		text-align: left;
		background: transparent;
		border: 0;
		cursor: default;
	}
	.ico {
		margin-top: 1px;
	}
	.warning .ico {
		color: var(--c-warning);
	}
	.error .ico {
		color: var(--c-danger);
	}
	.what {
		display: block;
		font-size: var(--t-sm);
		color: var(--text);
	}
	.how {
		display: block;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
</style>
