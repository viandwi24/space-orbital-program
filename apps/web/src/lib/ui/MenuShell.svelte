<script lang="ts">
	import type { Snippet } from 'svelte';
	import { GAME_NAME, GAME_VERSION } from '../public/about';
	import SpaceBackdrop from './SpaceBackdrop.svelte';

	/**
	 * The page frame of the menu and the public pages (plan 089, refs Home): space backdrop, the
	 * letter-spaced wordmark, a column of content (a glass sheet on the wide public pages), an
	 * optional card at the bottom right, and the version footer.
	 */
	let {
		children,
		footer,
		aside,
		wide = false
	}: { children: Snippet; footer?: Snippet; aside?: Snippet; wide?: boolean } = $props();
</script>

<SpaceBackdrop />
<div class="page" class:wide>
	<header>
		<a class="mark" href="/" aria-label="{GAME_NAME}, main menu">
			<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
				<ellipse
					cx="12"
					cy="12"
					rx="10"
					ry="4"
					transform="rotate(-24 12 12)"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
				/>
				<circle cx="12" cy="12" r="3.2" fill="currentColor" />
			</svg>
			<span>{GAME_NAME}</span>
		</a>
	</header>
	<main>
		{@render children()}
	</main>
	{#if aside}<aside>{@render aside()}</aside>{/if}
	<footer>
		{#if footer}{@render footer()}{:else}<span class="mono">{GAME_NAME} {GAME_VERSION}</span>{/if}
	</footer>
</div>

<style>
	.page {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 25rem) 1fr auto;
		grid-template-rows: auto 1fr auto;
		grid-template-areas:
			'head head head'
			'main . .'
			'foot . aside';
		column-gap: var(--s-6);
		min-height: 100vh;
		min-height: 100dvh;
		padding: 2.5rem var(--margin-menu) 2rem;
		box-sizing: border-box;
	}
	.page.wide {
		grid-template-columns: minmax(0, 54rem) 1fr;
		grid-template-areas:
			'head head'
			'main .'
			'foot .';
	}
	header {
		grid-area: head;
	}
	.mark {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-primary);
		text-decoration: none;
		font-size: 0.9375rem;
		line-height: 1;
		font-weight: 600;
		letter-spacing: 0.32em;
		text-transform: uppercase;
	}
	.mark:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 6px;
		border-radius: var(--radius-tile);
	}
	main {
		grid-area: main;
		align-self: start;
		padding-top: clamp(2rem, 16vh, 10.5rem);
	}
	.wide main {
		align-self: start;
		margin: 2.5rem 0 var(--s-5);
		padding: var(--s-5) var(--s-6);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	aside {
		grid-area: aside;
		align-self: end;
		margin-bottom: 3rem;
	}
	footer {
		grid-area: foot;
		align-self: end;
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-4);
		margin-top: var(--s-5);
		font-size: var(--t-label);
		line-height: 1;
		color: var(--text-subtle);
	}
	footer :global(.mono) {
		font-family: var(--font-mono);
	}
	@media (max-width: 1100px) {
		.page,
		.page.wide {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'head' 'main' 'aside' 'foot';
			padding: 2rem clamp(1rem, 5vw, 3rem) 1.5rem;
		}
		main {
			padding-top: 2rem;
		}
		aside {
			margin: var(--s-5) 0 0;
			justify-self: start;
		}
	}
	@media (max-width: 760px) {
		.wide main {
			padding: var(--s-4);
		}
	}
</style>
