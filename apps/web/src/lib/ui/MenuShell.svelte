<script lang="ts">
	import type { Snippet } from 'svelte';
	import { GAME_NAME, GAME_VERSION } from '../public/about';

	/** The page frame of the menu and the public pages: backdrop image, wordmark, a column of content. */
	let {
		children,
		footer,
		wide = false
	}: { children: Snippet; footer?: Snippet; wide?: boolean } = $props();
</script>

<div class="backdrop" aria-hidden="true"></div>
<div class="shade" aria-hidden="true"></div>
<div class="page">
	<header>
		<a class="mark" href="/" aria-label="{GAME_NAME}, main menu">
			<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
				<ellipse
					cx="24"
					cy="24"
					rx="20"
					ry="8"
					transform="rotate(-24 24 24)"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
				/>
				<circle cx="24" cy="24" r="6.5" fill="currentColor" />
				<circle cx="40.5" cy="16.5" r="2.8" fill="var(--c-accent)" />
			</svg>
			<span>{GAME_NAME}</span>
		</a>
	</header>
	<main class:wide>
		{@render children()}
	</main>
	<footer>
		{#if footer}{@render footer()}{:else}<span class="num">{GAME_NAME} {GAME_VERSION}</span>{/if}
	</footer>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background:
			radial-gradient(ellipse at 78% 62%, #1d4a6b 0%, #0b1a2a 38%, var(--bg-void) 72%),
			var(--bg-void);
		background-image: url('/menu-orbit.jpg');
		background-size: cover;
		background-position: center;
	}
	.shade {
		position: fixed;
		inset: 0;
		background:
			linear-gradient(90deg, rgb(4 7 11 / 0.92) 0%, rgb(4 7 11 / 0.7) 34%, rgb(4 7 11 / 0.05) 70%),
			linear-gradient(0deg, rgb(4 7 11 / 0.7) 0%, transparent 28%);
	}
	.page {
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr auto;
		min-height: 100vh;
		min-height: 100dvh;
		padding: var(--s-5) clamp(var(--s-4), 5vw, 80px);
		box-sizing: border-box;
	}
	.mark {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		color: var(--text);
		text-decoration: none;
		font-size: var(--t-lg);
		font-weight: 600;
		letter-spacing: 0.32em;
		text-transform: uppercase;
	}
	main {
		align-self: center;
		width: min(400px, 100%);
		padding: var(--s-5) 0;
	}
	main.wide {
		width: min(860px, 100%);
		align-self: start;
	}
	footer {
		font-size: var(--t-xs);
		color: var(--text-dim);
		display: flex;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
</style>
