<script lang="ts">
	import { resolve } from '$app/paths';
	import { GAME_NAME } from '../public/about';
	import PageMeta from '../ui/PageMeta.svelte';
	import { onMount } from 'svelte';
	import Catalogue from './Catalogue.svelte';
	import ChecksList from './ChecksList.svelte';
	import LibraryDialog from './LibraryDialog.svelte';
	import BlueprintLibrary from './BlueprintLibrary.svelte';
	import PartList from './PartList.svelte';
	import SelectionCard from './SelectionCard.svelte';
	import StageEditor from './StageEditor.svelte';
	import PowerBudget from './PowerBudget.svelte';
	import CrewSeats from './CrewSeats.svelte';
	import { loadRoster } from '../launch/roster';
	import ActionGroupEditor from './ActionGroupEditor.svelte';
	import StatsStrip from './StatsStrip.svelte';
	import VesselName from './VesselName.svelte';
	import LaunchButton from './LaunchButton.svelte';
	import StartVessel from './StartVessel.svelte';
	import CoachMark from './CoachMark.svelte';
	import WelcomeCard from './WelcomeCard.svelte';
	import { loadFlag } from '../storage';
	import BuildContext from './BuildContext.svelte';
	import { pageShell } from '../layout/page-actions.svelte';
	import ToolPill from './ToolPill.svelte';
	import HelpOverlay from '../hud/HelpOverlay.svelte';
	import { VabController } from './controller.svelte';
	import { SaveController } from '../save/save-controller.svelte';
	import { bootedMods, modHint } from '../save/mods';
	import { loadWorldTech } from '../tech/world-tech';
	import { loadWorldReliability } from '../reliability/reliability-model';
	import { sitesOf } from '@orbital/core';
	import { limitsOn } from '../capacity';
	import { activeWorldId } from '../worlds/worlds';
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import TutorialCard from '../hud/TutorialCard.svelte';
	import { categoryOf } from '../editor/categories';
	import { settings } from '../settings/settings.svelte';
	import { advance, currentStep, skip, stepLabel } from '../onboarding/tutorial';
	import { lessonVab, runningLesson } from '../onboarding/lesson-gate.svelte';
	import { devBar } from '../dev/DevShell.svelte';

	/**
	 * The Hangar screen (plan 029; plan 375): the world's `/vab` and, with `sandbox`, the developer
	 * sandbox under `/developer/hangar`. The sandbox has no world: every part, no tech tree, no
	 * funds, no launch, its own library, and its New/Open/Save/look buttons in the developer bar.
	 * `blueprint` loads a blueprint at once (the Blueprints tab's Open in the Hangar).
	 */
	let { sandbox = false, blueprint = null }: { sandbox?: boolean; blueprint?: string | null } =
		$props();

	// svelte-ignore state_referenced_locally
	const vab = new VabController({ sandbox });
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
		if (sandbox) {
			if (blueprint) vab.loadBlueprint(blueprint);
			else if (new URLSearchParams(location.search).has('library')) void vab.openLibrary();
			return stop;
		}
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
		} else offerStart();
		return stop;
	});

	// The first-flight guide watches what the design contains, by catalogue category (plan 023).
	$effect(() => {
		if (sandbox || runningLesson()) return;
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
	// a lesson world teaches its own lesson, not the first flight (plan 229)
	// svelte-ignore state_referenced_locally
	const inLesson = !sandbox && runningLesson() !== null;
	const tutorialStep = $derived(inLesson ? null : currentStep(settings.tutorial, 'vab'));

	// A lesson in the Hangar (plan 344, ADR 0293 point 3) reads the design, the checks and the Library.
	$effect(() => {
		if (sandbox) return;
		const parts = vab.editor.design.parts;
		const kinds = new Set(
			parts.map((p) => {
				const def = vab.defOf(p.part);
				return def ? categoryOf(def, vab.content.modules) : 'stock.other';
			})
		);
		lessonVab.state = {
			parts: parts.length,
			command: kinds.has('stock.command'),
			engine: kinds.has('stock.propulsion'),
			tank: kinds.has('stock.tanks'),
			fins: parts.filter((p) => /\.(fin|control-surface)$/.test(p.part)).length,
			parachute: parts.some((p) => /parachute|chute/.test(p.part)),
			symmetry: parts.some((p) => p.symmetry !== undefined),
			checksClear: vab.checks.every((c) => c.severity !== 'error' && c.level !== 'no-go'),
			library: vab.blueprintsOpen
		};
		return () => (lessonVab.state = null);
	});
	/** The empty Hangar's featured blueprints (plan 285); the rest are in the Library. */
	const FEATURED = ['learn.two-stage', 'kronos-selene', 'wayfarer-shuttle', 'trailblazer-rover'];
	/** The welcome card carries the first step's words; the guide card waits for the first part. */
	const emptyHangar = $derived(
		vab.editor.design.parts.length === 0 && !vab.armed && vab.editor.loose.length === 0
	);

	// "Start a vessel" (plan 350, ADR 0299): an empty Hangar opens with recommended blueprints or
	// Build my own; Build my own (or the modal turned off) points at the parts list instead.
	let startOpen = $state(false);
	let coach = $state(false);
	let coachAt = $state({ x: 0, y: 0 });
	function offerStart(): void {
		if (sandbox || !emptyHangar || runningLesson()) return;
		if (loadFlag('hideStart')) showCoach();
		else startOpen = true;
	}
	function showCoach(): void {
		const r = left?.getBoundingClientRect();
		const host = stage?.getBoundingClientRect();
		coachAt =
			r && host ? { x: r.right - host.left + 14, y: r.top - host.top + 110 } : { x: 380, y: 180 };
		coach = true;
	}
	// the first part (or a loaded design) ends both
	$effect(() => {
		if (!emptyHangar) {
			startOpen = false;
			coach = false;
		}
	});

	// The drawers (narrow windows) change which panels take room; the view re-centres the vessel.
	$effect(() => {
		void vab.drawer;
		queueMicrotask(() => vab.updateInsets());
	});
	// the Hangar's actions in the world menu bar, as icons like Flight's (plan 204, plan 255)
	$effect(() => {
		if (sandbox) return;
		pageShell.actions = [
			{
				id: 'new',
				label: 'New',
				icon: 'new',
				title: 'A new, empty vessel',
				testid: 'menu-new',
				onclick: () => {
					vab.newVessel();
					offerStart();
				}
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
				id: 'look',
				label: 'Studio',
				icon: 'studio',
				title: 'Studio look: a plain backdrop, a grid and studio light; the tools stay the same',
				on: vab.look === 'zen',
				testid: 'menu-look',
				onclick: () => vab.toggleLook()
			}
		];
		return () => {
			pageShell.actions = [];
		};
	});
	// the name and kind beside the time bar (plan 346, ADR 0295 point 2)
	$effect(() => {
		if (sandbox) {
			devBar.actions = sandboxBar;
			return () => {
				devBar.actions = null;
			};
		}
		pageShell.beside = besideRow;
		return () => {
			pageShell.beside = null;
		};
	});
</script>

{#snippet besideRow()}<VesselName {vab} />{/snippet}
{#snippet sandboxBar()}
	<VesselName {vab} />
	<button type="button" class="dev-btn" onclick={() => vab.newVessel()} data-testid="sandbox-new"
		>New</button
	>
	<button type="button" class="dev-btn" onclick={() => void vab.openLibrary()}>Library</button>
	<button type="button" class="dev-btn" onclick={() => (vab.blueprintsOpen = true)}
		>Blueprints</button
	>
	<button
		type="button"
		class="dev-btn"
		disabled={vab.editor.design.parts.length === 0}
		onclick={() => {
			vab.saveState = 'saving';
			void vab.flushSave();
		}}>Save</button
	>
	<button
		type="button"
		class="dev-btn"
		aria-pressed={vab.look === 'zen'}
		onclick={() => vab.toggleLook()}
		data-testid="sandbox-look">{vab.look === 'zen' ? 'Studio' : 'Hangar'} look</button
	>
{/snippet}

{#if !sandbox}
	<PageMeta
		title="Vehicle assembly · {GAME_NAME}"
		description="Build a rocket from parts in a 3D hangar: attach, stage, check delta-v and stability, then launch."
	/>
{/if}
<svelte:window onkeydown={vab.onKey} />

<div class="vab" class:sandbox>
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
		{#if vab.hoverInfo}
			<!-- the part under the pointer (plan 315): name, mass and, for a shell, what it holds -->
			<div
				class="part-tip"
				role="tooltip"
				style:left="{vab.hoverInfo.at.x + 16}px"
				style:top="{vab.hoverInfo.at.y + 16}px"
			>
				<strong>{vab.hoverInfo.title}</strong>
				<span class="dim">{(vab.hoverInfo.mass / 1000).toFixed(2)} t dry</span>
				{#if vab.hoverInfo.shell}
					{#if vab.hoverInfo.holds.length > 0}
						<span class="dim">Holds:</span>
						<ul>
							{#each vab.hoverInfo.holds.slice(0, 8) as name, k (k)}<li>{name}</li>{/each}
							{#if vab.hoverInfo.holds.length > 8}<li>
									and {vab.hoverInfo.holds.length - 8} more
								</li>{/if}
						</ul>
					{:else}
						<span class="dim">Empty</span>
					{/if}
				{/if}
			</div>
		{/if}
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
		{#if vab.shells.size > 0}
			<button
				type="button"
				class="payload-toggle"
				class:on={vab.showPayload}
				aria-pressed={vab.showPayload}
				data-tip="See through every fairing, bay and petal set (the Hangar only)"
				onclick={() => vab.toggleShowPayload()}
			>
				{vab.showPayload ? 'Hide payload' : 'Show payload'}
			</button>
		{/if}

		<div class="leftcol" class:open={vab.drawer === 'parts'} bind:this={left}>
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
			{#if sandbox}
				<p class="sandbox-note">
					Sandbox: every part, no tech tree, no funds, no launch. Designs go to the developer library.
				</p>
			{:else}
				<LaunchButton {vab} />
			{/if}
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
			<PartList {vab} />
			<ActionGroupEditor {vab} />
		</div>

		<div class="bottom">
			<ToolPill {vab} />
		</div>

		{#if coach && emptyHangar}
			<CoachMark at={coachAt} onclose={() => (coach = false)} />
		{/if}

		{#if tutorialStep && !emptyHangar}
			<div class="guide">
				<TutorialCard
					step={tutorialStep}
					label={stepLabel(settings.tutorial, 'vab')}
					onskip={() => settings.setTutorial(skip(settings.tutorial))}
				/>
			</div>
		{/if}

		<!-- a lesson keeps the inline card its steps point at (plan 344); elsewhere the start modal -->
		{#if emptyHangar && inLesson}
			<WelcomeCard {vab} featured={FEATURED} />
		{/if}
	</div>

	<div class="sr-only" aria-live="polite" role="status">{vab.announce}</div>
	<p class="sr-only" id="stack-description">{vab.stackText}</p>

	<StartVessel
		{vab}
		open={startOpen}
		featured={FEATURED}
		onclose={(how) => {
			startOpen = false;
			if (how === 'build') showCoach();
		}}
	/>
	<LibraryDialog {vab} />
	<BlueprintLibrary {vab} />
	<HelpOverlay open={vab.keysOpen} hangar onclose={() => (vab.keysOpen = false)} />

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
	/* the developer sandbox (plan 375): inside the developer page, under its bar */
	.vab.sandbox {
		position: absolute;
	}
	.vab.sandbox .ui {
		padding: var(--s-3) var(--margin-hud) var(--s-3);
	}
	.sandbox-note {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-card);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		font-size: var(--t-small);
	}
	:global(.dev-btn) {
		padding: 0.3rem 0.75rem;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border-subtle);
		background: var(--surface-button);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-button);
		cursor: pointer;
	}
	:global(.dev-btn:hover) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	:global(.dev-btn[aria-pressed='true']) {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	:global(.dev-btn:disabled) {
		opacity: 0.45;
		cursor: default;
	}
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
	.rightcol :global(.partlist),
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
	.part-tip {
		position: absolute;
		z-index: 5;
		display: grid;
		gap: 0.15rem;
		max-width: 16rem;
		padding: 0.45rem 0.6rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--bg-void) 88%, transparent);
		border: 1px solid rgb(255 255 255 / 0.14);
		font-size: var(--t-sm);
		pointer-events: none;
	}
	.part-tip ul {
		margin: 0;
		padding-left: 1rem;
	}
	.part-tip .dim {
		color: var(--text-dim);
	}
	.payload-toggle {
		grid-column: 2;
		grid-row: 1;
		align-self: end;
		justify-self: end;
		margin: 0 0.75rem 0.75rem 0;
		padding: 0.35rem 0.8rem;
		border-radius: 999px;
		border: 1px solid rgb(255 255 255 / 0.2);
		background: color-mix(in srgb, var(--bg-void) 80%, transparent);
		color: inherit;
		font: inherit;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.payload-toggle.on {
		border-color: var(--c-accent, #4fc3f7);
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
