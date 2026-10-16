<script lang="ts">
	import { GAME_NAME } from '../public/about';

	/** Full-screen loading state (plan 023): the wordmark, what the page is waiting for, a moving bar. */
	let {
		step,
		overlay = false
	}: {
		step: string;
		/** Covers a page that is already mounted (the flight canvas). */ overlay?: boolean;
	} = $props();
</script>

<div class="loading" class:overlay role="status" aria-live="polite" data-testid="loading-screen">
	<svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
		<ellipse
			cx="24"
			cy="24"
			rx="20"
			ry="8"
			transform="rotate(-24 24 24)"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
		/>
		<circle cx="24" cy="24" r="6.5" fill="currentColor" />
		<circle class="moon" cx="40.5" cy="16.5" r="2.8" fill="var(--c-accent)" />
	</svg>
	<p class="name">{GAME_NAME}</p>
	<div class="bar" aria-hidden="true"><span></span></div>
	<p class="step">{step}</p>
</div>

<style>
	.loading {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: var(--s-3);
		min-height: 100vh;
		min-height: 100dvh;
		color: var(--text);
		background: radial-gradient(ellipse at 50% 42%, #10243a 0%, var(--bg-void) 70%);
	}
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 20;
		min-height: 0;
	}
	.name {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
		letter-spacing: 0.32em;
		text-transform: uppercase;
	}
	.step {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.bar {
		width: 180px;
		height: 3px;
		overflow: hidden;
		background: rgb(150 180 210 / 0.18);
		border-radius: 2px;
	}
	.bar span {
		display: block;
		width: 40%;
		height: 100%;
		background: var(--c-accent);
		animation: slide 1.3s var(--ease) infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(260%);
		}
	}
</style>
