/**
 * The VAB page controller (plan 029): every piece of state and behaviour of `/vab` that is not
 * markup. The route file only lays components out and calls into this class. It owns the editor
 * state (an immutable value replaced per edit, ADR 0029), the 3D view, pointer and keyboard
 * handling, the vessel library (ADR 0041) and the derived read-outs.
 */
import { untrack } from 'svelte';
import {
	surfaceHalfHeight,
	surfacePoint,
	surfaceSite,
	type DesignTilt,
	type PartDefinition,
	type VesselDesign
} from '@orbital/core';
import { VabView, type VabMarker } from '@orbital/renderer';
import { goto } from '$app/navigation';
import { loadContent, partLookup, partShapesOf } from '../catalog';
import { modelProviders } from '../mods/asset-models';
import { emptyDesign, parseDesign, referenceTwoStage, serialiseDesign } from '../design';
import { initialGraphicsPreset } from '../graphics';
import { keyIdOf, type ActionId } from '../keybindings';
import { pinchZoomFactor } from '../touch/touch-model';
import { settings } from '../settings/settings.svelte';
import { bodyMu } from '../orbit-info';
import { loadDraft, loadFlag, loadLibraryId, saveDraft, saveFlag, saveLibraryId } from '../storage';
import { asparagusRocket, boosterRocket, glider } from '../editor/examples';
import { assemblyFromSubtree } from '../editor/assembly';
import { blocksLaunch, checkDesign } from '../editor/checks';
import { describeStack } from '../editor/describe';
import { partFacts } from '../editor/part-info';
import { buildScene, defaultCursor, partKey, withoutCarried } from '../editor/scene';
import { stabilityOf } from '../editor/stability';
import { isStageable } from '../editor/staging';
import {
	attachAssembly,
	attachConnector,
	attachNew,
	attachTargets,
	canRedo,
	canUndo,
	createEditor,
	connectable,
	deleteSubtree,
	detach,
	enableAutoStage,
	groupOf,
	layoutOf,
	moveGroup,
	placementOf,
	moveToStage,
	radialNodeOf,
	radialOf,
	radialTarget,
	redo,
	reindex,
	removeEmptyStage,
	rename,
	replaceDesign,
	setRadial,
	setTilt,
	singlePart,
	siteOfPoint,
	snapRadial,
	stageOf,
	SYMMETRY_COUNTS,
	tiltOf,
	undo,
	type AttachTarget,
	type ConnectorEnd,
	type EditorState
} from '../editor/state';
import {
	ascentDeltaV,
	designStats,
	TRIP_TARGETS,
	tripDeltaV,
	type Environment
} from '../editor/stats';
import {
	browserEnv,
	deleteEntry,
	duplicateEntry,
	exportEntry,
	importText,
	listEntries,
	memoryStore,
	renameEntry,
	saveEntry,
	withFallback,
	type LibraryEntry,
	type LibraryStore
} from './library';
import { indexedDbStore, requestPersistence } from './library-idb';

export type Armed =
	| { kind: 'new'; part: string }
	/** A strut or fuel line: the first end once it is picked, then the second (ADR 0071). */
	| { kind: 'connect'; part: string; from: ConnectorEnd | null }
	| { kind: 'assembly'; id: string }
	| { kind: 'carry'; index: number; single: boolean };

/** Autosave waits this long after the last edit (ms). */
const AUTOSAVE_DELAY = 800;
const THUMB = { width: 192, height: 128 };

export class VabController {
	// --- content ---------------------------------------------------------------------------------------------
	readonly loaded = loadContent();
	readonly catalog = this.loaded.catalog;
	readonly content = this.loaded.content;
	readonly lookup = partLookup(this.catalog);
	readonly editorContent = { parts: this.lookup, modules: this.content.modules };
	readonly parts = this.catalog.parts;
	readonly body = this.catalog.bodies[0]!;
	readonly gravity = bodyMu(this.body) / (this.body.radius * this.body.radius);
	readonly trip = TRIP_TARGETS[0]!;
	readonly needed = tripDeltaV(
		{ radius: this.body.radius, mu: bodyMu(this.body), rotationPeriod: this.body.rotationPeriod },
		this.trip.altitude
	);
	readonly defaultName = emptyDesign().name;
	readonly symmetryCounts = SYMMETRY_COUNTS;

	defOf = (id: string): PartDefinition | undefined => this.lookup.get(id);

	// --- state -----------------------------------------------------------------------------------------------
	editor = $state.raw<EditorState>(createEditor(emptyDesign(), this.editorContent));
	/** A live preview of a radial slider drag; committed on release. */
	preview = $state.raw<EditorState | null>(null);
	armed = $state.raw<Armed | null>(null);
	selected = $state<number | null>(null);
	cursor = $state<number | null>(null);
	hoverNode = $state<number | null>(null);
	lastPlaced = $state<number | null>(null);
	symmetry = $state(1);
	radialAngle = $state(0);
	pointerTarget = $state.raw<AttachTarget | null>(null);
	/** While a connector is armed: the spot under the pointer, as a point of the main group and as an end of a link. */
	connectPointer = $state.raw<{ point: [number, number, number]; end: ConnectorEnd | null } | null>(
		null
	);
	keyboardRadial = $state(false);
	flagged = $state.raw<number[]>([]);
	environment = $state<Environment>('sea-level');
	icons = $state.raw<Record<string, string>>({});
	notice = $state('');
	announce = $state('');
	confirmOpen = $state(false);
	loadFailed = $state<string | null>(null);
	webgl = $state(true);
	viewReady = $state(false);
	highContrast = $state(loadFlag('contrast'));
	drawer = $state<'parts' | 'stages' | null>(null);
	/** Group operations (move, delete, turn) apply to the selected part alone. */
	onlyThis = $state(false);

	// library
	libraryOpen = $state(false);
	vesselEntries = $state.raw<LibraryEntry[]>([]);
	assemblyEntries = $state.raw<LibraryEntry[]>([]);
	libraryId = $state<string | null>(null);
	libraryNote = $state('');
	/** True when the library lives in memory only (IndexedDB failed): the dialog says so. */
	libraryVolatile = $state(false);
	saveState = $state<'idle' | 'saving' | 'saved'>('idle');

