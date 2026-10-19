<script lang="ts">
	/**
	 * The player glossary (plan 228): every term the HUD uses, with search and an anchor per entry
	 * (`/glossary#apoapsis`), reached from each term tooltip, the help overlay and the menu.
	 */
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import MenuShell from '../../lib/ui/MenuShell.svelte';
	import PageHead from '../../lib/ui/PageHead.svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import { glossaryEntry, searchGlossary } from '../../lib/public/glossary';

	let query = $state('');
	const entries = $derived(searchGlossary(query));
</script>

<PageMeta
	title="Glossary · {GAME_NAME}"
	description="Every term the {GAME_NAME} flight screen uses, explained in plain words: apoapsis, delta-v, TWR, SAS and more."
/>

<MenuShell wide>
	<PageHead title="Glossary" />
	<label class="search">
		<span class="sr-only">Search the glossary</span>
		<input
			type="search"
			placeholder="Search: Ap, TWR, delta-v…"
			bind:value={query}
			data-testid="glossary-search"
		/>
	</label>
	<dl data-testid="glossary-list">
		{#each entries as e (e.id)}
			<div class="entry" id={e.id} data-testid="glossary-entry">
				<dt>
					{e.term}{#if e.abbr}<span class="abbr">{e.abbr}</span>{/if}
				</dt>
				<dd>
					<p>{e.long}</p>
					{#if e.related?.length}
						<p class="related">
							See also:
							{#each e.related as r, i (r)}{#if i > 0},
								{/if}<a href="#{r}">{glossaryEntry(r)?.term ?? r}</a>{/each}
						</p>
					{/if}
				</dd>
			</div>
		{:else}
			<p class="none">No term matches "{query}".</p>
		{/each}
	</dl>
</MenuShell>

<style>
	.search input {
		width: 100%;
		max-width: 24rem;
		min-height: 2.5rem;
		padding: 0 var(--s-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		color: var(--text-body, var(--text));
		font: inherit;
	}
	dl {
		display: grid;
		gap: var(--s-4);
		margin: var(--s-4) 0 0;
	}
	.entry {
		scroll-margin-top: 5rem;
	}
	.entry:target dt {
		color: var(--accent-text);
	}
	dt {
		font-weight: 600;
		color: var(--text);
	}
	.abbr {
		margin-left: 0.5rem;
		padding: 0 0.375rem;
		border-radius: var(--radius-pill);
		background: var(--surface-chip);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		color: var(--text-secondary);
	}
	dd {
		margin: var(--s-1) 0 0;
		color: var(--text-dim);
	}
	dd p {
		margin: 0;
	}
	.related {
		margin-top: var(--s-1);
		font-size: var(--t-sm);
	}
	.none {
		color: var(--text-muted);
	}
</style>
