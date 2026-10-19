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
	import { LESSONS, NEW_LESSON, type Lesson } from '../../lib/onboarding/lessons';
	import { leaveLesson, startLesson } from '../../lib/onboarding/lesson-world';

	/**
	 * The Lessons page (plan 229): the lessons after the first orbit, with each one's progress and a
	 * Start or Restart. A lesson runs in a world of its own that the Worlds list never shows; coming
	 * here ends any lesson still running and removes its world.
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
	const done = $derived(LESSONS.filter((l) => progressOf(l).status === 'done').length);

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
	description="Lessons after the first orbit: landing, maneuver nodes, rendezvous and docking, a transfer."
/>

<main class="lessons">
	<header>
		<BackButton href={resolve('/')} label="Back to the main menu" />
		<div class="title">
			<h1>Lessons</h1>
			<p class="sub">
				{done} of {LESSONS.length} done · each lesson starts from a prepared scene in a world of its own;
				your worlds are not touched
			</p>
		</div>
	</header>

	{#if problem}<p class="note" role="alert">{problem}</p>{/if}

	<div class="layout">
		<ul class="grid" aria-label="Lessons">
			{#each LESSONS as l, i (l.id)}
				<li>
					<button
						type="button"
						class="card"
						class:on={chosen.id === l.id}
						aria-pressed={chosen.id === l.id}
						data-testid="lesson-{l.id}"
						onclick={() => (selected = l.id)}
					>
						<span class="num">{String(i + 1).padStart(2, '0')}</span>
						<span class="name">{l.title}</span>
						<span class="chips">
							{#if progressOf(l).status === 'done'}<Chip>Done</Chip
								>{:else if progressOf(l).status === 'active'}<Chip outline>In progress</Chip>{/if}
						</span>
						<span class="meta">{l.steps.length} steps · {statusText(l)}</span>
					</button>
				</li>
			{/each}
		</ul>

		<section class="details" aria-label="Selected lesson" data-testid="lesson-details">
			<span class="label">Lesson {LESSONS.indexOf(chosen) + 1}</span>
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
	.card.on::after {
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
