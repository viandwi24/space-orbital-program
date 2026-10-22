<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import BackButton from '../../lib/ui/BackButton.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import Chip from '../../lib/ui/Chip.svelte';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import { settings } from '../../lib/settings/settings.svelte';
	import { loadWorldCatalog, type WorldCatalog } from '../../lib/worlds/catalog';
	import { browserWorldsEnv, type Worlds } from '../../lib/worlds/worlds';
	import Icon from '../../lib/ui/Icon.svelte';
	import {
		LESSONS,
		LEVELS,
		NEW_LESSON,
		lessonsOfLevel,
		type Lesson
	} from '../../lib/onboarding/lessons';
	import { leaveLesson, startLesson } from '../../lib/onboarding/lesson-world';

	/**
	 * The Lessons page (plans 229, 344): the lessons grouped by level (Basics, Flight, Advanced), each
	 * group with its progress, each lesson with its own and a Start or Restart. A lesson runs in a
	 * world of its own that the Worlds list never shows; coming here ends any lesson still running and
	 * removes its world.
	 */
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`))
	});
	const env = browserWorldsEnv();

	let worlds = $state.raw<Worlds | null>(null);
	let catalog = $state.raw<WorldCatalog | null>(null);
	let selected = $state<string>(LESSONS[0]!.id);
	let problem = $state<string | null>(null);
	let busy = $state(false);
	const chosen = $derived(LESSONS.find((l) => l.id === selected) ?? LESSONS[0]!);

	const progressOf = (l: Lesson) => settings.lessons[l.id] ?? NEW_LESSON;
	const statusText = (l: Lesson): string => {
		const p = progressOf(l);
		if (p.status === 'done') return 'Done';
		if (p.status === 'active') return `Step ${p.step + 1} of ${l.steps.length}`;
		return 'Not started';
	};
	const doneIn = (list: readonly Lesson[]): number =>
		list.filter((l) => progressOf(l).status === 'done').length;
	const done = $derived(doneIn(LESSONS));
	/** The first lesson not done yet: selected when the page opens. */
	const next = LESSONS.find((l) => (settings.lessons[l.id] ?? NEW_LESSON).status !== 'done');
	if (next) selected = next.id;
	const levelOf = (l: Lesson) => LEVELS.find((v) => v.id === l.level)!;

	onMount(() => {
		catalog = loadWorldCatalog();
		void saves.worldsService().then(async (w) => {
			// a lesson left from the pause menu, or by closing the tab, ends here
			await leaveLesson(w);
			worlds = w;
		});
	});

	async function start(lesson: Lesson): Promise<void> {
		if (!worlds || !catalog || busy) return;
		busy = true;
		problem = null;
		try {
			settings.setLesson(lesson.id, { status: 'active', step: 0 });
			await startLesson(worlds, lesson, catalog, env, (url) => goto(url));
		} catch (e) {
			problem = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<PageMeta
	title="Lessons · {GAME_NAME}"
	description="Lessons from the first launch to docking: building, orbit, re-entry, the moon, science, comms, EVA, rovers, robotics."
/>

<main class="lessons">
	<header>
		<BackButton href={resolve('/')} label="Back to the main menu" />
		<div class="title">
			<h1>Lessons</h1>
			<p class="sub">
				{done} of {LESSONS.length} done · from the first launch to docking, a few minutes each. Every
				lesson starts from a prepared scene in a world of its own; your worlds are not touched
			</p>
		</div>
	</header>

	{#if problem}<p class="note" role="alert">{problem}</p>{/if}

	<div class="layout">
		<div class="levels">
			{#each LEVELS as level (level.id)}
				{@const list = lessonsOfLevel(level.id)}
				<section class="level" aria-label={level.title} data-testid="lesson-level-{level.id}">
					<header class="level-head">
						<div>
							<h2>{level.title}</h2>
							<p class="level-sum">{level.summary}</p>
						</div>
						<span class="level-count" data-testid="lesson-level-count-{level.id}"
							>{doneIn(list)} of {list.length} done</span
						>
					</header>
					<div
						class="bar"
						role="progressbar"
						aria-label="{level.title} progress"
						aria-valuemin={0}
						aria-valuemax={list.length}
						aria-valuenow={doneIn(list)}
					>
						<span style:width="{(100 * doneIn(list)) / list.length}%"></span>
					</div>
					<ul class="grid" aria-label="{level.title} lessons">
						{#each list as l (l.id)}
							<li>
								<button
									type="button"
									class="card"
									class:on={chosen.id === l.id}
									class:complete={progressOf(l).status === 'done'}
									aria-pressed={chosen.id === l.id}
									data-testid="lesson-{l.id}"
									onclick={() => (selected = l.id)}
								>
									<span class="num">{String(LESSONS.indexOf(l) + 1).padStart(2, '0')}</span>
									{#if progressOf(l).status === 'done'}
										<span class="mark" aria-label="Done" data-testid="lesson-done-{l.id}"
											><Icon name="check" size={14} /></span
										>
									{/if}
									<span class="name">{l.title}</span>
									<span class="chips">
										{#if progressOf(l).status === 'done'}<Chip>Done</Chip
											>{:else if progressOf(l).status === 'active'}<Chip outline>In progress</Chip
											>{/if}
									</span>
									<span class="meta">{l.steps.length} steps · {statusText(l)}</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>

		<section class="details" aria-label="Selected lesson" data-testid="lesson-details">
			<span class="label">{levelOf(chosen).title} · Lesson {LESSONS.indexOf(chosen) + 1}</span>
			<h2>{chosen.title}</h2>
			<p class="summary">{chosen.summary}</p>
			<ol class="steps">
				{#each chosen.steps as s, i (s.id)}
					<li
						class:done={progressOf(chosen).status === 'done' ||
							(progressOf(chosen).status === 'active' && i < progressOf(chosen).step)}
					>
						{s.title}
					</li>
				{/each}
			</ol>
			<div class="actions">
				<Button
					variant="primary"
					disabled={!worlds || !catalog || busy}
					onclick={() => void start(chosen)}
					data-testid="lesson-start"
					>{progressOf(chosen).status === 'new' ? 'Start' : 'Restart'}</Button
				>
			</div>
		</section>
	</div>
</main>

<style>
	.lessons {
		min-height: 100dvh;
		box-sizing: border-box;
		padding: var(--margin-hud) clamp(var(--margin-hud), 5vw, var(--margin-menu));
		background: var(--bg-ground);
		color: var(--text-body);
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		margin-bottom: var(--s-5);
	}
	.title {
		flex: 1;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		font-weight: 300;
		color: var(--text-primary);
	}
	.sub,
	.note {
		margin: var(--s-1) 0 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.note {
		margin-bottom: var(--s-3);
		color: var(--warn);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		gap: var(--panel-gap);
		align-items: start;
	}
	.levels {
		display: grid;
		gap: var(--s-5);
	}
	.level {
		display: grid;
		gap: var(--s-3);
	}
	.level-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.level-head h2 {
		font-size: var(--t-md, 1rem);
	}
	.level-sum {
		margin: var(--s-1) 0 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.level-count {
		flex: none;
		font-size: var(--t-small);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.bar {
		height: 3px;
		border-radius: 2px;
		background: var(--border-subtle);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent-text, var(--text-primary));
		transition: width 0.3s;
	}
	.mark {
		position: absolute;
		top: var(--s-3);
		right: var(--s-3);
		display: grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: var(--accent-text, var(--text-primary));
		color: var(--bg-ground);
	}
	.card.complete .name {
		color: var(--text-primary);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--panel-gap);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		position: relative;
		display: grid;
		gap: var(--s-2);
		width: 100%;
		padding: var(--panel-pad) var(--s-3) var(--s-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		background: var(--surface-glass);
		color: var(--text-body);
		text-align: left;
	}
	.card.on {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.card.on:not(.complete)::after {
		content: '';
		position: absolute;
		top: var(--s-3);
		right: var(--s-3);
		width: var(--dot);
		height: var(--dot);
		border-radius: 50%;
		background: var(--text-primary);
	}
	.num {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		color: var(--text-muted);
	}
	.name {
		font-weight: 600;
		color: var(--text-primary);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1);
		min-height: 1.25rem;
	}
	.meta {
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.details {
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		background: var(--surface-glass);
	}
	.label {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h2 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
		color: var(--text-primary);
	}
	.summary {
		margin: 0;
		font-size: var(--t-small);
		line-height: 1.45;
	}
	.steps {
		display: grid;
		gap: var(--s-1);
		margin: 0;
		padding-left: 1.25rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.steps .done {
		color: var(--text-primary);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	@media (max-width: 760px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
