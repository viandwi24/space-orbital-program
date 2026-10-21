<script lang="ts">
	import { resolve } from '$app/paths';
	import { GAME_NAME } from '../../../lib/public/about';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import { onMount } from 'svelte';
	import Catalogue from '../../../lib/vab/Catalogue.svelte';
	import ChecksList from '../../../lib/vab/ChecksList.svelte';
	import LibraryDialog from '../../../lib/vab/LibraryDialog.svelte';
	import BlueprintLibrary from '../../../lib/vab/BlueprintLibrary.svelte';
	import SelectionCard from '../../../lib/vab/SelectionCard.svelte';
	import StageEditor from '../../../lib/vab/StageEditor.svelte';
	import PowerBudget from '../../../lib/vab/PowerBudget.svelte';
	import CrewSeats from '../../../lib/vab/CrewSeats.svelte';
	import { loadRoster } from '../../../lib/launch/roster';
	import ActionGroupEditor from '../../../lib/vab/ActionGroupEditor.svelte';
	import StatsStrip from '../../../lib/vab/StatsStrip.svelte';
	import VesselName from '../../../lib/vab/VesselName.svelte';
	import BuildContext from '../../../lib/vab/BuildContext.svelte';
	import { pageShell } from '../../../lib/layout/page-actions.svelte';
	import ToolPill from '../../../lib/vab/ToolPill.svelte';
	import { VabController } from '../../../lib/vab/controller.svelte';
	import { SaveController } from '../../../lib/save/save-controller.svelte';
	import { bootedMods, modHint } from '../../../lib/save/mods';
	import { loadWorldTech } from '../../../lib/tech/world-tech';
	import { loadWorldReliability } from '../../../lib/reliability/reliability-model';
	import { sitesOf } from '@orbital/core';
	import { limitsOn } from '../../../lib/capacity';
	import { activeWorldId } from '../../../lib/worlds/worlds';
	import Button from '../../../lib/ui/Button.svelte';
	import Dialog from '../../../lib/ui/Dialog.svelte';
	import TutorialCard from '../../../lib/hud/TutorialCard.svelte';
	import { categoryOf } from '../../../lib/editor/categories';
	import { settings } from '../../../lib/settings/settings.svelte';
	import { advance, currentStep, skip, stepLabel } from '../../../lib/onboarding/tutorial';

	const vab = new VabController();
	// the active world's tech tree flags locked parts (plan 105, ADR 0154 point 4)
	// the active world's part reliability for the part card (plan 130, ADR 0156 point 8)
	const worldSaves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: () => {},
		world: () => activeWorldId()
	});

	let stage = $state<HTMLDivElement>();
	let canvas = $state<HTMLCanvasElement>();
	let left = $state<HTMLElement>();
	let right = $state<HTMLElement>();
	let catalogueRef = $state<Catalogue>();

	onMount(() => {
		if (!stage || !canvas || !left || !right) return;
		vab.focusSearch = () => catalogueRef?.focusSearch();
		const stop = vab.mount({ canvas, stage, left, right });
		void loadWorldTech(worldSaves, activeWorldId()).then((t) => (vab.tech = t));
		void loadWorldReliability(worldSaves, activeWorldId()).then((r) => (vab.reliability = r));
		void loadRoster(worldSaves).then((r) => (vab.roster = r));
		// the active world's site and limits for the Hangar's part limit (plan 096, ADR 0123 point 4)
		void worldSaves
			.worldStartInfo(activeWorldId())
			.then((info) => {
				const site = sitesOf(info ?? { sites: [] })[0];
				vab.capacity = site ? { site, on: limitsOn(info, vab.loaded.world) } : null;
			})
			.catch(() => (vab.capacity = null));
		// `/vab?library` (the pause menu's "Vessel library") opens the library at once.
		if (new URLSearchParams(location.search).has('library')) {
			history.replaceState(null, '', location.pathname);
			void vab.openLibrary();
		}
		return stop;
	});

	// The first-flight guide watches what the design contains, by catalogue category (plan 023).
	$effect(() => {
		const categories = new Set(
			vab.editor.design.parts.map((p) => {
				const def = vab.defOf(p.part);
				return def ? categoryOf(def, vab.content.modules) : 'stock.other';
			})
		);
		const next = advance(settings.tutorial, {
			scene: 'vab',
			vab: {
				command: categories.has('stock.command'),
				engine: categories.has('stock.propulsion'),
				tank: categories.has('stock.tanks')
			}
		});
		if (next !== settings.tutorial) settings.setTutorial(next);
	});
	const tutorialStep = $derived(currentStep(settings.tutorial, 'vab'));
	/** The empty Hangar's featured blueprints (plan 285); the rest are in the Library. */
	const FEATURED = ['learn.two-stage', 'kronos-selene', 'wayfarer-shuttle', 'trailblazer-rover'];
	/** The welcome card carries the first step's words; the guide card waits for the first part. */
	const emptyHangar = $derived(
		vab.editor.design.parts.length === 0 && !vab.armed && vab.editor.loose.length === 0
	);

	// The drawers (narrow windows) change which panels take room; the view re-centres the vessel.
	$effect(() => {
		void vab.drawer;
		queueMicrotask(() => vab.updateInsets());
	});
	// the Hangar's actions in the world menu bar, as icons like Flight's (plan 204, plan 255)
	$effect(() => {
		pageShell.actions = [
			{
				id: 'new',
				label: 'New',
				icon: 'new',
				title: 'A new, empty vessel',
				testid: 'menu-new',
				onclick: () => vab.newVessel()
			},
			{
				id: 'open',
				label: 'Open',
				icon: 'open',
				title: 'Open a vessel from the library',
				testid: 'menu-open',
				onclick: () => void vab.openLibrary()
			},
			{
				id: 'save',
				label: 'Save',
				icon: 'save',
				title: 'Save to the library (Ctrl+S)',
				testid: 'menu-save',
				disabled: vab.editor.design.parts.length === 0,
				onclick: () => {
					vab.saveState = 'saving';
					void vab.flushSave();
				}
			},
			{
				id: 'launch',
				label: 'Launch',
				icon: 'launch',
				primary: true,
				title: vab.launchBlocked
					? vab.checks.find((c) => c.severity === 'error')?.text
					: vab.warnings > 0
						? `${vab.warnings} warning${vab.warnings === 1 ? '' : 's'}: you will be asked to confirm`
						: 'Go to the launch screen (Shift-click: fly at once)',
				testid: 'menu-launch',
				disabled: vab.launchBlocked,
				onclick: (e) => vab.launch(false, e.shiftKey)
			}
		];
		return () => {
			pageShell.actions = [];
		};
	});
