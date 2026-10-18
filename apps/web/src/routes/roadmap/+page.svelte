<script lang="ts">
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import MenuShell from '../../lib/ui/MenuShell.svelte';
	import PageHead from '../../lib/ui/PageHead.svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import {
		ROADMAP,
		ROADMAP_NOTES,
		ROADMAP_PHASES,
		SHIPPED,
		labelOf
	} from '../../lib/public/roadmap';
	import planStatus from 'virtual:plan-status';

	const slug = (s: string): string => s.toLowerCase().replace(/\W+/g, '-');
</script>

<PageMeta
	title="Roadmap · {GAME_NAME}"
	description="What comes after {GAME_NAME} 1.0, phase by phase: worlds and a Space Center, a career, communications, a real sky and a living world."
/>

<MenuShell wide>
	<PageHead title="Roadmap" />
	<p class="lead">
		Version 1.0 is a complete game: build, launch, fly to orbit and the Moon, plan maneuvers, save
		your flight, script your vessel and install mods. This is everything we plan after it, phase by
		phase and with no dates. Each item says whether it has shipped, is in progress, is planned, or
		is still being explored.
	</p>

	<section class="now" aria-labelledby="now-h">
		<h2 id="now-h">In version 1.0</h2>
		<ul>
			<li>A 3D hangar with a part catalogue, symmetry, stages and exact delta-v</li>
			<li>Launch, staging, gimbaled engines, fins, re-entry heating and landing</li>
			<li>A planet with terrain, an atmosphere and a Moon you can land on</li>
			<li>Stability assist, maneuver nodes, time warp and a map view</li>
			<li>Saves: quicksave, autosave, named saves</li>
			<li>Scripts in a sandbox and mods you install from a file</li>
		</ul>
	</section>

	<section aria-labelledby="shipped-h">
		<h2 id="shipped-h">Shipped since 1.0</h2>
		<ul class="cards">
			{#each SHIPPED as item (item.plan)}
				<li>
					<h3>{item.title}</h3>
					<p>{item.gives}</p>
					<span class="label shipped">shipped</span>
				</li>
			{/each}
		</ul>
	</section>

	{#each ROADMAP_PHASES as phase (phase)}
		<section class="phase" aria-labelledby="phase-{slug(phase)}">
			<h2 id="phase-{slug(phase)}">{phase}</h2>
			<ul class="cards">
				{#each ROADMAP.filter((r) => r.phase === phase) as item (item.plan)}
					{@const label = labelOf(item, planStatus[item.plan])}
					<li>
						<h3>{item.title}</h3>
						<p>{item.gives}</p>
						<span class="label {slug(label)}">{label}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<section aria-labelledby="notes-h">
		<h2 id="notes-h">What changed</h2>
		<ul class="notes">
			{#each ROADMAP_NOTES as note (note.date + note.item)}
				<li>
					<time datetime={note.date}>{note.date}</time> <strong>{note.item}</strong>: {note.change}
				</li>
			{/each}
		</ul>
	</section>

	<p class="note">
		Nothing here is promised. The project keeps its plans in the open; every item above is a written
		plan in the repository's <code>docs/plans</code> folder.
	</p>
</MenuShell>

<style>
	.lead {
		max-width: 62ch;
		margin: 0 0 var(--s-5);
		font-size: var(--t-md);
		color: var(--text-dim);
	}
	h2 {
		margin: var(--s-5) 0 var(--s-3);
		font-size: var(--t-lg);
		font-weight: 600;
	}
	.now {
		padding: var(--s-4) var(--s-5);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-card);
	}
	.now h2 {
		margin-top: 0;
		color: var(--text-primary);
	}
	.now ul {
		margin: 0;
		padding-left: 1.1em;
		columns: 2;
		column-gap: var(--s-6);
		font-size: var(--t-sm);
	}
	.now li {
		margin-bottom: var(--s-1);
		break-inside: avoid;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--s-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.cards li {
		padding: var(--s-3) var(--s-4);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-card);
	}
	h3 {
		margin: 0 0 var(--s-1);
		font-size: var(--t-md);
		font-weight: 600;
	}
	.cards li {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.cards p {
		flex: 1;
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.label {
		align-self: flex-start;
		margin-top: var(--s-2);
		padding: 0 var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-dim);
		border: 1px solid var(--border-subtle);
		border-radius: 999px;
	}
	.label.shipped,
	.label.in-progress {
		color: var(--accent-text);
		border-color: var(--border-strong);
	}
	.label.exploring {
		font-style: italic;
	}
	.notes {
		margin: 0;
		padding-left: 1.1em;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	time {
		font-variant-numeric: tabular-nums;
	}
	.note {
		margin-top: var(--s-5);
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	@media (max-width: 760px) {
		.now ul {
			columns: 1;
		}
	}
</style>