	// --- elements (set by `mount`) ---------------------------------------------------------------------------
	canvas: HTMLCanvasElement | undefined;
	view: VabView | null = null;
	focusSearch: () => void = () => {};
	private stageEl: HTMLElement | undefined;
	private leftEl: HTMLElement | undefined;
	private rightEl: HTMLElement | undefined;
	private readonly store: LibraryStore & { readonly degraded: boolean };
	private readonly env = browserEnv();
	private saveTimer: ReturnType<typeof setTimeout> | undefined;
	private drag: { x: number; y: number; moved: boolean; button: number; shift: boolean } | null =
		null;

	// --- derived ---------------------------------------------------------------------------------------------
	/** What the scene, stats and checks show: the live slider preview, else the committed state. */
	readonly current = $derived(this.preview ?? this.editor);
	readonly carried = $derived(this.armed?.kind === 'carry' ? this.armed.index : null);
	readonly carriedSingle = $derived(this.armed?.kind === 'carry' && this.armed.single);
	readonly shown = $derived(withoutCarried(this.current, this.carried, this.carriedSingle));
	readonly assemblyOf = (id: string): VesselDesign | null => {
		const e = this.assemblyEntries.find((x) => x.record.id === id);
		return e?.ok ? e.design : null;
	};
	readonly held = $derived.by((): VesselDesign | null => {
		const a = this.armed;
		if (!a || a.kind === 'connect') return null;
		if (a.kind === 'new') return singlePart(a.part, this.editor.nextIndex);
		if (a.kind === 'assembly') {
			const d = this.assemblyOf(a.id);
			return d ? reindex(d, this.editor.nextIndex) : null;
		}
		return this.shown.assembly;
	});
	readonly heldRootDef = $derived(
		this.held ? this.defOf(this.held.parts.find((p) => p.parent === null)?.part ?? '') : undefined
	);
	readonly radialCapable = $derived(radialNodeOf(this.heldRootDef) !== undefined);
	readonly copies = $derived(
		this.armed?.kind === 'carry' ? this.shown.followers.length + 1 : this.symmetry
	);
	readonly targets = $derived(
		this.held ? attachTargets(this.shown.design, this.held, this.lookup, this.radialAngle) : []
	);
	readonly active = $derived(
		this.targets.length === 0
			? null
			: Math.min(this.hoverNode ?? this.cursor ?? 0, this.targets.length - 1)
	);
	readonly stats = $derived(
		designStats(this.current.design, this.content, this.environment, this.gravity)
	);
	readonly stability = $derived(stabilityOf(this.current.design, this.content));
	readonly markers = $derived.by((): VabMarker[] => {
		const s = this.stability;
		if (s.com === null || s.cop === null || s.comEmpty === null) return [];
		return [
			{ key: 'com', kind: 'com', group: 'main', position: [s.comSide[0], s.com, s.comSide[1]] },
			{ key: 'cop', kind: 'cop', group: 'main', position: [s.copSide[0], s.cop, s.copSide[1]] },
			{
				key: 'com-empty',
				kind: 'com-empty',
				group: 'main',
				position: [s.comSide[0], s.comEmpty, s.comSide[1]]
			}
		];
	});
	/** Where the first end of the connector being placed is, in the main group's frame. */
	readonly connectFrom = $derived.by((): [number, number, number] | null => {
		const a = this.armed;
		if (a?.kind !== 'connect' || !a.from) return null;
		const entry = this.shown.design.parts.find((p) => p.index === a.from!.index);
		const layout = layoutOf(this.shown.design, this.lookup)?.get(a.from.index);
		const shape = entry && this.defOf(entry.part)?.shape;
		const point = layout && surfacePoint(placementOf(layout), shape, a.from);
		return point ? [point.x, point.y, point.z] : null;
	});
	readonly connectPreview = $derived.by(() => {
		const a = this.armed;
		const to = this.connectPointer?.point;
		return a?.kind === 'connect' && this.connectFrom && to
			? { definition: a.part, from: this.connectFrom, to }
			: null;
	});
	readonly built = $derived(
		buildScene({
			design: this.shown.design,
			loose: this.shown.loose,
			parts: this.lookup,
			held: this.held,
			targets: this.targets,
			cursor: this.held ? this.active : null,
			pointer: this.pointerTarget,
			radialMarkers: this.keyboardRadial,
			symmetry: this.copies,
			followers: this.shown.followers,
			markers: this.armed ? [] : this.markers,
			kind: this.armed?.kind === 'carry' ? 'carry' : 'new',
			preview: this.connectPreview
		})
	);
	readonly checks = $derived(checkDesign(this.current, this.content, this.stats, this.stability));
	readonly ascent = $derived(ascentDeltaV(this.stats.report));
	readonly unstaged = $derived(
		this.editor.design.parts
			.filter(
				(p) =>
					isStageable(this.defOf(p.part), this.content.modules) &&
					stageOf(this.editor.design, p.index) === null
			)
			.map((p) => p.index)
	);
	readonly selectedEntry = $derived(
		this.selected === null
			? null
			: (this.editor.design.parts.find((p) => p.index === this.selected) ??
					this.editor.loose.flatMap((a) => a.parts).find((p) => p.index === this.selected) ??
					null)
	);
	readonly selectedLoose = $derived(
		this.selected !== null && !this.editor.design.parts.some((p) => p.index === this.selected)
	);
	readonly groupSize = $derived(
		this.selected === null || this.selectedLoose
			? 1
			: groupOf(this.editor.design, this.selected).length
	);
	/** Azimuth and height of the selected part when it hangs on the side of another one. */
	readonly selectedRadial = $derived.by(() => {
		// The part itself, or the nearest part above it that hangs on a side (a booster's decoupler).
		let at: number | null = this.selected;
		const design = this.current.design;
		while (at !== null) {
			const r = radialOf(design, at);
			if (r) return { ...r, index: at };
			at = design.parts.find((p) => p.index === at)?.parent?.index ?? null;
		}
		return null;
	});
	/** The tilt of the selected part of the design (zero for the root and for loose parts). */
	readonly selectedTilt = $derived<DesignTilt | null>(
		this.selected === null ||
			this.selectedLoose ||
			this.current.design.parts.find((p) => p.index === this.selected)?.parent === null
			? null
			: tiltOf(this.current.design, this.selected)
	);
	/** The connector the selected part is, and its far end: for the info card. */
	readonly selectedLink = $derived(
		this.selected === null
			? null
			: (this.editor.design.parts.find((p) => p.index === this.selected)?.link ?? null)
	);
	readonly radialGroupSize = $derived(
		this.selectedRadial ? groupOf(this.editor.design, this.selectedRadial.index).length : 1
	);
	readonly subtreeSize = $derived.by(() => {
		const sel = this.selected;
		if (sel === null) return 0;
		const doc = this.editor.design.parts.some((p) => p.index === sel)
			? this.editor.design
			: this.editor.loose.find((a) => a.parts.some((p) => p.index === sel));
		if (!doc) return 0;
		const seen = new Set([sel]);
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
	readonly launchBlocked = $derived(blocksLaunch(this.checks));
	readonly warnings = $derived(this.checks.filter((c) => c.severity === 'warning').length);
	readonly stackText = $derived(describeStack(this.editor.design, this.lookup));
	readonly canUndo = $derived(canUndo(this.editor));
	readonly canRedo = $derived(canRedo(this.editor));

	constructor() {
		const text = loadDraft();
		if (text !== null) {
			const parsed = parseDesign(text, this.lookup);
			if (parsed.ok) this.editor = createEditor(parsed.design, this.editorContent);
		}
		this.libraryId = loadLibraryId();
		const primary = typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore();
		this.store = withFallback(primary);

		$effect(() => {
			if (this.viewReady)
				this.view?.setScene({ ...this.built.scene, markers: this.built.scene.markers ?? [] });
		});
		$effect(() => {
			if (this.viewReady)
				this.view?.setSelected(this.selected === null ? [] : [partKey(this.selected)]);
		});
		$effect(() => {
			if (this.viewReady) this.view?.setFlagged(this.flagged.map(partKey));
		});
		$effect(() => {
			// The placement cursor restarts below the last placed part whenever the target list changes.
			void this.targets;
			this.cursor = defaultCursor(this.targets, this.lastPlaced);
		});
		$effect(() => {
			if (this.viewReady) this.view?.setHighContrast(this.highContrast);
		});
		$effect(() => {
			const json = serialiseDesign(this.editor.design);
			untrack(() => {
				saveDraft(json);
				this.scheduleAutosave();
			});
		});
	}

	// --- lookups ---------------------------------------------------------------------------------------------

	titleOfPart = (index: number): string => {
		const e =
			this.editor.design.parts.find((p) => p.index === index) ??
			this.editor.loose.flatMap((a) => a.parts).find((p) => p.index === index);
		return (e && this.defOf(e.part)?.title) ?? `Part ${index}`;
	};
	private partIdOf = (index: number): string | undefined =>
		this.editor.design.parts.find((p) => p.index === index)?.part;
	iconOfPart = (index: number): string => {
		const id = this.partIdOf(index);
		return (id && this.defOf(id)?.stagingIcon) ?? 'part';
	};
	/** The rendered thumbnail of a part of the design (stage chips), when the view has made it. */
	thumbOfPart = (index: number): string | undefined => {
		const id = this.partIdOf(index);
		return id ? this.icons[id] : undefined;
	};
	facts = (def: PartDefinition) => partFacts(def, this.content);

	say = (text: string): void => void (this.announce = text);
	private attempt(fn: () => void): void {
		try {
			this.notice = '';
			fn();
		} catch (error) {
			this.notice = (error as Error).message;
		}
	}

	// --- mount -----------------------------------------------------------------------------------------------

	/** Creates the view on `canvas` and wires resizing. Returns the cleanup. */
	mount(els: {
		canvas: HTMLCanvasElement;
		stage: HTMLElement;
		left: HTMLElement;
		right: HTMLElement;
	}): () => void {
		this.canvas = els.canvas;
		this.stageEl = els.stage;
		this.leftEl = els.left;
		this.rightEl = els.right;
		const ro = new ResizeObserver(() => this.resize());
		try {
			this.view = new VabView({
				canvas: els.canvas,
				shapes: partShapesOf(this.catalog),
				visuals: new Map(this.parts.flatMap((p) => (p.visual ? [[p.id, p.visual] as const] : []))),
				attach: new Map(this.parts.flatMap((p) => (p.attach ? [[p.id, p.attach] as const] : []))),
				providers: modelProviders(),
				props: ['stock.tank-medium', 'stock.engine-lv'],
				quality: initialGraphicsPreset() === 'low' ? 'low' : 'high',
				reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
			});
		} catch (error) {
			this.webgl = false;
			this.loadFailed = (error as Error).message;
			return () => {};
		}
		this.resize();
		// Thumbnails first (they draw into the canvas), then the first frame.
		const made: Record<string, string> = {};
		for (const p of this.parts) made[p.id] = this.view.renderIcon(p.id, 104);
		this.icons = made;
		this.view.setScene(this.built.scene);
		this.view.frame();
		this.view.start();
		this.viewReady = true;
		if (import.meta.env.DEV) (window as unknown as { __vab?: VabView }).__vab = this.view;
		ro.observe(els.stage);
		ro.observe(els.left);
		ro.observe(els.right);
		void this.refreshLibrary();
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		const follow = (): void => this.view?.setReducedMotion(motion.matches);
		motion.addEventListener('change', follow);
		const hide = (): void => {
			if (document.visibilityState === 'hidden') void this.flushSave();
		};
		document.addEventListener('visibilitychange', hide);
		return () => {
			document.removeEventListener('visibilitychange', hide);
			motion.removeEventListener('change', follow);
			ro.disconnect();
			void this.flushSave();
			this.view?.dispose();
			this.view = null;
			this.viewReady = false;
		};
	}

	resize(): void {
		if (!this.stageEl) return;
		const r = this.stageEl.getBoundingClientRect();
		this.view?.resize(Math.round(r.width), Math.round(r.height));
		this.updateInsets();
	}

	/** The free area between the panels: the vessel is centred in it. */
	updateInsets(): void {
		if (!this.viewReady || !this.leftEl || !this.rightEl) return;
		const visible = (el: HTMLElement): number =>
			el.offsetParent === null ? 0 : el.offsetWidth + 32;
		this.view?.setInsets({
			left: visible(this.leftEl),
			right: visible(this.rightEl),
			top: 72,
			bottom: 150
		});
	}

	// --- library ---------------------------------------------------------------------------------------------

	async refreshLibrary(): Promise<void> {
		this.vesselEntries = await listEntries(this.store, this.lookup, 'vessel');
		this.assemblyEntries = await listEntries(this.store, this.lookup, 'assembly');
		this.libraryVolatile = this.store.degraded;
		if (this.libraryId && !this.vesselEntries.some((e) => e.record.id === this.libraryId)) {
			this.libraryId = null;
			saveLibraryId(null);
		}
	}

	async openLibrary(): Promise<void> {
		await this.flushSave();
		await this.refreshLibrary();
		this.libraryNote = '';
		this.libraryOpen = true;
	}

	private scheduleAutosave(): void {
		clearTimeout(this.saveTimer);
		if (!this.viewReady) return;
		// An empty design is only saved over an existing record (so "New vessel" does not litter the list).
		if (this.editor.design.parts.length === 0 && this.libraryId === null) return;
		this.saveState = 'saving';
		this.saveTimer = setTimeout(() => void this.flushSave(), AUTOSAVE_DELAY);
	}

	/** Writes the working design into its library record now. */
	async flushSave(): Promise<void> {
		clearTimeout(this.saveTimer);
		if (this.saveState !== 'saving') return;
		const design = this.editor.design;
		try {
			const record = await saveEntry(this.store, this.env, {
				id: this.libraryId,
				kind: 'vessel',
				design,
				thumbnail: design.parts.length > 0 ? this.thumbnail() : null
			});
			this.libraryId = record.id;
			saveLibraryId(record.id);
			this.libraryVolatile = this.store.degraded;
			this.saveState = 'saved';
			if (!this.libraryAsked) {
				this.libraryAsked = true;
				void requestPersistence();
			}
		} catch (error) {
			this.notice = `The library could not save: ${(error as Error).message}`;
			this.saveState = 'idle';
		}
	}
	private libraryAsked = false;

	/** PNG of the working design from the 3D view; '' without a view. */
	private thumbnail(): string | null {
		const url = this.view?.captureThumbnail(THUMB.width, THUMB.height) ?? '';
		return url === '' ? null : url;
	}

	async openEntry(id: string): Promise<void> {
		const entry = this.vesselEntries.find((e) => e.record.id === id);
		if (!entry?.ok) return;
		await this.flushSave();
		this.disarm();
		this.selected = null;
		this.libraryId = id;
		saveLibraryId(id);
		this.editor = replaceDesign(this.editor, this.editorContent, entry.design);
		this.saveState = 'idle';
		this.libraryOpen = false;
		this.view?.frame();
		this.say(`Opened ${entry.design.name}.`);
	}

	async renameLibraryEntry(id: string, name: string): Promise<void> {
		try {
			const record = await renameEntry(this.store, this.env, id, name);
			if (id === this.libraryId) this.editor = rename(this.editor, record.name);
			this.libraryNote = '';
		} catch (error) {
			this.libraryNote = (error as Error).message;
		}
		await this.refreshLibrary();
	}

	async duplicateLibraryEntry(id: string): Promise<void> {
		try {
			await duplicateEntry(this.store, this.env, id);
			this.libraryNote = '';
		} catch (error) {
			this.libraryNote = (error as Error).message;
		}
		await this.refreshLibrary();
	}

	async deleteLibraryEntry(id: string): Promise<void> {
		await deleteEntry(this.store, id);
		if (id === this.libraryId) {
			this.libraryId = null;
			saveLibraryId(null);
			this.saveState = 'idle';
		}
		await this.refreshLibrary();
	}

	exportLibraryEntry(id: string): void {
		const entry = [...this.vesselEntries, ...this.assemblyEntries].find((e) => e.record.id === id);
		if (!entry) return;
		const { text, fileName } = exportEntry(entry.record);
		this.downloadText(text, fileName);
	}

	async importFile(file: File): Promise<void> {
		const result = await importText(this.store, this.env, await file.text(), this.lookup);
		this.libraryNote = result.ok
			? `Imported ${result.design.name}.`
			: `Not imported: ${result.errors.join('; ')}`;
		await this.refreshLibrary();
	}

	private downloadText(text: string, fileName: string): void {
		const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
	}

	/** Saves the working design as a file (the portable form). */
	download(): void {
		this.downloadText(
			serialiseDesign(this.editor.design),
			`${this.editor.design.name.replace(/[^\w-]+/g, '_') || 'vessel'}.json`
		);
		this.say('Saved the design as a JSON file.');
	}

	// --- sub-assemblies ----------------------------------------------------------------------------------------

	/** Keeps the selected part and everything attached to it as a sub-assembly in the library. */
	async saveSelectedAsAssembly(): Promise<void> {
		const sel = this.selected;
		if (sel === null) return;
		const name = `${this.titleOfPart(sel)} assembly`;
		const assembly = assemblyFromSubtree(this.editor, sel, name);
		if (!assembly) return;
		const taken = this.assemblyEntries.map((e) => e.record.name);
		let unique = name;
		for (let n = 2; taken.includes(unique); n++) unique = `${name} (${n})`;
		const named = { ...assembly, name: unique };
		try {
			await saveEntry(this.store, this.env, {
				kind: 'assembly',
				design: named,
				thumbnail: this.assemblyThumbnail(named)
			});
			await this.refreshLibrary();
			this.say(
				`Saved ${unique} as a sub-assembly. Find it in the Sub-assemblies tab of the catalogue.`
			);
			this.notice = '';
		} catch (error) {
			this.notice = `Could not save the sub-assembly: ${(error as Error).message}`;
		}
	}

	/** A thumbnail of one assembly: shown alone for a moment, then the scene is put back. */
	private assemblyThumbnail(assembly: VesselDesign): string | null {
		if (!this.view) return null;
		const alone = buildScene({
			design: assembly,
			loose: [],
			parts: this.lookup,
			held: null,
			targets: [],
			cursor: null
		});
		this.view.setScene(alone.scene);
		const url = this.view.captureThumbnail(THUMB.width, THUMB.height);
		this.view.setScene(this.built.scene);
		return url === '' ? null : url;
	}

	async deleteAssembly(id: string): Promise<void> {
		if (this.armed?.kind === 'assembly' && this.armed.id === id) this.disarm();
		await deleteEntry(this.store, id);
		await this.refreshLibrary();
	}

	// --- placing ---------------------------------------------------------------------------------------------

	arm(part: string): void {
		if (this.defOf(part)?.connector) {
			this.armed =
				this.armed?.kind === 'connect' && this.armed.part === part
					? null
					: { kind: 'connect', part, from: null };
			this.connectPointer = null;
			this.afterArm(`Placing ${this.defOf(part)?.title}.`, true);
			return;
		}
		this.armed =
			this.armed?.kind === 'new' && this.armed.part === part ? null : { kind: 'new', part };
		this.afterArm(`Placing ${this.defOf(part)?.title}.`);
	}

	armAssembly(id: string): void {
		const d = this.assemblyOf(id);
		if (!d) return;
		this.armed =
			this.armed?.kind === 'assembly' && this.armed.id === id ? null : { kind: 'assembly', id };
		this.afterArm(`Placing the sub-assembly ${d.name}.`);
	}

	private afterArm(text: string, connect = false): void {
		this.selected = null;
		this.hoverNode = null;
		if (this.armed && connect) {
			this.say(
				`${text} Click the part it hangs on, then the part it ends on; or select a part and press Enter.`
			);
		} else if (this.armed) {
			this.say(`${text} Click a highlighted ring, or press Enter to place at the marked one.`);
		}
		this.drawer = null;
		this.canvas?.focus({ preventScroll: true });
	}

	disarm(): void {
		this.armed = null;
		this.hoverNode = null;
		this.pointerTarget = null;
		this.connectPointer = null;
	}

	/** The end of a connector on part `index` at the point `hit` (main group frame), snapped; null when it has no surface. */
	private endAt(
		index: number,
		hit: readonly [number, number, number],
		free: boolean
	): ConnectorEnd | null {
		const design = this.shown.design;
		if (!connectable(design, this.editorContent, index)) return null;
		const entry = design.parts.find((p) => p.index === index);
		const shape = entry && this.defOf(entry.part)?.shape;
		const raw = siteOfPoint(design, this.lookup, index, { x: hit[0], y: hit[1], z: hit[2] });
		if (!raw || !surfaceSite(shape, raw.angle)) return null;
		const half = surfaceHalfHeight(shape);
		const site = free ? raw : snapRadial(raw, half * 2, 0.2, { angleStep: Math.PI / 12 });
		return { index, angle: site.angle, y: Math.max(-half, Math.min(half, site.y)) };
	}

	/** One pick of a connector: the first end, then the second, which makes the connector(s). */
	private pickConnectorEnd(end: ConnectorEnd): void {
		const armed = this.armed;
		if (armed?.kind !== 'connect') return;
		if (!armed.from) {
			this.armed = { ...armed, from: end };
			this.say(`Hangs on ${this.titleOfPart(end.index)}. Now click the part it ends on.`);
			return;
		}
		const from = armed.from;
		const title = this.defOf(armed.part)?.title;
		this.attempt(() => {
			const before = this.editor.design.parts.length;
			this.editor = attachConnector(this.editor, this.editorContent, armed.part, from, end);
			const n = this.editor.design.parts.length - before;
			this.say(
				`Added ${n > 1 ? `${n} ` : 'a '}${title}${n > 1 ? 's' : ''} from ${this.titleOfPart(from.index)} to ${this.titleOfPart(end.index)}.`
			);
		});
		// Ready for the next one; a failed pick keeps the first end so the player can pick another.
		if (!this.notice) this.armed = { ...armed, from: null };
		this.connectPointer = null;
	}

	/** Keyboard: the selected part is the next end of the connector, at the marked angle and the middle. */
	private pickConnectorSelected(): void {
		const sel = this.selected;
		if (sel === null || this.armed?.kind !== 'connect') return;
		const shape = this.defOf(this.partIdOf(sel) ?? '')?.shape;
		const end = shape ? this.endAt(sel, this.pointOnSide(sel, this.radialAngle), false) : null;
		if (end) this.pickConnectorEnd(end);
		else this.notice = 'Pick a part of the vessel, not a loose one or another connector.';
	}

	/** A point on the side of part `index` at `angle`, middle height, in the main group's frame (for keyboard picks). */
	private pointOnSide(index: number, angle: number): [number, number, number] {
		const layout = layoutOf(this.shown.design, this.lookup)?.get(index);
		const entry = this.shown.design.parts.find((p) => p.index === index);
		const point =
			layout &&
			surfacePoint(placementOf(layout), this.defOf(entry?.part ?? '')?.shape, { angle, y: 0 });
		return point ? [point.x, point.y, point.z] : [0, 0, 0];
	}

	place(i: number): void {
		const target = this.targets[i];
		if (target) this.placeAt(target);
	}

	placeAt(target: AttachTarget): void {
		const armed = this.armed;
		if (!armed) return;
		this.attempt(() => {
			if (armed.kind === 'new') {
				const index = this.editor.nextIndex;
				const before = this.editor.design.parts.length;
				this.editor = attachNew(this.editor, this.editorContent, armed.part, target, this.symmetry);
				this.lastPlaced = index;
				const n = this.editor.design.parts.length - before;
				this.say(`Attached ${n > 1 ? `${n} ` : ''}${this.defOf(armed.part)?.title}.`);
			} else if (armed.kind === 'assembly') {
				const d = this.assemblyOf(armed.id);
				if (!d) throw new Error('that sub-assembly is gone');
				const index = this.editor.nextIndex;
				const before = this.editor.design.parts.length;
				this.editor = attachAssembly(this.editor, this.editorContent, d, target, this.symmetry);
				this.lastPlaced = index;
				this.say(`Attached ${d.name}: ${this.editor.design.parts.length - before} parts.`);
			} else if (armed.kind === 'carry') {
				const before = groupOf(this.editor.design, armed.index).length;
				this.editor = moveGroup(this.editor, this.editorContent, armed.index, target, {
					single: armed.single
				});
				this.selected = armed.index;
				this.armed = null;
				this.say(
					`Moved ${this.titleOfPart(armed.index)}${before > 1 && !armed.single ? ` and its ${before - 1} copies` : ''}.`
				);
			}
		});
		this.hoverNode = null;
		this.pointerTarget = null;
	}

	/** The radial site under a part hit while a radial part is armed, snapped; null elsewhere. */
	private radialFromHit(hit: ReturnType<VabView['pick']>, free: boolean): AttachTarget | null {
		const held = this.held;
		if (!held || !this.radialCapable || hit?.kind !== 'part') return null;
		const parentIndex = Number(hit.key);
		const entry = this.shown.design.parts.find((p) => p.index === parentIndex);
		const shape = entry && this.defOf(entry.part)?.shape;
		if (!shape || this.defOf(entry.part)?.connector) return null;
		const raw = siteOfPoint(this.shown.design, this.lookup, parentIndex, {
			x: hit.point[0],
			y: hit.point[1],
			z: hit.point[2]
		});
		if (!raw) return null;
		const def = this.heldRootDef;
		const childHeight =
			def?.shape?.kind === 'cylinder' ? def.shape.height : (def?.shape?.size[1] ?? 1);
		const n = this.copies;
		const step = n > 1 ? (2 * Math.PI) / (n * Math.max(1, Math.round(24 / n))) : Math.PI / 12;
		const site = free
			? raw
			: snapRadial(raw, surfaceHalfHeight(shape) * 2, childHeight, { angleStep: step });
		return radialTarget(this.shown.design, held, this.lookup, parentIndex, site.angle, site.y);
	}

	// --- editing ---------------------------------------------------------------------------------------------

	doUndo(): void {
		this.preview = null;
		this.editor = undo(this.editor);
		this.afterHistory();
	}
	doRedo(): void {
		this.preview = null;
		this.editor = redo(this.editor);
		this.afterHistory();
	}
	private afterHistory(): void {
		const alive = new Set([
			...this.editor.design.parts.map((p) => p.index),
			...this.editor.loose.flatMap((a) => a.parts.map((p) => p.index))
		]);
		if (this.selected !== null && !alive.has(this.selected)) this.selected = null;
		if (this.armed?.kind === 'carry' && !alive.has(this.armed.index)) this.armed = null;
	}

	removeSelected(single = false): void {
		const sel = this.selected;
		if (sel === null) return;
		const name = this.titleOfPart(sel);
		const count = (): number =>
			this.editor.design.parts.length + this.editor.loose.reduce((m, a) => m + a.parts.length, 0);
		const before = count();
		this.attempt(() => {
			this.editor = deleteSubtree(this.editor, this.editorContent, sel, { single });
			const n = before - count();
			this.say(n > 1 ? `Deleted ${name} and ${n - 1} other parts.` : `Deleted ${name}.`);
			this.selected = null;
		});
	}
	detachSelected(): void {
		const sel = this.selected;
		if (sel === null || this.selectedLoose) return;
		this.attempt(() => {
			this.editor = detach(this.editor, this.editorContent, sel);
			this.say(
				`Detached ${this.titleOfPart(sel)}${this.groupSize > 1 ? ` and its ${this.groupSize - 1} copies` : ''}. It stays on the floor until you attach or delete it.`
			);
		});
	}
	carrySelected(single = false): void {
		const sel = this.selected;
		if (sel === null) return;
		this.armed = { kind: 'carry', index: sel, single };
		this.hoverNode = null;
		const group = !single && this.groupSize > 1;
		this.say(
			`Moving ${this.titleOfPart(sel)}${group ? ` and its ${this.groupSize - 1} copies` : ''}. Click a highlighted ring or a spot on a tank to attach it, Escape to put it back.`
		);
		this.canvas?.focus({ preventScroll: true });
	}

	/** Live angle or height change from a slider; one undo step when `commit` is true. */
	turnSelected(
		change: { angle?: number; y?: number },
		options: { single?: boolean; commit: boolean }
	): void {
		const sel = this.selectedRadial?.index;
		if (sel === undefined) return;
		this.attempt(() => {
			const next = setRadial(this.editor, this.editorContent, sel, change, {
				single: options.single
			});
			if (options.commit) {
				this.editor = next;
				this.preview = null;
			} else {
				this.preview = next;
			}
		});
		if (this.notice) this.preview = null;
	}

	/** Turns the selected radial group by `step` rad (keyboard). */
	stepSelected(step: number): void {
		const r = this.selectedRadial;
		if (!r) return;
		this.turnSelected({ angle: r.angle + step }, { commit: true });
		this.say(`Turned ${this.titleOfPart(r.index)}.`);
	}

	/** Live tilt change from a slider about the parent's axes (ADR 0071); one undo step when `commit` is true. */
	tiltSelected(change: Partial<DesignTilt>, options: { single?: boolean; commit: boolean }): void {
		const sel = this.selected;
		const now = this.selectedTilt;
		if (sel === null || !now) return;
		this.attempt(() => {
			const next = setTilt(
				this.editor,
				this.editorContent,
				sel,
				{ ...now, ...change },
				{ single: options.single }
			);
			if (options.commit) {
				this.editor = next;
				this.preview = null;
			} else {
				this.preview = next;
			}
		});
		if (this.notice) this.preview = null;
	}

	moveStage(index: number, to: number | null): void {
		this.attempt(() => {
			this.editor = moveToStage(this.editor, this.editorContent, index, to);
		});
	}
	removeStage(k: number): void {
		this.attempt(() => (this.editor = removeEmptyStage(this.editor, this.editorContent, k)));
	}
	autoStage(): void {
		this.editor = enableAutoStage(this.editor, this.editorContent);
	}
	setName(name: string): void {
		this.editor = rename(this.editor, name);
	}
	newVessel(): void {
		this.disarm();
		this.selected = null;
		this.libraryId = null;
		saveLibraryId(null);
		this.saveState = 'idle';
		this.editor = replaceDesign(this.editor, this.editorContent, emptyDesign());
		this.say('Started a new vessel.');
	}
	loadExample(): void {
		this.disarm();
		this.selected = null;
		this.libraryId = null;
		saveLibraryId(null);
		this.editor = replaceDesign(this.editor, this.editorContent, referenceTwoStage());
		this.view?.frame();
		this.say('Loaded the two-stage example.');
	}
	loadBoosterExample(): void {
		this.disarm();
		this.selected = null;
		this.libraryId = null;
		saveLibraryId(null);
		this.editor = replaceDesign(this.editor, this.editorContent, boosterRocket(this.editorContent));
		this.view?.frame();
		this.say('Loaded the booster rocket: 23 parts with four boosters and four fins.');
	}
	loadAsparagusExample(): void {
		this.disarm();
		this.selected = null;
		this.libraryId = null;
		saveLibraryId(null);
		this.editor = replaceDesign(
			this.editor,
			this.editorContent,
			asparagusRocket(this.editorContent)
		);
		this.view?.frame();
		this.say('Loaded the asparagus rocket: four boosters with fuel lines and struts.');
	}
	loadGliderExample(): void {
		this.disarm();
		this.selected = null;
		this.libraryId = null;
		saveLibraryId(null);
		this.editor = replaceDesign(this.editor, this.editorContent, glider(this.editorContent));
		this.view?.frame();
		this.say('Loaded the glider: a pod and tank with two wings and a tail.');
	}
	toggleContrast(): void {
		this.highContrast = !this.highContrast;
		saveFlag('contrast', this.highContrast);
		this.say(this.highContrast ? 'High-contrast markers on.' : 'High-contrast markers off.');
	}

	launch(force = false): void {
		if (this.launchBlocked) return;
		if (this.warnings > 0 && !force) {
			this.confirmOpen = true;
			return;
		}
		saveDraft(serialiseDesign(this.editor.design));
		void this.flushSave();
		void goto('/flight');
	}

	// --- pointer ---------------------------------------------------------------------------------------------

	private pick(e: PointerEvent): ReturnType<VabView['pick']> {
		return (
			this.view?.pick(e.clientX, e.clientY, {
				ignoreGhost: this.armed !== null && this.radialCapable
			}) ?? null
		);
	}

	/** Fingers on the canvas, for the two-finger pinch (plan 053); the mouse is one pointer. */
	private pointers = new Map<number, { x: number; y: number }>();
	private pinch = 0;
	private pinchNow(): number {
		const [a, b] = [...this.pointers.values()];
		return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
	}

	pointerDown = (e: PointerEvent): void => {
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		this.canvas?.setPointerCapture(e.pointerId);
		if (this.pointers.size === 2) {
			// A second finger turns the gesture into a pinch: no click, no orbit.
			this.drag = null;
			this.pinch = this.pinchNow();
			return;
		}
		this.canvas?.focus({ preventScroll: true });
		this.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button, shift: e.shiftKey };
	};
	pointerMove = (e: PointerEvent): void => {
		const tracked = this.pointers.get(e.pointerId);
		if (tracked) {
			tracked.x = e.clientX;
			tracked.y = e.clientY;
		}
		if (this.pointers.size >= 2) {
			const now = this.pinchNow();
			if (this.pinch > 0) this.view?.zoomBy(pinchZoomFactor(this.pinch, now));
			this.pinch = now;
			return;
		}
		const d = this.drag;
		if (d) {
			const dx = e.clientX - d.x;
			const dy = e.clientY - d.y;
			if (!d.moved && Math.hypot(dx, dy) < 4) return;
			d.moved = true;
			d.x = e.clientX;
			d.y = e.clientY;
			if (d.button === 1 || d.shift || (d.button === 2 && e.shiftKey)) this.view?.panBy(dx, dy);
			else this.view?.orbitBy(dx, dy);
			return;
		}
		const hit = this.pick(e);
		if (this.armed?.kind === 'connect') {
			// A connector follows the pointer over any ordinary part: its end is the snapped spot under it.
			this.hoverNode = null;
			this.pointerTarget = null;
			this.connectPointer =
				hit?.kind === 'part'
					? {
							point: [hit.point[0], hit.point[1], hit.point[2]],
							end: this.endAt(Number(hit.key), hit.point, e.altKey)
						}
					: null;
			this.view?.setHover(null);
		} else if (this.armed) {
			// Over the ghost itself the current target stays; elsewhere only a ring selects one.
			this.hoverNode =
				hit?.kind === 'node'
					? Number(hit.key.slice(1))
					: hit?.kind === 'ghost'
						? this.hoverNode
						: null;
			// A radial part follows the pointer over the sides of cylindrical parts (Alt: no snapping).
			this.pointerTarget = this.radialFromHit(hit, e.altKey);
			this.keyboardRadial = false;
			this.view?.setHover(null);
		} else {
			this.view?.setHover(hit?.kind === 'part' ? hit.key : null);
		}
		if (this.canvas) this.canvas.style.cursor = hit ? 'pointer' : '';
	};
	pointerUp = (e: PointerEvent): void => {
		const wasPinch = this.pointers.size >= 2;
		this.pointers.delete(e.pointerId);
		this.pinch = 0;
		const d = this.drag;
		this.drag = null;
		this.canvas?.releasePointerCapture(e.pointerId);
		if (wasPinch) return;
		if (!d || d.moved || d.button !== 0) return;
		const hit = this.pick(e);
		if (this.armed?.kind === 'connect') {
			const end = hit?.kind === 'part' ? this.endAt(Number(hit.key), hit.point, e.altKey) : null;
			if (end) this.pickConnectorEnd(end);
			else if (hit?.kind === 'part') this.notice = 'A strut or fuel line joins two ordinary parts.';
		} else if (this.armed) {
			const site = this.radialFromHit(hit, e.altKey);
			if (hit?.kind === 'node') this.place(Number(hit.key.slice(1)));
			else if (site) this.placeAt(site);
			else if (hit?.kind === 'ghost' && this.active !== null) this.place(this.active);
		} else if (hit?.kind === 'part') {
			this.selected = Number(hit.key);
			this.say(`Selected ${this.titleOfPart(this.selected)}.`);
		} else {
			this.selected = null;
		}
	};
	pointerCancel = (e: PointerEvent): void => {
		this.pointers.delete(e.pointerId);
		this.pinch = 0;
		this.drag = null;
	};
	pointerLeave = (): void => {
		this.hoverNode = null;
		this.pointerTarget = null;
		this.view?.setHover(null);
	};
	wheel = (e: WheelEvent): void => {
		e.preventDefault();
		this.view?.zoomBy(Math.exp(e.deltaY * 0.0012));
	};

	// --- keyboard --------------------------------------------------------------------------------------------

	private cycle(step: number): void {
		if (this.held) {
			this.keyboardRadial = true;
			if (this.targets.length === 0) return;
			this.cursor = ((this.cursor ?? 0) + step + this.targets.length) % this.targets.length;
			this.hoverNode = null;
			return;
		}
		const all = [
			...this.editor.design.parts.map((p) => p.index),
			...this.editor.loose.flatMap((a) => a.parts.map((p) => p.index))
		];
		if (all.length === 0) return;
		const at = this.selected === null ? -1 : all.indexOf(this.selected);
		this.selected = all[(at + step + all.length) % all.length]!;
		this.say(`Selected ${this.titleOfPart(this.selected)}.`);
	}

	onKey = (e: KeyboardEvent): void => {
		const t = e.target as HTMLElement | null;
		if (this.confirmOpen || this.libraryOpen || t?.closest('dialog')) return;
		const typing = t?.matches('input, textarea, select') ?? false;
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === 'z') {
			if (typing) return;
			e.preventDefault();
			if (e.shiftKey) this.doRedo();
			else this.doUndo();
			return;
		}
		if (mod && e.key.toLowerCase() === 'y' && !typing) {
			e.preventDefault();
			this.doRedo();
			return;
		}
		if (mod && e.key.toLowerCase() === 's') {
			e.preventDefault();
			this.saveState = 'saving';
			void this.flushSave().then(() => this.say('Saved to the library.'));
			return;
		}
		if (typing || mod || e.altKey) return;
		const onCanvas = t === this.canvas;
		// Backspace is a fixed second key for Delete (ADR 0061); every other key goes through the table.
		const action: ActionId | 'escape' | null =
			e.key === 'Escape'
				? 'escape'
				: e.key === 'Backspace'
					? 'delete'
					: settings.keymap.actionFor('vab', keyIdOf(e));
		switch (action) {
			case 'escape':
				if (this.armed) this.disarm();
				else if (this.selected !== null) this.selected = null;
				else if (this.drawer) this.drawer = null;
				else return;
				break;
			case 'search':
				e.preventDefault();
				this.focusSearch();
				return;
			case 'frame':
				this.view?.frame();
				return;
			case 'delete':
				if (this.selected === null || this.armed) return;
				e.preventDefault();
				this.removeSelected(e.shiftKey);
				return;
			case 'symmetry':
				if (this.armed?.kind === 'carry' || !this.armed) return;
				this.symmetry =
					SYMMETRY_COUNTS[
						(SYMMETRY_COUNTS.indexOf(this.symmetry as 1) + 1) % SYMMETRY_COUNTS.length
					]!;
				this.say(this.symmetry === 1 ? 'Symmetry off.' : `${this.symmetry}-way symmetry.`);
				return;
			case 'turnPlus':
			case 'turnMinus': {
				const dir = action === 'turnMinus' ? -1 : 1;
				if (this.armed?.kind === 'connect') {
					this.radialAngle += (dir * 2 * Math.PI) / 24;
					this.say('Turned the pick point.');
				} else if (this.armed && this.radialCapable) {
					this.keyboardRadial = true;
					this.radialAngle += (dir * 2 * Math.PI) / (this.copies > 1 ? this.copies * 2 : 24);
					this.say('Turned the radial sites.');
				} else if (!this.armed && this.selectedRadial) {
					this.stepSelected(
						(dir * 2 * Math.PI) / (this.radialGroupSize > 1 ? this.radialGroupSize * 2 : 24)
					);
				}
				return;
			}
			case 'detach':
				if (this.selected !== null && !this.armed) this.detachSelected();
				return;
			case 'carry':
				if (this.selected !== null && !this.armed) this.carrySelected(e.shiftKey);
				return;
			case 'subAssembly':
				if (this.selected !== null && !this.armed) void this.saveSelectedAsAssembly();
				return;
			case 'nextPart':
				this.cycle(1);
				return;
			case 'prevPart':
				this.cycle(-1);
				return;
			case 'place':
				if (onCanvas && this.armed?.kind === 'connect') {
					e.preventDefault();
					this.pickConnectorSelected();
				} else if (onCanvas && this.armed && this.active !== null) {
					e.preventDefault();
					this.place(this.active);
				}
				return;
			default:
		}
		if (!onCanvas) return;
		const step = 28;
		const keys: Record<string, [number, number]> = {
			ArrowLeft: [step, 0],
			ArrowRight: [-step, 0],
			ArrowUp: [0, step],
			ArrowDown: [0, -step]
		};
		const k = keys[e.key];
		if (k) {
			e.preventDefault();
			if (e.shiftKey) this.view?.panBy(k[0] * 0.5, k[1] * 0.5);
			else this.view?.orbitBy(k[0], k[1]);
		} else if (e.key === '+' || e.key === '=') this.view?.zoomBy(0.85);
		else if (e.key === '-' || e.key === '_') this.view?.zoomBy(1.18);
		else if (action === 'nextSite' && this.armed && this.targets.length > 1) {
			e.preventDefault();
			this.cycle(e.shiftKey ? -1 : 1);
		}
	};
}