</script>

<PageMeta
	title="Vehicle assembly · {GAME_NAME}"
	description="Build a rocket from parts in a 3D hangar: attach, stage, check delta-v and stability, then launch."
/>
<svelte:window onkeydown={vab.onKey} />

<div class="vab">
	<div class="stage" bind:this={stage}>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<canvas
			bind:this={canvas}
			tabindex="0"
			aria-label="Vessel assembly view. Arrow keys orbit, plus and minus zoom, bracket keys cycle through parts or attach points, Enter places."
			aria-describedby="stack-description"
			onpointerdown={vab.pointerDown}
			onpointermove={vab.pointerMove}
			onpointerup={vab.pointerUp}
			onpointercancel={vab.pointerCancel}
			onpointerleave={vab.pointerLeave}
			oncontextmenu={(e) => e.preventDefault()}
			onwheel={vab.wheel}
		></canvas>
	</div>

	{#if !vab.webgl}
		<div class="fatal" role="alert">
			<h1>The 3D view could not start</h1>
			<p>{vab.loadFailed}</p>
			<p>{GAME_NAME} needs WebGL 2. Try another browser or enable hardware acceleration.</p>
			<a href={resolve('/')}>Back to the main page</a>
		</div>
	{/if}

	<div class="ui">
		<div class="context-slot">
			<BuildContext {vab} />
		</div>

		<div class="leftcol" class:open={vab.drawer === 'parts'} bind:this={left}>
			<VesselName {vab} />
			<Catalogue
				bind:this={catalogueRef}
				parts={vab.parts}
				icons={vab.icons}
				armed={vab.armed?.kind === 'new' || vab.armed?.kind === 'connect' ? vab.armed.part : null}
				facts={vab.facts}
				modules={vab.content.modules}
				categories={vab.categories}
				onarm={(id) => vab.arm(id)}
				assemblies={vab.assemblyEntries}
				armedAssembly={vab.armed?.kind === 'assembly' ? vab.armed.id : null}
				onarmAssembly={(id) => vab.armAssembly(id)}
				ondeleteAssembly={(id) => void vab.deleteAssembly(id)}
			/>
		</div>

		<div class="rightcol" class:open={vab.drawer === 'stages'} bind:this={right}>
			<StatsStrip
				stats={vab.stats}
				trip={vab.trip}
				destinations={vab.destinations}
				destinationId={vab.trip.destination.id}
				onpick={(id) => (vab.tripId = id)}
				stability={vab.stability}
				cost={vab.cost}
			/>
			<SelectionCard {vab} />
			<StageEditor
				design={vab.editor.design}
				rows={vab.stats.rows}
				unstaged={vab.unstaged}
				total={vab.stats.totalDv}
				environment={vab.environment}
				autoStage={vab.editor.autoStage}
				selected={vab.selected}
				titleOf={vab.titleOfPart}
				iconOf={vab.iconOfPart}
				thumbOf={vab.thumbOfPart}
				onenv={(e) => (vab.environment = e)}
				bodies={vab.statsBodies}
				bodyId={vab.statsBodyId}
				altitude={vab.statsAltitude}
				onbody={(id) => (vab.statsBodyId = id)}
				onaltitude={(m) => (vab.statsAltitude = m)}
				onmove={(i, to) => vab.moveStage(i, to)}
				onselect={(i) => (vab.selected = i)}
				onremove={(k) => vab.removeStage(k)}
				onauto={() => vab.autoStage()}
			/>
			<ChecksList checks={vab.checks} onflag={(p) => (vab.flagged = p)} titleOf={vab.titleOfPart} />
			<PowerBudget power={vab.power} />
			<CrewSeats {vab} />
			<ActionGroupEditor {vab} />
		</div>

		<div class="bottom">
			<ToolPill {vab} />
		</div>

		{#if tutorialStep && !emptyHangar}
			<div class="guide">
				<TutorialCard
					step={tutorialStep}
					label={stepLabel(settings.tutorial, 'vab')}
					onskip={() => settings.setTutorial(skip(settings.tutorial))}
				/>
			</div>
		{/if}

		{#if emptyHangar}
			<div class="welcome">
				<h2>Build a vessel</h2>
				<p>
					Pick a command pod on the left, then click the glowing ring on the platform. Keep adding
					parts below it, then stage the engines on the right.
				</p>
				<div class="featured" aria-label="Featured blueprints">
					{#each FEATURED as id (id)}
						{@const card = vab.blueprints.find((c) => c.id === id)}
						{#if card}
							<button class="feature" onclick={() => vab.loadBlueprint(card.id)}>
								<strong>{card.title}</strong>
								<span>{card.inspiredBy ? `Inspired by ${card.inspiredBy}` : card.summary}</span>
							</button>
						{/if}
					{/each}
				</div>
				<div class="row">
					<Button onclick={() => (vab.blueprintsOpen = true)}>Open the Library</Button>
					{#if vab.vesselEntries.length > 0}
						<Button onclick={() => vab.openLibrary()}>Open a saved vessel</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<div class="sr-only" aria-live="polite" role="status">{vab.announce}</div>
	<p class="sr-only" id="stack-description">{vab.stackText}</p>

	<LibraryDialog {vab} />
	<BlueprintLibrary {vab} />

	<Dialog
		open={vab.confirmOpen}
		title="Launch with warnings?"
		onclose={() => (vab.confirmOpen = false)}
	>
		<ul class="issues">
			{#each vab.checks as c (c.id)}
				<li><strong>{c.text}</strong> <span class="dim">{c.hint}</span></li>
			{/each}
		</ul>
		<div class="actions">
			<Button onclick={() => (vab.confirmOpen = false)}>Back to the VAB</Button>
			<Button
				variant="primary"
				onclick={() => {
					vab.confirmOpen = false;
					vab.launch(true);
				}}>Launch anyway</Button
			>
		</div>
	</Dialog>
</div>

<style>
	.vab {
		/* Side panels: a share of the width, never narrower than they can read. */
		/* refs: catalogue 340, right column 300 */
		--col-l: clamp(16rem, 22vw, 21.25rem);
		--col-r: clamp(16rem, 21vw, 18.75rem);
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--bg-void);
	}
	.stage,
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	.stage::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(
			ellipse at 50% 52%,
			transparent 52%,
			color-mix(in srgb, var(--bg-void) 62%, transparent) 100%
		);
	}
	canvas {
		touch-action: none;
		outline: none;
	}
	canvas:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: -3px;
	}
	.ui {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: var(--col-l) minmax(0, 1fr) var(--col-r);
		/* no bar of its own (plan 238): the shell's menu bar is the page's only top bar */
		grid-template-rows: minmax(0, 1fr) auto;
		gap: var(--s-3);
		/* under the bars (plan 255): the time and menu bars float over the view, 80 px at the top, 56 at the foot */
		padding: calc(5rem + var(--safe-top)) var(--margin-hud) calc(3.5rem + var(--safe-bottom));
		pointer-events: none;
		min-height: 0;
	}
	.ui > :global(*) {
		pointer-events: auto;
	}
	.leftcol {
		grid-column: 1;
		grid-row: 1 / 3;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.leftcol :global(.catalogue) {
		flex: 1;
	}
	.rightcol {
		grid-column: 3;
		grid-row: 1 / 3;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	/* Nothing in the right column can be cut off: the stage list and the checks scroll inside their
	   own panels, the Launch button always keeps its place at the foot. */
	.rightcol :global(.stages) {
		/* its natural height: the column scrolls, no stage row is cut off (plan 255) */
		flex: none;
	}
	/* folded (plan 255): just its header */
	.rightcol :global(.stages.folded) {
		flex: none;
		min-height: 0;
	}
	.rightcol :global(.checks) {
		flex: 0 1 auto;
		max-height: 34%;
		min-height: 44px;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.rightcol :global(.power),
	.rightcol :global(.crew),
	.rightcol :global(.groups) {
		flex: none;
	}
	.bottom {
		grid-column: 2;
		grid-row: 2;
		display: grid;
		justify-items: center;
		gap: var(--s-2);
		align-self: end;
		min-width: 0;
		/* the tool pill compacts against this column's width (plan 238) */
		container-type: inline-size;
	}
	.context-slot {
		grid-column: 2;
		grid-row: 1;
		align-self: start;
		justify-self: center;
		min-width: 0;
		pointer-events: none;
	}
	.guide {
		grid-column: 2;
		grid-row: 1;
		margin-top: 3rem;
		align-self: start;
		justify-self: center;
	}
	.welcome {
		position: absolute;
		left: 50%;
		top: 46%;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: var(--s-3);
		max-width: 390px;
		padding: var(--s-4) var(--s-5);
		text-align: center;
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	.welcome h2 {
		margin: 0;
		font-size: var(--t-xl);
		font-weight: 600;
	}
	.welcome p {
		margin: 0;
		color: var(--text-dim);
	}
	.featured {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: var(--s-2);
		margin: var(--s-2) 0;
	}
	.feature {
		display: grid;
		gap: 0.2rem;
		text-align: left;
		padding: 0.6rem 0.7rem;
		border-radius: 0.6rem;
		border: 1px solid rgb(255 255 255 / 0.14);
		color: inherit;
		font: inherit;
		cursor: pointer;
		background-color: #12355e;
		background-image:
			linear-gradient(rgb(255 255 255 / 0.1) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.1) 1px, transparent 1px);
		background-size: 12px 12px;
	}
	.feature:hover,
	.feature:focus-visible {
		border-color: rgb(255 255 255 / 0.5);
	}
	.feature span {
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-2);
	}
	.fatal {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--s-2);
		text-align: center;
		background: var(--bg-void);
	}
	.issues {
		margin: 0 0 var(--s-4);
		padding-left: var(--s-4);
		display: grid;
		gap: var(--s-2);
	}
	.dim {
		color: var(--text-dim);
	}
	.actions {
		display: flex;
		gap: var(--s-3);
		justify-content: flex-end;
	}
	/* Narrow windows: the panels become drawers opened from the tool pill, the vessel gets the width. */
	@media (max-width: 899px) {
		.vab {
			--col-l: 0px;
			--col-r: 0px;
		}
		.leftcol,
		.rightcol {
			display: none;
			position: absolute;
			top: var(--s-3);
			bottom: var(--s-3);
			width: min(340px, calc(100vw - 24px));
			z-index: 2;
		}
		.leftcol {
			left: var(--s-3);
		}
		.rightcol {
			right: var(--s-3);
		}
		.leftcol.open,
		.rightcol.open {
			display: flex;
		}
		.bottom {
			grid-column: 1 / -1;
		}
	}
</style>
