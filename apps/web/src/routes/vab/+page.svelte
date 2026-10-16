<script lang="ts">
	import { onMount } from 'svelte';
	import type { PartDefinition, VesselDesign } from '@orbital/core';
	import { VabView } from '@orbital/renderer';
	import { goto } from '$app/navigation';
	import { loadContent, partLookup, partShapesOf } from '../../lib/catalog';
	import { emptyDesign, parseDesign, referenceTwoStage, serialiseDesign } from '../../lib/design';
	import { initialGraphicsPreset } from '../../lib/graphics';
	import { loadDraft, saveDraft } from '../../lib/storage';
	import { bodyMu } from '../../lib/orbit-info';
	import { blocksLaunch, checkDesign } from '../../lib/editor/checks';
	import { buildScene, defaultCursor, partKey, withoutCarried } from '../../lib/editor/scene';
	import { partFacts } from '../../lib/editor/part-info';
	import { isStageable } from '../../lib/editor/staging';
	import {
		attachNew,
		attachTargets,
		canRedo,
		canUndo,
		createEditor,
		deleteSubtree,
		detach,
		enableAutoStage,
		moveSubtree,
		moveToStage,
		redo,
		removeEmptyStage,
		rename,
		replaceDesign,
		singlePart,
		stageOf,
		undo,
		type EditorState
	} from '../../lib/editor/state';
	import {
		ascentDeltaV,
		designStats,
		TRIP_TARGETS,
		tripDeltaV,
		type Environment
	} from '../../lib/editor/stats';
	import Catalogue from '../../lib/vab/Catalogue.svelte';
	import ChecksList from '../../lib/vab/ChecksList.svelte';
	import StageEditor from '../../lib/vab/StageEditor.svelte';
	import StatsStrip from '../../lib/vab/StatsStrip.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import Dialog from '../../lib/ui/Dialog.svelte';
	import Icon from '../../lib/ui/Icon.svelte';
	import IconButton from '../../lib/ui/IconButton.svelte';
	import Kbd from '../../lib/ui/Kbd.svelte';

	const DEFAULT_NAME = emptyDesign().name;
	const { catalog, content } = loadContent();
	const lookup = partLookup(catalog);
	const editorContent = { parts: lookup, modules: content.modules };
	const parts = catalog.parts;
	const defOf = (id: string): PartDefinition | undefined => lookup.get(id);
	const body = catalog.bodies[0]!;
	const mu = bodyMu(body);
	const gravity = mu / (body.radius * body.radius);
	const trip = TRIP_TARGETS[0]!;
	const needed = tripDeltaV(
		{ radius: body.radius, mu, rotationPeriod: body.rotationPeriod },
		trip.altitude
	);

	// Editor state is an immutable value replaced on every edit (ADR 0029).
	let editor = $state.raw<EditorState>(createEditor(emptyDesign(), editorContent));
	type Armed = { kind: 'new'; part: string } | { kind: 'carry'; index: number };
	let armed = $state.raw<Armed | null>(null);
	let selected = $state<number | null>(null);
	let cursor = $state<number | null>(null);
	let hoverNode = $state<number | null>(null);
	let hoverPart = $state<string | null>(null);
	let lastPlaced = $state<number | null>(null);
	let flagged = $state.raw<number[]>([]);
	let environment = $state<Environment>('sea-level');
	let icons = $state.raw<Record<string, string>>({});
	let notice = $state('');
	let announce = $state('');
	let confirmOpen = $state(false);
	let loadFailed = $state<string | null>(null);
	let webgl = $state(true);

	let stage: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let left = $state<HTMLElement>();
	let right = $state<HTMLElement>();
	let fileInput: HTMLInputElement;
	let catalogueRef = $state<Catalogue>();
	let view: VabView | null = null;
	let viewReady = $state(false);

	const parsedDraft = ((): VesselDesign | null => {
		const text = loadDraft();
		if (text === null) return null;
		const parsed = parseDesign(text, lookup);
		return parsed.ok ? parsed.design : null;
	})();
	if (parsedDraft) editor = createEditor(parsedDraft, editorContent);

	// --- derived ---------------------------------------------------------------------------------------------

	const carried = $derived(armed?.kind === 'carry' ? armed.index : null);
	const shown = $derived(withoutCarried(editor, carried));
	const held = $derived(
		armed === null
			? null
			: armed.kind === 'new'
				? singlePart(armed.part, editor.nextIndex)
				: shown.assembly
	);
	const targets = $derived(held ? attachTargets(shown.design, held, lookup) : []);
	const active = $derived(
		targets.length === 0 ? null : Math.min(hoverNode ?? cursor ?? 0, targets.length - 1)
	);
	const built = $derived(
		buildScene({
			design: shown.design,
			loose: shown.loose,
			parts: lookup,
			held,
			targets,
			cursor: held ? active : null
		})
	);
	const stats = $derived(designStats(editor.design, content, environment, gravity));
	const checks = $derived(checkDesign(editor, content, stats));
	const ascent = $derived(ascentDeltaV(stats.report));
	const unstaged = $derived(
		editor.design.parts
			.filter(
				(p) =>
					isStageable(defOf(p.part), content.modules) && stageOf(editor.design, p.index) === null
			)
			.map((p) => p.index)
	);
	const selectedEntry = $derived(
		selected === null
			? null
			: (editor.design.parts.find((p) => p.index === selected) ??
					editor.loose.flatMap((a) => a.parts).find((p) => p.index === selected) ??
					null)
	);
	const selectedLoose = $derived(
		selected !== null && !editor.design.parts.some((p) => p.index === selected)
	);
	const subtreeSize = $derived.by(() => {
		if (selected === null) return 0;
		const doc = editor.design.parts.some((p) => p.index === selected)
			? editor.design
			: editor.loose.find((a) => a.parts.some((p) => p.index === selected));
		if (!doc) return 0;
		const seen = new Set([selected]);
		for (let grew = true; grew;) {
			grew = false;
			for (const p of doc.parts) {
				if (p.parent && seen.has(p.parent.index) && !seen.has(p.index)) {
					seen.add(p.index);
					grew = true;
				}
			}
		}
		return seen.size;
	});
	const launchBlocked = $derived(blocksLaunch(checks));
	const warnings = $derived(checks.filter((c) => c.severity === 'warning').length);

	const titleOfPart = (index: number): string => {
		const e =
			editor.design.parts.find((p) => p.index === index) ??
			editor.loose.flatMap((a) => a.parts).find((p) => p.index === index);
		return (e && defOf(e.part)?.title) ?? `Part ${index}`;
	};
	const iconOfPart = (index: number): string => {
		const e = editor.design.parts.find((p) => p.index === index);
		return (e && defOf(e.part)?.stagingIcon) ?? 'part';
	};

	// --- effects ---------------------------------------------------------------------------------------------

	$effect(() => {
		if (viewReady) view?.setScene(built.scene);
	});
	$effect(() => {
		if (viewReady) view?.setSelected(selected === null ? [] : [partKey(selected)]);
	});
	$effect(() => {
		if (viewReady) view?.setFlagged(flagged.map(partKey));
	});
	$effect(() => {
		// The placement cursor restarts below the last placed part whenever the target list changes.
		void targets;
		cursor = defaultCursor(targets, lastPlaced);
	});
	$effect(() => {
		if (viewReady && left && right) {
			const lw = left.offsetWidth;
			const rw = right.offsetWidth;
			view?.setInsets({ left: lw + 32, right: rw + 32, top: 72, bottom: 150 });
		}
	});
	$effect(() => {
		saveDraft(serialiseDesign(editor.design));
	});

	onMount(() => {
		const ro = new ResizeObserver(() => resize());
		function resize(): void {
			const r = stage.getBoundingClientRect();
			view?.resize(Math.round(r.width), Math.round(r.height));
		}
		try {
			view = new VabView({
				canvas,
				shapes: partShapesOf(catalog),
				visuals: new Map(parts.flatMap((p) => (p.visual ? [[p.id, p.visual] as const] : []))),
				attach: new Map(parts.flatMap((p) => (p.attach ? [[p.id, p.attach] as const] : []))),
				props: ['stock.tank-medium', 'stock.engine-lv'],
				quality: initialGraphicsPreset() === 'low' ? 'low' : 'high',
				reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
			});
		} catch (error) {
			webgl = false;
			loadFailed = (error as Error).message;
			return;
		}
		resize();
		// Thumbnails first (they draw into the canvas), then the first frame.
		const made: Record<string, string> = {};
		for (const p of parts) made[p.id] = view.renderIcon(p.id, 104);
		icons = made;
		view.setScene(built.scene);
		view.frame();
		view.start();
		viewReady = true;
		if (import.meta.env.DEV) (window as unknown as { __vab?: VabView }).__vab = view;
		ro.observe(stage);
		return () => {
			ro.disconnect();
			view?.dispose();
			view = null;
		};
	});

	// --- actions ---------------------------------------------------------------------------------------------

	const say = (text: string): void => void (announce = text);
	function attempt(fn: () => void): void {
		try {
			notice = '';
			fn();
		} catch (error) {
			notice = (error as Error).message;
		}
	}

	function arm(part: string): void {
		armed = armed?.kind === 'new' && armed.part === part ? null : { kind: 'new', part };
		selected = null;
		hoverNode = null;
		if (armed)
			say(
				`Placing ${defOf(part)?.title}. Click a highlighted ring, or press Enter to place at the marked one.`
			);
		canvas?.focus({ preventScroll: true });
	}

	function disarm(): void {
		armed = null;
		hoverNode = null;
	}

	function place(i: number): void {
		const target = targets[i];
		if (!target || !armed) return;
		attempt(() => {
			if (armed!.kind === 'new') {
				const index = editor.nextIndex;
				editor = attachNew(editor, editorContent, armed!.part, target);
				lastPlaced = index;
				say(`Attached ${defOf(armed!.part)?.title}.`);
			} else {
				const index = armed!.index;
				editor = moveSubtree(editor, editorContent, index, target);
				selected = index;
				armed = null;
				say(`Moved ${titleOfPart(index)}.`);
			}
		});
		hoverNode = null;
	}

	function doUndo(): void {
		editor = undo(editor);
		afterHistory();
	}
	function doRedo(): void {
		editor = redo(editor);
		afterHistory();
	}
	function afterHistory(): void {
		const alive = new Set([
			...editor.design.parts.map((p) => p.index),
			...editor.loose.flatMap((a) => a.parts.map((p) => p.index))
		]);
		if (selected !== null && !alive.has(selected)) selected = null;
		if (armed?.kind === 'carry' && !alive.has(armed.index)) armed = null;
	}

	function removeSelected(): void {
		if (selected === null) return;
		const name = titleOfPart(selected);
		const n = subtreeSize;
		attempt(() => {
			editor = deleteSubtree(editor, editorContent, selected!);
			say(n > 1 ? `Deleted ${name} and ${n - 1} attached parts.` : `Deleted ${name}.`);
			selected = null;
		});
	}
	function detachSelected(): void {
		if (selected === null || selectedLoose) return;
		attempt(() => {
			editor = detach(editor, editorContent, selected!);
			say(
				`Detached ${titleOfPart(selected!)}. It stays on the floor until you attach or delete it.`
			);
		});
	}
	function carrySelected(): void {
		if (selected === null) return;
		armed = { kind: 'carry', index: selected };
		hoverNode = null;
		say(
			`Moving ${titleOfPart(selected)}. Click a highlighted ring to attach it, Escape to put it back.`
		);
		canvas?.focus({ preventScroll: true });
	}

	function moveStage(index: number, to: number | null): void {
		attempt(() => {
			editor = moveToStage(editor, editorContent, index, to);
		});
	}
	function newVessel(): void {
		disarm();
		selected = null;
		editor = replaceDesign(editor, editorContent, emptyDesign());
		say('Started a new vessel.');
	}
	function loadExample(): void {
		disarm();
		selected = null;
		editor = replaceDesign(editor, editorContent, referenceTwoStage());
		view?.frame();
		say('Loaded the two-stage example.');
	}

	function download(): void {
		const url = URL.createObjectURL(
			new Blob([serialiseDesign(editor.design)], { type: 'application/json' })
		);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${editor.design.name.replace(/[^\w-]+/g, '_') || 'vessel'}.json`;
		a.click();
		URL.revokeObjectURL(url);
		say('Saved the design as a JSON file.');
	}
	async function upload(): Promise<void> {
		const file = fileInput.files?.[0];
		if (!file) return;
		const parsed = parseDesign(await file.text(), lookup);
		if (parsed.ok) {
			disarm();
			selected = null;
			editor = replaceDesign(editor, editorContent, parsed.design);
			view?.frame();
			notice = '';
			say(`Loaded ${parsed.design.name}.`);
		} else {
			notice = `Not loaded: ${parsed.errors.join('; ')}`;
		}
		fileInput.value = '';
	}

	function launch(force = false): void {
		if (launchBlocked) return;
		if (warnings > 0 && !force) {
			confirmOpen = true;
			return;
		}
		saveDraft(serialiseDesign(editor.design));
		void goto('/flight');
	}

	// --- pointer ---------------------------------------------------------------------------------------------

	let drag: { x: number; y: number; moved: boolean; button: number; shift: boolean } | null = null;

	function pointerDown(e: PointerEvent): void {
		canvas.setPointerCapture(e.pointerId);
		canvas.focus({ preventScroll: true });
		drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button, shift: e.shiftKey };
	}
	function pointerMove(e: PointerEvent): void {
		if (drag) {
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			if (!drag.moved && Math.hypot(dx, dy) < 4) return;
			drag.moved = true;
			drag.x = e.clientX;
			drag.y = e.clientY;
			if (drag.button === 1 || drag.shift || (drag.button === 2 && e.shiftKey)) view?.panBy(dx, dy);
			else view?.orbitBy(dx, dy);
			return;
		}
		const hit = view?.pick(e.clientX, e.clientY) ?? null;
		if (armed) {
			// Over the ghost itself the current target stays; elsewhere only a ring selects one.
			hoverNode =
				hit?.kind === 'node' ? Number(hit.key.slice(1)) : hit?.kind === 'ghost' ? hoverNode : null;
			hoverPart = null;
			view?.setHover(null);
		} else {
			hoverPart = hit?.kind === 'part' ? hit.key : null;
			view?.setHover(hoverPart);
		}
		canvas.style.cursor = hit ? 'pointer' : '';
	}
	function pointerUp(e: PointerEvent): void {
		const d = drag;
		drag = null;
		canvas.releasePointerCapture(e.pointerId);
		if (!d || d.moved || d.button !== 0) return;
		const hit = view?.pick(e.clientX, e.clientY) ?? null;
		if (armed) {
			if (hit?.kind === 'node') place(Number(hit.key.slice(1)));
			else if (hit?.kind === 'ghost' && active !== null) place(active);
		} else if (hit?.kind === 'part') {
			selected = Number(hit.key);
			say(`Selected ${titleOfPart(selected)}.`);
		} else {
			selected = null;
		}
	}
	function wheel(e: WheelEvent): void {
		e.preventDefault();
		view?.zoomBy(Math.exp(e.deltaY * 0.0012));
	}

	// --- keyboard ---------------------------------------------------------------------------------------------

	function cycle(step: number): void {
		if (held) {
			if (targets.length === 0) return;
			cursor = ((cursor ?? 0) + step + targets.length) % targets.length;
			hoverNode = null;
			return;
		}
		const all = [
			...editor.design.parts.map((p) => p.index),
			...editor.loose.flatMap((a) => a.parts.map((p) => p.index))
		];
		if (all.length === 0) return;
		const at = selected === null ? -1 : all.indexOf(selected);
		selected = all[(at + step + all.length) % all.length]!;
		say(`Selected ${titleOfPart(selected)}.`);
	}

	function onKey(e: KeyboardEvent): void {
		const t = e.target as HTMLElement | null;
		if (confirmOpen || t?.closest('dialog')) return;
		const typing = t?.matches('input, textarea, select') ?? false;
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === 'z') {
			if (typing) return;
			e.preventDefault();
			if (e.shiftKey) doRedo();
			else doUndo();
			return;
		}
		if (mod && e.key.toLowerCase() === 'y' && !typing) {
			e.preventDefault();
			doRedo();
			return;
		}
		if (typing || mod || e.altKey) return;
		const onCanvas = t === canvas;
		switch (e.key) {
			case 'Escape':
				if (armed) disarm();
				else if (selected !== null) selected = null;
				else return;
				break;
			case '/':
				e.preventDefault();
				catalogueRef?.focusSearch();
				return;
			case 'f':
			case 'F':
				view?.frame();
				return;
			case 'Delete':
			case 'Backspace':
				if (selected === null || armed) return;
				e.preventDefault();
				removeSelected();
				return;
			case 'd':
			case 'D':
				if (selected !== null && !armed) detachSelected();
				return;
			case 'm':
			case 'M':
			case 'g':
			case 'G':
				if (selected !== null && !armed) carrySelected();
				return;
			case ']':
				cycle(1);
				return;
			case '[':
				cycle(-1);
				return;
			case 'Enter':
			case ' ':
				if (onCanvas && armed && active !== null) {
					e.preventDefault();
					place(active);
				}
				return;
			default:
		}
		if (!onCanvas) return;
		const step = 28;
		const shift = e.shiftKey;
		const keys: Record<string, [number, number]> = {
			ArrowLeft: [step, 0],
			ArrowRight: [-step, 0],
			ArrowUp: [0, step],
			ArrowDown: [0, -step]
		};
		const k = keys[e.key];
		if (k) {
			e.preventDefault();
			if (shift) view?.panBy(k[0] * 0.5, k[1] * 0.5);
			else view?.orbitBy(k[0], k[1]);
		} else if (e.key === '+' || e.key === '=') view?.zoomBy(0.85);
		else if (e.key === '-' || e.key === '_') view?.zoomBy(1.18);
		else if (e.key === 'Tab' && armed && targets.length > 1) {
			e.preventDefault();
			cycle(shift ? -1 : 1);
		}
	}
</script>

<svelte:head><title>Vehicle assembly · Orbital</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="vab">
	<div class="stage" bind:this={stage}>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<canvas
			bind:this={canvas}
			tabindex="0"
			aria-label="Vessel assembly view. Arrow keys orbit, plus and minus zoom, bracket keys cycle through parts or attach points, Enter places."
			onpointerdown={pointerDown}
			onpointermove={pointerMove}
			onpointerup={pointerUp}
			onpointercancel={() => (drag = null)}
			onpointerleave={() => {
				hoverNode = null;
				view?.setHover(null);
			}}
			oncontextmenu={(e) => e.preventDefault()}
			onwheel={wheel}
		></canvas>
	</div>

	{#if !webgl}
		<div class="fatal" role="alert">
			<h1>The 3D view could not start</h1>
			<p>{loadFailed}</p>
			<p>Orbital needs WebGL 2. Try another browser or enable hardware acceleration.</p>
			<a href="/">Back to the main page</a>
		</div>
	{/if}

	<div class="ui">
		<div class="top">
			<div class="bar tools" role="toolbar" aria-label="Design">
				<a class="back" href="/" title="Back to the main page"
					><Icon name="back" /><span>Menu</span></a
				>
				<span class="sep"></span>
				<IconButton
					icon="undo"
					label="Undo"
					hint="Ctrl+Z"
					disabled={!canUndo(editor)}
					onclick={doUndo}
				/>
				<IconButton
					icon="redo"
					label="Redo"
					hint="Ctrl+Shift+Z"
					disabled={!canRedo(editor)}
					onclick={doRedo}
				/>
				<span class="sep"></span>
				<IconButton
					icon="plus"
					label="New vessel"
					onclick={newVessel}
					disabled={editor.design.parts.length === 0 && editor.loose.length === 0}
				/>
				<IconButton icon="open" label="Open a design file" onclick={() => fileInput.click()} />
				<IconButton
					icon="save"
					label="Save the design as a file"
					disabled={editor.design.parts.length === 0}
					onclick={download}
				/>
				<input
					bind:this={fileInput}
					type="file"
					accept="application/json,.json"
					hidden
					onchange={upload}
				/>
			</div>

			<div class="center">
				<label class="name">
					<span class="sr-only">Vessel name</span>
					<input
						value={editor.design.name === DEFAULT_NAME ? '' : editor.design.name}
						placeholder="Name your vessel"
						maxlength="48"
						spellcheck="false"
						oninput={(e) => (editor = rename(editor, e.currentTarget.value))}
					/>
				</label>
				<div class="context" aria-live="polite">
					{#if armed}
						<span class="chip live">
							<Icon name={armed.kind === 'new' ? 'plus' : 'move'} size={16} />
							{#if armed.kind === 'new'}
								Placing <strong>{defOf(armed.part)?.title}</strong>
							{:else}
								Moving <strong>{titleOfPart(armed.index)}</strong>
							{/if}
						</span>
						<span class="hintline">
							{#if targets.length === 0}
								Nowhere to attach this part.
							{:else}
								Click a ring, or <Kbd>Tab</Kbd> to choose and <Kbd>Enter</Kbd> to place.
							{/if}
							<Kbd>Esc</Kbd> to stop.
						</span>
					{:else if selectedEntry}
						<span class="chip">
							<strong>{titleOfPart(selected!)}</strong>
							{#if subtreeSize > 1}<span class="dim">and {subtreeSize - 1} attached</span>{/if}
							{#if selectedLoose}<span class="dim">loose</span>{/if}
						</span>
						<div class="acts" role="toolbar" aria-label="Selected part">
							<IconButton icon="move" label="Move" text="Move" hint="M" onclick={carrySelected} />
							<IconButton
								icon="detach"
								label="Detach"
								text="Detach"
								hint="D"
								disabled={selectedLoose}
								onclick={detachSelected}
							/>
							<IconButton
								icon="trash"
								label="Delete"
								text="Delete"
								hint="Del"
								onclick={removeSelected}
							/>
							{#if !selectedLoose}
								<label class="stagepick">
									<span class="dim">Stage</span>
									<select
										aria-label="Stage of {titleOfPart(selected!)}"
										value={stageOf(editor.design, selected!) ?? ''}
										onchange={(e) => {
											const v = e.currentTarget.value;
											moveStage(selected!, v === '' ? null : Number(v));
										}}
									>
										<option value="">None</option>
										{#each Array.from({ length: Math.max(editor.design.stages.length, 1) + 1 }, (_, k) => k) as k (k)}
											<option value={k}
												>{k + 1}{k >= editor.design.stages.length ? ' (new)' : ''}</option
											>
										{/each}
									</select>
								</label>
							{/if}
						</div>
					{/if}
					{#if notice}
						<span class="chip warn" role="alert"><Icon name="alert" size={16} />{notice}</span>
					{/if}
				</div>
			</div>
			<div class="spacer"></div>
		</div>

		<div class="leftcol" bind:this={left}>
			<Catalogue
				bind:this={catalogueRef}
				{parts}
				{icons}
				armed={armed?.kind === 'new' ? armed.part : null}
				facts={(def) => partFacts(def, content)}
				onarm={arm}
			/>
		</div>

		<div class="rightcol" bind:this={right}>
			<StageEditor
				design={editor.design}
				rows={stats.rows}
				{unstaged}
				total={stats.totalDv}
				{environment}
				autoStage={editor.autoStage}
				{selected}
				titleOf={titleOfPart}
				iconOf={iconOfPart}
				onenv={(e) => (environment = e)}
				onmove={moveStage}
				onselect={(i) => (selected = i)}
				onremove={(k) => attempt(() => (editor = removeEmptyStage(editor, editorContent, k)))}
				onauto={() => (editor = enableAutoStage(editor, editorContent))}
			/>
			<div class="grow"></div>
			<ChecksList {checks} onflag={(p) => (flagged = p)} />
			<button
				type="button"
				class="launch"
				disabled={launchBlocked}
				title={launchBlocked ? checks.find((c) => c.severity === 'error')?.text : 'Fly this vessel'}
				onclick={() => launch()}
			>
				<Icon name="launch" size={26} />
				<span class="label">
					<span class="big">Launch</span>
					<span class="sub">
						{#if launchBlocked}Fix the problem above first{:else if warnings > 0}{warnings} warning{warnings ===
							1
								? ''
								: 's'}{:else}All checks passed{/if}
					</span>
				</span>
			</button>
		</div>

		<div class="bottom">
			<StatsStrip {stats} {ascent} {needed} targetLabel={trip.label} />
			<p class="keys">
				<span><Kbd>Drag</Kbd> orbit</span>
				<span><Kbd>Shift</Kbd>+<Kbd>Drag</Kbd> pan</span>
				<span><Kbd>Wheel</Kbd> zoom</span>
				<span><Kbd>F</Kbd> frame</span>
				<span><Kbd>/</Kbd> search</span>
			</p>
		</div>

		{#if editor.design.parts.length === 0 && !armed && editor.loose.length === 0}
			<div class="welcome">
				<h2>Build a vessel</h2>
				<p>
					Pick a command pod on the left, then click the glowing ring on the platform. Keep adding
					parts below it, then stage the engines on the right.
				</p>
				<Button onclick={loadExample}>Load the two-stage example</Button>
			</div>
		{/if}
	</div>

	<div class="sr-only" aria-live="polite" role="status">{announce}</div>

	<Dialog open={confirmOpen} title="Launch with warnings?" onclose={() => (confirmOpen = false)}>
		<ul class="issues">
			{#each checks as c (c.id)}
				<li><strong>{c.text}</strong> <span class="dim">{c.hint}</span></li>
			{/each}
		</ul>
		<div class="actions">
			<Button onclick={() => (confirmOpen = false)}>Back to the VAB</Button>
			<Button
				variant="primary"
				onclick={() => {
					confirmOpen = false;
					launch(true);
				}}>Launch anyway</Button
			>
		</div>
	</Dialog>
</div>

<style>
	.vab {
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
		grid-template-columns: minmax(288px, 22vw) 1fr minmax(288px, 21vw);
		grid-template-rows: auto 1fr auto;
		gap: var(--s-3);
		padding: var(--s-3);
		pointer-events: none;
		min-height: 0;
	}
	.ui > * {
		pointer-events: auto;
	}
	.top {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(288px, 22vw) 1fr minmax(288px, 21vw);
		align-items: start;
		gap: var(--s-3);
		pointer-events: none;
	}
	.top > * {
		pointer-events: auto;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px var(--s-2);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
		justify-self: start;
	}
	.sep {
		width: 1px;
		height: 20px;
		margin: 0 var(--s-1);
		background: var(--line);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		height: 36px;
		padding: 0 var(--s-2);
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-dim);
		text-decoration: none;
		border-radius: var(--r-control);
	}
	.back:hover {
		color: var(--text);
	}
	.center {
		display: grid;
		justify-items: center;
		gap: var(--s-2);
		pointer-events: none;
	}
	.center > * {
		pointer-events: auto;
	}
	.name input {
		width: min(420px, 42vw);
		height: 44px;
		padding: 0 var(--s-3);
		text-align: center;
		font-family: var(--font-ui);
		font-size: var(--t-xl);
		font-weight: 600;
		color: var(--text);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--r-control);
		text-shadow: 0 2px 14px var(--bg-void);
	}
	.name input::placeholder {
		color: var(--text-dim);
		font-weight: 500;
	}
	.name input:hover {
		border-color: var(--line);
	}
	.name input:focus {
		outline: none;
		background: var(--panel);
		border-color: var(--c-accent);
	}
	.context {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--s-3);
		min-height: 40px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		min-height: 36px;
		padding: 0 var(--s-3);
		font-size: var(--t-sm);
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px);
	}
	.chip.live {
		border-color: var(--c-accent);
		color: var(--text);
	}
	.chip.warn {
		border-color: var(--c-warning);
	}
	.dim {
		color: var(--text-dim);
	}
	.hintline {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		padding: var(--s-1) var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-dim);
		background: var(--panel);
		border-radius: var(--r-panel);
	}
	.acts {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 0 var(--s-2);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px);
	}
	.stagepick {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		padding-left: var(--s-2);
		font-size: var(--t-sm);
	}
	.stagepick select {
		height: 28px;
		padding: 0 var(--s-2);
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
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
	}
	.rightcol :global(.stages) {
		flex: 0 1 auto;
		min-height: 160px;
	}
	.grow {
		flex: 1;
	}
	.bottom {
		grid-column: 2;
		grid-row: 3;
		display: grid;
		justify-items: center;
		gap: var(--s-2);
		align-self: end;
	}
	.keys {
		display: flex;
		gap: var(--s-4);
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
	.launch {
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
</style>
