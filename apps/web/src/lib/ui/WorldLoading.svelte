<script lang="ts" module>
	/** One background picture: an in-game shot (plan 370) and its caption. */
	export interface LoadingSlide {
		src: string;
		caption: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { GAME_NAME } from '../public/about';

	/**
	 * The world's loading screen (plan 370, the owner's request of 2026-10-22): the game's own shots
	 * crossfading full screen with a slow pan, and the progress in the bottom-right corner, as console
	 * games of the PlayStation era did. Everything that moves is a CSS animation of transform or
	 * opacity, which the compositor runs while the page's thread is busy (a long shader compile), so
	 * the screen never looks frozen. With reduced motion the pictures change without the pan.
	 */
	let {
		step,
		stepIndex = 0,
		stepCount = 0,
		fraction = null,
		detail = '',
		current = '',
		startedAt = null,
		error = null,
		lowered = false,
		onlower = null,
		slides = [],
		tips = []
	}: {
		step: string;
		/** The step's place in the load (1-based) and the number of steps, for "2 / 5". */
		stepIndex?: number;
		stepCount?: number;
		/** Share of the step done, 0 to 1; null for a moving bar. */
		fraction?: number | null;
		/** What is left of the step ("12 of 31 shader pipelines ready"). */
		detail?: string;
		/** What is compiling now (a pipeline's label). */
		current?: string;
		/** `performance.now()` when the load began, for the elapsed time. */
		startedAt?: number | null;
		error?: string | null;
		/** "Continue with lower quality" was chosen. */
		lowered?: boolean;
		/** Shown after `LOWER_AFTER_MS`; null hides it. */
		onlower?: (() => void) | null;
		slides?: readonly LoadingSlide[];
		tips?: readonly string[];
	} = $props();

	/** When the "Continue with lower quality" button shows. */
	const LOWER_AFTER_MS = 15_000;
	/** Each picture's time on screen. */
	const SLIDE_MS = 7_000;

	let now = $state(performance.now());
	let slide = $state(0);
	let shown = $state<number[]>([0]);
	onMount(() => {
		const tick = setInterval(() => (now = performance.now()), 250);
		const next = setInterval(() => {
			if (slides.length < 2) return;
			slide = (slide + 1) % slides.length;
			// keep the previous picture underneath while the new one fades in
			shown = [...shown.filter((i) => i !== slide).slice(-1), slide];
			// the one after next starts loading now
			const after = slides[(slide + 1) % slides.length];
			if (after) new Image().src = after.src;
		}, SLIDE_MS);
		const first = slides[1];
		if (first) new Image().src = first.src;
		return () => {
			clearInterval(tick);
			clearInterval(next);
		};
	});

	const elapsed = $derived(startedAt === null ? 0 : Math.max(0, now - startedAt));
	const elapsedText = $derived(
		elapsed < 60_000
			? `${Math.floor(elapsed / 1000)} s`
			: `${Math.floor(elapsed / 60_000)} min ${Math.floor((elapsed % 60_000) / 1000)} s`
	);
	const tip = $derived(tips.length ? tips[slide % tips.length] : '');
</script>

<div class="world-loading-screen" role="status" aria-live="polite" data-testid="loading-screen">
	<div class="slides" aria-hidden="true">
		{#each shown as i (i)}
			{@const s = slides[i]}
			{#if s}
				<img class="slide" src={s.src} alt="" decoding="async" />
			{/if}
		{/each}
		<div class="shade"></div>
	</div>

	<p class="name">{GAME_NAME}</p>

	<div class="caption">
		{#if slides[slide]?.caption}<p class="scene">{slides[slide]?.caption}</p>{/if}
		{#if tip}<p class="tip"><span>Tip</span> {tip}</p>{/if}
	</div>

	<div class="corner">
		<div class="row">
			<span class="ring" class:bad={error !== null} aria-hidden="true"></span>
			<div class="text">
				<p class="step">
					{error ?? step}{#if stepCount > 0 && !error}<span class="count">
							{stepIndex} / {stepCount}</span
						>{/if}
				</p>
				{#if detail}<p class="detail" data-testid="loading-detail">{detail}</p>{/if}
				{#if current}<p class="current">{current}</p>{/if}
			</div>
		</div>
		<div class="bar" class:fill={fraction !== null} aria-hidden="true">
			<span style:width={fraction !== null ? `${Math.round(fraction * 100)}%` : undefined}></span>
		</div>
		<div class="foot">
			<span class="elapsed" data-testid="loading-elapsed">{elapsedText}</span>
			{#if lowered}
				<span class="lowered">Lower quality</span>
			{:else if onlower && elapsed > LOWER_AFTER_MS && !error}
				<button type="button" class="lower" onclick={onlower} data-testid="loading-lower"
					>Taking long? Continue with lower quality</button
				>
			{/if}
		</div>
	</div>
</div>

<style>
	.world-loading-screen {
		position: absolute;
		inset: 0;
		z-index: 20;
		overflow: hidden;
		color: var(--text-primary);
		background: radial-gradient(ellipse at 30% 20%, #16233a 0%, var(--bg-space) 70%);
	}
	.slides,
	.shade {
		position: absolute;
		inset: 0;
	}
	.slide {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		transform-origin: 60% 40%;
		will-change: opacity, transform;
		animation:
			fade 1.6s ease forwards,
			pan 9s linear forwards;
	}
	.shade {
		background:
			linear-gradient(to top, rgb(0 0 0 / 0.72) 0%, rgb(0 0 0 / 0) 38%),
			linear-gradient(to bottom, rgb(0 0 0 / 0.45) 0%, rgb(0 0 0 / 0) 22%);
	}
	@keyframes fade {
		to {
			opacity: 1;
		}
	}
	@keyframes pan {
		from {
			transform: scale(1.04) translate3d(0, 0, 0);
		}
		to {
			transform: scale(1.12) translate3d(-1.5%, -1%, 0);
		}
	}
	.name {
		position: absolute;
		top: 1.75rem;
		left: 2rem;
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		text-shadow: 0 1px 8px rgb(0 0 0 / 0.6);
	}
	.caption {
		position: absolute;
		left: 2rem;
		bottom: 1.75rem;
		max-width: min(36rem, 50vw);
		text-shadow: 0 1px 6px rgb(0 0 0 / 0.7);
	}
	.caption p {
		margin: 0;
	}
	.scene {
		font-size: var(--t-small);
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}
	.tip {
		margin-top: 0.375rem !important;
		font-size: 0.9375rem;
		line-height: 1.45;
		color: var(--text-body);
	}
	.tip span {
		margin-right: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.corner {
		position: absolute;
		right: 2rem;
		bottom: 1.75rem;
		width: min(20rem, 70vw);
		display: grid;
		gap: 0.5rem;
		text-shadow: 0 1px 6px rgb(0 0 0 / 0.7);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.ring {
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		border: 2px solid rgb(255 255 255 / 0.18);
		border-top-color: var(--text-primary);
		animation: spin 0.9s linear infinite;
		will-change: transform;
	}
	.ring.bad {
		border-top-color: var(--danger, #e5484d);
		animation: none;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.text {
		min-width: 0;
	}
	.text p {
		margin: 0;
	}
	.step {
		font-size: 0.9375rem;
		font-weight: 500;
	}
	.count {
		margin-left: 0.375rem;
		font-size: var(--t-small);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.detail,
	.current {
		font-size: var(--t-small);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.current {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		opacity: 0.75;
	}
	.bar {
		height: 2px;
		overflow: hidden;
		background: rgb(255 255 255 / 0.16);
		border-radius: var(--radius-pill);
	}
	.bar span {
		display: block;
		width: 40%;
		height: 100%;
		background: var(--text-primary);
		animation: slide 1.3s var(--ease) infinite;
		will-change: transform;
	}
	.bar.fill span {
		animation: none;
		transition: width 0.2s var(--ease);
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(260%);
		}
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 1.75rem;
		font-size: var(--t-small);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.lower {
		padding: 0.25rem 0.625rem;
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-body);
		background: rgb(0 0 0 / 0.35);
		border: 1px solid rgb(255 255 255 / 0.22);
		border-radius: var(--radius-pill);
		cursor: pointer;
	}
	.lower:hover {
		color: var(--text-primary);
		border-color: rgb(255 255 255 / 0.4);
	}
	@media (prefers-reduced-motion: reduce) {
		.slide {
			animation: fade 0.01s forwards;
		}
		.ring {
			animation-duration: 2.4s;
		}
	}
	@media (max-width: 720px) {
		.caption {
			display: none;
		}
		.corner {
			left: 1rem;
			right: 1rem;
			width: auto;
		}
	}
</style>
