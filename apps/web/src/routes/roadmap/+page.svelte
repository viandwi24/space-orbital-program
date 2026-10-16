<script lang="ts">
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import MenuShell from '../../lib/ui/MenuShell.svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import { ROADMAP, ROADMAP_AREAS } from '../../lib/public/roadmap';
</script>

<PageMeta
	title="Roadmap · {GAME_NAME}"
	description="What is in Orbital 1.0 and what comes next: lakes and rivers, wreckage, wings, remappable keys, sound and more."
/>

<MenuShell wide>
	<a class="back" href="/">Main menu</a>
	<h1>Roadmap</h1>
	<p class="lead">
		Version 1.0 is a complete game: build, launch, fly to orbit and the Moon, plan maneuvers, save
		your flight, script your vessel and install mods. This is what we plan to add next, in no fixed
		order and with no dates.
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

	{#each ROADMAP_AREAS as area (area)}
		<section aria-labelledby="area-{area.replace(/\W+/g, '-')}">
			<h2 id="area-{area.replace(/\W+/g, '-')}">{area}</h2>
			<ul class="cards">
				{#each ROADMAP.filter((r) => r.area === area) as item (item.plan)}
					<li>
						<h3>{item.title}</h3>
						<p>{item.gives}</p>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<p class="note">
		Nothing here is promised. The project keeps its plans in the open; every item above is a written
		plan in the repository's <code>docs/plans</code> folder.
	</p>
</MenuShell>

<style>
	.back {
		display: inline-block;
		margin-bottom: var(--s-3);
		font-size: var(--t-sm);
	}
	h1 {
		margin: 0 0 var(--s-2);
		font-size: 2.2rem;
		font-weight: 600;
	}
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
		background: var(--panel);
		border: 1px solid var(--c-accent-dim);
		border-radius: var(--r-panel);
	}
	.now h2 {
		margin-top: 0;
		color: var(--c-accent);
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
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
	}
	h3 {
		margin: 0 0 var(--s-1);
		font-size: var(--t-md);
		font-weight: 600;
	}
	.cards p {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-dim);
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
