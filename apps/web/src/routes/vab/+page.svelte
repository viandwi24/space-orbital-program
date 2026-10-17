<script lang="ts">
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import { onMount } from 'svelte';
	import Catalogue from '../../lib/vab/Catalogue.svelte';
	import ChecksList from '../../lib/vab/ChecksList.svelte';
	import LibraryDialog from '../../lib/vab/LibraryDialog.svelte';
	import SelectionCard from '../../lib/vab/SelectionCard.svelte';
	import StageEditor from '../../lib/vab/StageEditor.svelte';
	import StatsStrip from '../../lib/vab/StatsStrip.svelte';
	import TopBar from '../../lib/vab/TopBar.svelte';
	import { VabController } from '../../lib/vab/controller.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import Dialog from '../../lib/ui/Dialog.svelte';
	import Icon from '../../lib/ui/Icon.svelte';
	import Kbd from '../../lib/ui/Kbd.svelte';
	import TutorialCard from '../../lib/hud/TutorialCard.svelte';
	import { categoryOf } from '../../lib/editor/categories';
	import { settings } from '../../lib/settings/settings.svelte';
	import { advance, currentStep, skip, stepLabel } from '../../lib/onboarding/tutorial';

	const vab = new VabController();

	let stage = $state<HTMLDivElement>();
	let canvas = $state<HTMLCanvasElement>();
	let left = $state<HTMLElement>();
	let right = $state<HTMLElement>();
	let catalogueRef = $state<Catalogue>();

	onMount(() => {
		if (!stage || !canvas || !left || !right) return;
		vab.focusSearch = () => catalogueRef?.focusSearch();
		const stop = vab.mount({ canvas, stage, left, right });
		// `/vab?library` (the main and pause menus' "Vessel library") opens the library at once.
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
				return def ? categoryOf(def, vab.content.modules) : 'other';
			})
		);
		const next = advance(settings.tutorial, {
			scene: 'vab',
			vab: {
				command: categories.has('command'),
				engine: categories.has('propulsion'),
				tank: categories.has('tanks')
			}
		});
		if (next !== settings.tutorial) settings.setTutorial(next);
	});
	const tutorialStep = $derived(currentStep(settings.tutorial, 'vab'));
	/** The welcome card carries the first step's words; the guide card waits for the first part. */
	const emptyHangar = $derived(
		vab.editor.design.parts.length === 0 && !vab.armed && vab.editor.loose.length === 0
	);

	// The drawers (narrow windows) change which panels take room; the view re-centres the vessel.
	$effect(() => {
		void vab.drawer;
		queueMicrotask(() => vab.updateInsets());
	});
</script>

