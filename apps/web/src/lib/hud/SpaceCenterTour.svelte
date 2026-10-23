<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '../ui/Button.svelte';
	import GuideFrame from './GuideFrame.svelte';
	import GuidePointer from './GuidePointer.svelte';
	import {
		SC_TOUR_STEPS,
		advanceTour,
		backTour,
		nextTour,
		skipTour,
		tourBuildingOf,
		tourLabel,
		tourStep,
		type ScTourObservation
	} from '../onboarding/sc-tour';
	import { EMPTY_FEED, scFeed, tourStore } from '../onboarding/sc-tour-store.svelte';

	/**
	 * The Space Center tour's card (plan 377, ADR 0314 point 2): the guide card in the bottom-left
	 * corner with Back, Skip and Next, the highlight on the step's target, and the step machine fed
	 * from the Space Center and the page. It lives in the world layout, so a visit to a building's
	 * page keeps the tour going.
	 */
	let { place, warp }: { place: string; warp: number } = $props();

	const progress = $derived(tourStore.progress);
	const observation = $derived.by((): ScTourObservation | null => {
		const p = progress;
		if (!p || p.status !== 'active') return null;
		const feed = scFeed.feed ?? EMPTY_FEED;
		const own = tourBuildingOf(p, scFeed.buildings);
		return {
			place,
			economy: scFeed.economy,
			orbited: feed.orbited,
			zoomed: feed.zoomed,
			buildOpen: feed.buildOpen,
			tool: feed.tool,
			placing: feed.placing,
			selected: feed.selected,
			listOpen: feed.listOpen,
			confirm: feed.confirm,
			building: own.building,
			removed: own.removed,
			warp
		};
	});
	$effect(() => {
		const p = progress;
		const o = observation;
		if (!p || !o) return;
		// the tour building's id, once the snapshot has it
		const own = tourBuildingOf(p, scFeed.buildings);
		const kept = own.id !== undefined && p.building === undefined ? { ...p, building: own.id } : p;
		const next = advanceTour(kept, o);
		if (next !== p) tourStore.set(next);
	});
	const step = $derived(progress ? tourStep(progress) : null);
	const point = $derived(step && observation ? step.point(observation) : null);

	// bottom left, over the status bar; above the Space Center's bottom strips where they would meet
	let bottom = $state<number | null>(null);
	let left = $state<number | null>(null);
	let box = $state<HTMLDivElement>();
	$effect(() => {
		const measure = () => {
			const r = box?.getBoundingClientRect();
			if (!r) return;
			const rect = (sel: string) => {
				const o = document.querySelector(sel)?.getBoundingClientRect();
				return o && o.width > 0 && o.height > 0 ? o : null;
			};
			// beside a page's full-height left column (the Hangar's parts)
			const col = rect('.leftcol');
			const nextLeft = col ? Math.round(col.right + 12) : null;
			const from = nextLeft ?? r.left;
			const to = from + r.width;
			// above the bottom strips and tool bars it would cover
			let lift: number | null = null;
			for (const sel of [
				'[data-testid="build-menu"]',
				'[data-testid="sc-buildings-list"]',
				'.bottom'
			]) {
				const o = rect(sel);
				if (!o || o.right <= from || o.left >= to || o.bottom < innerHeight - 160) continue;
				lift = Math.max(lift ?? 0, Math.round(innerHeight - o.top + 12));
			}
			if (nextLeft !== left) left = nextLeft;
			if (lift !== bottom) bottom = lift;
		};
		const first = setTimeout(measure, 0);
		const timer = setInterval(measure, 250);
		return () => {
			clearTimeout(first);
			clearInterval(timer);
		};
	});

	const finish = () => tourStore.set({ ...progress!, status: 'done', review: false });
</script>

{#if progress && step && observation}
	<div
		class="tour"
		bind:this={box}
		style:left={left === null ? null : `${left}px`}
		style:bottom={bottom === null ? null : `${bottom}px`}
	>
		<GuideFrame
			label="Space Center tour"
			count={tourLabel(progress)}
			pill="Tour {progress.step + 1}/{SC_TOUR_STEPS.length}"
			testid="sc-tour-card"
			ariaLabel="Space Center tour"
		>
			<h2 data-testid="sc-tour-step-{step.id}">{step.title}</h2>
			<p class="text">{step.text(observation)}</p>
			{#if progress.review}
				<p class="hint">You did this already: press Next to go on.</p>
			{/if}
			{#snippet foot()}
				{#if progress.step > 0}
					<Button
						variant="ghost"
						onclick={() => tourStore.set(backTour(progress))}
						data-testid="sc-tour-back">Back</Button
					>
				{/if}
				{#if step.id === 'finish'}
					<Button variant="ghost" onclick={finish} data-testid="sc-tour-done">Done</Button>
					<Button
						variant="primary"
						onclick={() => {
							finish();
							void goto(resolve('/lessons') + '?lesson=hangar');
						}}
						data-testid="sc-tour-rocket">Build your first rocket</Button
					>
				{:else}
					<Button
						variant="ghost"
						onclick={() => tourStore.set(skipTour(progress))}
						data-testid="sc-tour-skip">Skip tour</Button
					>
					{#if !step.done || progress.review}
						<Button
							variant="primary"
							onclick={() => tourStore.set(nextTour(progress))}
							data-testid="sc-tour-next">Next</Button
						>
					{/if}
				{/if}
			{/snippet}
		</GuideFrame>
	</div>
	<GuidePointer testid={point} />
{/if}

<style>
	.tour {
		position: fixed;
		left: calc(var(--margin-hud, 1.5rem) + var(--safe-left, 0px));
		bottom: calc(var(--margin-hud, 1.5rem) + 2rem);
		z-index: 41;
	}
	h2 {
		margin: 0 0 var(--s-1);
		font-size: var(--t-md);
		font-weight: 600;
	}
	.text,
	.hint {
		margin: 0;
		font-size: var(--t-sm);
		line-height: 1.4;
		color: var(--text);
	}
	.hint {
		margin-top: var(--s-2);
		color: var(--text-muted);
		font-size: var(--t-xs);
	}
</style>