<PageMeta
	title="Vehicle assembly · Orbital"
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
			<p>Orbital needs WebGL 2. Try another browser or enable hardware acceleration.</p>
			<a href="/">Back to the main page</a>
		</div>
	{/if}

	<div class="ui">
		<TopBar {vab} />

		<div class="leftcol" class:open={vab.drawer === 'parts'} bind:this={left}>
			<Catalogue
				bind:this={catalogueRef}
				parts={vab.parts}
				icons={vab.icons}
				armed={vab.armed?.kind === 'new' || vab.armed?.kind === 'connect' ? vab.armed.part : null}
				facts={vab.facts}
				modules={vab.content.modules}
				onarm={(id) => vab.arm(id)}
				assemblies={vab.assemblyEntries}
				armedAssembly={vab.armed?.kind === 'assembly' ? vab.armed.id : null}
				onarmAssembly={(id) => vab.armAssembly(id)}
				ondeleteAssembly={(id) => void vab.deleteAssembly(id)}
			/>
		</div>

		<div class="rightcol" class:open={vab.drawer === 'stages'} bind:this={right}>
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
				onmove={(i, to) => vab.moveStage(i, to)}
				onselect={(i) => (vab.selected = i)}
				onremove={(k) => vab.removeStage(k)}
				onauto={() => vab.autoStage()}
			/>
			<ChecksList checks={vab.checks} onflag={(p) => (vab.flagged = p)} />
			<button
				type="button"
				class="launch"
				disabled={vab.launchBlocked}
				title={vab.launchBlocked
					? vab.checks.find((c) => c.severity === 'error')?.text
					: 'Fly this vessel'}
				onclick={() => vab.launch()}
			>
				<Icon name="launch" size={26} />
				<span class="label">
					<span class="big">Launch</span>
					<span class="sub">
						{#if vab.launchBlocked}Fix the problem above first{:else if vab.warnings > 0}{vab.warnings}
							warning{vab.warnings === 1 ? '' : 's'}{:else}All checks passed{/if}
					</span>
				</span>
			</button>
		</div>

		<div class="bottom">
			<StatsStrip
				stats={vab.stats}
				trip={vab.trip}
				destinations={vab.destinations}
				destinationId={vab.trip.destination.id}
				onpick={(id) => (vab.tripId = id)}
				stability={vab.stability}
			/>
			<p class="keys">
				<span><Kbd>Drag</Kbd> orbit</span>
				<span><Kbd>Shift</Kbd>+<Kbd>Drag</Kbd> pan</span>
				<span><Kbd>Wheel</Kbd> zoom</span>
				<span><Kbd>{settings.keymap.label('frame')}</Kbd> frame</span>
				<span><Kbd>{settings.keymap.label('search')}</Kbd> search</span>
				<span><Kbd>{settings.keymap.label('subAssembly')}</Kbd> keep as sub-assembly</span>
			</p>
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
				<div class="row">
					<Button onclick={() => vab.loadExample()}>Load the two-stage example</Button>
					<Button onclick={() => vab.loadBoosterExample()}>Load the booster rocket</Button>
					<Button onclick={() => vab.loadAsparagusExample()}>Load the asparagus rocket</Button>
					<Button onclick={() => vab.loadGliderExample()}>Load the glider</Button>
					<Button onclick={() => vab.loadMoonExample()}>Load the moon shot</Button>
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
		--col-l: clamp(256px, 22vw, 340px);
		--col-r: clamp(256px, 21vw, 330px);
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
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--s-3);
		padding: var(--s-3);
		pointer-events: none;
		min-height: 0;
	}
	.ui > :global(*) {
		pointer-events: auto;
	}
	.leftcol {
		grid-column: 1;
		grid-row: 2 / 4;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.leftcol :global(.catalogue) {
		flex: 1;
	}
	.rightcol {
		grid-column: 3;
		grid-row: 2 / 4;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	/* Nothing in the right column can be cut off: the stage list and the checks scroll inside their
	   own panels, the Launch button always keeps its place at the foot. */
	.rightcol :global(.stages) {
		flex: 1 1 0;
		min-height: 120px;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.rightcol :global(.checks) {
		flex: 0 1 auto;
		max-height: 34%;
		min-height: 44px;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.bottom {
		grid-column: 2;
		grid-row: 3;
		display: grid;
		justify-items: center;
		gap: var(--s-2);
		align-self: end;
		min-width: 0;
	}
	.keys {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-1) var(--s-4);
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
		text-shadow: 0 1px 8px var(--bg-void);
	}
	.keys span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.guide {
		grid-column: 2;
		grid-row: 2;
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
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-2);
	}
	.launch {
		flex: none;
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
		height: 64px;
		color: var(--c-ink);
		background: var(--c-accent);
		border: 0;
		border-radius: var(--r-panel);
		box-shadow: 0 0 28px color-mix(in srgb, var(--c-accent) 38%, transparent);
		transition:
			background var(--dur-fast) var(--ease),
			box-shadow var(--dur-fast) var(--ease);
	}
	.launch:hover:not(:disabled) {
		background: color-mix(in srgb, var(--c-accent) 78%, white);
	}
	.launch:disabled {
		color: var(--text-dim);
		background: var(--panel-raised);
		box-shadow: none;
		border: 1px solid var(--line);
	}
	.label {
		display: grid;
		text-align: left;
		line-height: 1.1;
	}
	.big {
		font-size: var(--t-xl);
		font-weight: 600;
	}
	.sub {
		font-size: var(--t-xs);
		font-weight: 500;
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
	@media (max-height: 800px) {
		.launch {
			height: 52px;
		}
		.keys {
			display: none;
		}
	}
	/* Narrow windows: the panels become drawers opened from the top bar, the vessel gets the width. */
	@media (max-width: 899px) {
		.vab {
			--col-l: 0px;
			--col-r: 0px;
		}
		.leftcol,
		.rightcol {
			display: none;
			position: absolute;
			top: 72px;
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
