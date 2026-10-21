/**
 * The VAB page controller (plan 029): every piece of state and behaviour of `/vab` that is not
 * markup. The route file only lays components out and calls into this class. It owns the editor
 * state (an immutable value replaced per edit, ADR 0029), the 3D view, pointer and keyboard
 * handling, the vessel library (ADR 0041) and the derived read-outs.
 */
import { MISSION_BLUEPRINTS } from '../editor/missions';
import { resolve } from '$app/paths';
import { untrack } from 'svelte';
import {
	homeBodyOf,
	mat3OfQuat,
	surfaceHalfHeight,
	surfacePoint,
	surfaceSite,
	type DesignTilt,
	type PartDefinition,
	type PlacedBuilding,
	type VesselDesign
} from '@orbital/core';
import { VabView, type GizmoAxis, type VabGizmo, type VabMarker } from '@orbital/renderer';
import { goto } from '$app/navigation';
import { loadContent, partLookup, partShapesOf } from '../catalog';
import { categoriesOf } from '../editor/categories';
import {
	NO_RELIABILITY,
	partReliabilityLine,
	type WorldReliability
} from '../reliability/reliability-model';
import { modelProviders } from '../mods/asset-models';
import { emptyDesign, parseDesign, serialiseDesign, starterRocket } from '../design';
import { initialGraphicsPreset } from '../graphics';
import { keyIdOf, type ActionId } from '../keybindings';
import { pinchZoomFactor } from '../touch/touch-model';
import { settings } from '../settings/settings.svelte';
import { bodyMu } from '../orbit-info';
import { bodyLabel } from '../hud-model';
import { buildRow, setBuildSetting } from '../editor/build-settings';
import { powerView } from '../editor/power';
import { setCrew } from '../editor/crew';
import { seatsOf, toggleSeat } from '../launch/launch-model';
import type { RosterMember } from '../launch/roster';
import {
	customMembers,
	groupActions,
	setGroupMember,
	stockGroupParts,
	stockGroupsOf
} from '../editor/groups';
import type { ControlRow } from '../vessel-panel/vessel-model';
import { loadDraft, loadFlag, loadLibraryId, saveDraft, saveFlag, saveLibraryId } from '../storage';
import { asparagusRocket, boosterRocket, glider, moonShot } from '../editor/examples';
import { assemblyFromSubtree } from '../editor/assembly';
import { blocksLaunch, checkDesign } from '../editor/checks';
import { partsLimit } from '../capacity';
import { describeStack } from '../editor/describe';
import { partFacts } from '../editor/part-info';
import {
	addFairingSection,
	addFairingSectionAt,
	fairingOf,
	MIN_SECTION,
	removeFairingSection,
	setFairingClosed,
	setFairingInterstage,
	setFairingSection
} from '../editor/fairing';
import { buildScene, defaultCursor, partKey, withoutCarried } from '../editor/scene';
import { stabilityOf } from '../editor/stability';
import { designCost } from '@orbital/core';
import { isStageable } from '../editor/staging';
import {
	attachAssembly,
	attachConnector,
	attachNew,
	attachTargets,
	copyOf,
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
	nudgedOffset,
	offsetOf,
	onShapeSide,
	placementOf,
	setFreePlacement,
	setPlacement,
	turnedTilt,
	moveToStage,
	radialNodeOf,
	radialOf,
	radialTarget,
	surfaceTarget,
	rootOf,
	redo,
	reindex,
	removeEmptyStage,
	rename,
	setAircraft,
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
	withRootTilt,
	NO_TILT,
	type AttachTarget,
	type SymmetrySpec,
	type ConnectorEnd,
	type EditorState
} from '../editor/state';
import { designStats, situationAt, type Environment } from '../editor/stats';
import { stagingModelFromDesign } from '../delta-v';
import { designLocks, NO_TREE, type WorldTech } from '../tech/world-tech';
import { destinationsOf } from '../editor/trip';
import { tripView } from '../editor/trip-view';
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
import { MOVE_FINE, MOVE_STEP, ROTATE_FINE, ROTATE_STEP, snapTo, toolKeyEffect } from './tool-keys';

export type Armed =
	| { kind: 'new'; part: string }
	/** A strut or fuel line: the first end once it is picked, then the second (ADR 0071). */
	| { kind: 'connect'; part: string; from: ConnectorEnd | null }
	| { kind: 'assembly'; id: string }
	| { kind: 'carry'; index: number; single: boolean }
	/** An Alt-click copy of a subtree on the cursor (plan 217); dropping it on the catalogue discards it. */
	| { kind: 'copy'; assembly: VesselDesign; title: string };

/** A face whose normal is at least this far from horizontal is a top, a bottom or a slope (plan 244): a surface link, not a radial site. */
const SLOPE_NORMAL_Y = 0.25;
/** Screen radii (CSS pixels) of a ring's glow and of its snap (plan 244). */
const GLOW_PX = 80;
/** How close (CSS pixels) a press must be to grab a fairing handle (plan 243). */
const HANDLE_PX = 28;
const SNAP_PX = 36;

/** Rotation steps of a carried part (plan 217, ADR 0207 point 3), rad. */
const TURN_STEP = Math.PI / 2;
const TURN_FINE = (5 * Math.PI) / 180;

/** How close (CSS pixels) a press must be to grab a gizmo arrow or ring. */
const GIZMO_PX = 14;

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
	/** The catalogue: every part but debris-only pieces (`catalog.hidden`, plan 219). */
	readonly parts = this.catalog.parts.filter((p) => p.catalog?.hidden !== true);
	/** The catalogue rail, in order (plan 069). */
	readonly categories = categoriesOf(this.loaded.categories);
	readonly techNodes = this.loaded.techNodes;
	readonly registriesParts = {
		list: () => this.catalog.parts,
		get: (id: string) => this.catalog.parts.find((p) => p.id === id)
	};
	readonly body = homeBodyOf(this.catalog.bodies)!;
	readonly gravity = bodyMu(this.body) / (this.body.radius * this.body.radius);
	/** What the loaded bodies offer as a trip (plan 034): mod bodies are in the list without any code. */
	readonly destinations = destinationsOf(this.catalog.bodies);
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
	/** Mirror symmetry (R, plan 217): two copies reflected across the vessel's plane. */
	mirror = $state(false);
	/** The carried part's turn from the keys (plan 217). */
	turn = $state.raw<DesignTilt>(NO_TILT);
	/** Angle snap of radial sites (C, plan 217): 15 degrees, 5 with Shift held. */
	angleSnap = $state(true);
	radialAngle = $state(0);
	pointerTarget = $state.raw<AttachTarget | null>(null);
	/** Where the held part floats while no site is under the pointer (plan 244). */
	freePoint = $state.raw<[number, number, number] | null>(null);
	/** Targets whose rings glow because the pointer is near them (plan 244). */
	nearTargets = $state.raw<ReadonlySet<number>>(new Set());
	/** While a connector is armed: the spot under the pointer, as a point of the main group and as an end of a link. */
	connectPointer = $state.raw<{ point: [number, number, number]; end: ConnectorEnd | null } | null>(
		null
	);
	keyboardRadial = $state(false);
	flagged = $state.raw<number[]>([]);
	environment = $state<Environment>('sea-level');
	/** Δv and TWR are for this body (plan 218): the home body until the picker chooses another. */
	statsBodyId = $state(String(this.body.id));
	/** The bodies of the picker: those with a surface (no star), home first. */
	readonly statsBodies = [
		this.body,
		...this.catalog.bodies.filter((b) => b !== this.body && b.star !== true)
	].map((b) => ({ id: String(b.id), label: bodyLabel(String(b.id)) }));
	/** m above the surface for the "altitude" situation; null at the surface (sea level). */
	statsAltitude = $state<number | null>(null);
	readonly statsBody = $derived(
		this.catalog.bodies.find((b) => String(b.id) === this.statsBodyId) ?? this.body
	);
	readonly situation = $derived(
		situationAt(
			this.statsBody,
			this.environment === 'vacuum'
				? { kind: 'vacuum' }
				: this.statsAltitude !== null
					? { kind: 'altitude', altitude: this.statsAltitude }
					: { kind: 'sea-level' }
		)
	);
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
	/** The Hangar tool (plan 279, ADR 0258 point 3): place and pick, move (offset) or rotate the selected part. */
	tool = $state<'place' | 'move' | 'rotate'>('place');
	/** Axes of the Move and Rotate tools: the part's own (`local`) or the vessel's (`absolute`). */
	toolFrame = $state<'local' | 'absolute'>('absolute');
	/** Snap to nodes (plan 279): off, a held part goes on any surface at the cursor and rings are ignored. */
	snapNodes = $state(true);
	/** The gizmo axis being dragged (drawn highlighted). */
	gizmoActive = $state<GizmoAxis | null>(null);

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
	private drag: {
		x: number;
		y: number;
		moved: boolean;
		button: number;
		shift: boolean;
		/** The part under the press (plan 217): a drag from it picks it up. */
		part?: string;
	} | null = null;
	/** The carry started by dragging a part (plan 217): letting go places or drops it. */
	private dragCarry = false;

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
		if (a.kind === 'new') return withRootTilt(singlePart(a.part, this.editor.nextIndex), this.turn);
		if (a.kind === 'assembly') {
			const d = this.assemblyOf(a.id);
			return d ? withRootTilt(reindex(d, this.editor.nextIndex), this.turn) : null;
		}
		if (a.kind === 'copy')
			return withRootTilt(reindex(a.assembly, this.editor.nextIndex), this.turn);
		return this.shown.assembly ? withRootTilt(this.shown.assembly, this.turn) : null;
	});
	/** The symmetry setting placements use: a mirror pair, else the count. */
	readonly symmetrySpec = $derived<SymmetrySpec>(
		this.mirror ? { count: 1, mirror: true } : { count: this.symmetry }
	);
	readonly heldRootDef = $derived(
		this.held ? this.defOf(this.held.parts.find((p) => p.parent === null)?.part ?? '') : undefined
	);
	readonly radialCapable = $derived(radialNodeOf(this.heldRootDef) !== undefined);
	readonly copies = $derived(
		this.armed?.kind === 'carry' ? this.shown.followers.length + 1 : this.mirror ? 2 : this.symmetry
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
		designStats(
			this.current.design,
			this.content,
			this.situation.environment,
			this.situation.gravity,
			this.situation.pressure
		)
	);
	readonly stability = $derived(stabilityOf(this.current.design, this.content));
	/** Power made and drawn by day and night (plan 218). */
	readonly power = $derived(powerView(this.current.design, this.editorContent));
	/** Launch cost of the design with full tanks (plan 095, ADR 0113). */
	readonly cost = $derived(designCost(this.current.design, this.content));
	/** The tool pill's marker toggles (plan 093, ADR 0148 point 4). */
	showCom = $state(true);
	showCot = $state(true);
	/**
	 * Centre of thrust of the first stage to fire: its engines' origins weighted by peak thrust along
	 * the vessel axis, in the main group's frame; null without an engine in that stage.
	 */
	readonly cot = $derived.by((): [number, number, number] | null => {
		const design = this.current.design;
		const first = new Set(design.stages[0] ?? []);
		if (first.size === 0) return null;
		const layout = layoutOf(design, this.lookup);
		if (!layout) return null;
		let w = 0;
		const sum = [0, 0, 0];
		for (const p of stagingModelFromDesign(design, this.content).parts.values()) {
			const at = layout.get(p.index);
			if (!p.engine || !first.has(p.index) || !at) continue;
			const thrust = Math.max(0, ...p.engine.thrust.map((t) => t.thrust)) * p.thrustFactor;
			w += thrust;
			sum[0] += at.position.x * thrust;
			sum[1] += at.position.y * thrust;
			sum[2] += at.position.z * thrust;
		}
		return w > 0 ? [sum[0] / w, sum[1] / w, sum[2] / w] : null;
	});
	readonly markers = $derived.by((): VabMarker[] => {
		const s = this.stability;
		const cot: VabMarker[] =
			this.showCot && this.cot
				? [{ key: 'cot', kind: 'cot', group: 'main', position: this.cot }]
				: [];
		if (!this.showCom || s.com === null || s.cop === null || s.comEmpty === null) return cot;
		return [
			...cot,
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
			handles: this.handlesNow(),
			free: this.armed?.kind === 'connect' ? null : this.freePoint,
			near: this.nearTargets,
			radialMarkers: this.keyboardRadial,
			symmetry: this.armed?.kind === 'carry' ? this.copies : this.symmetrySpec,
			followers: this.shown.followers,
			markers: this.armed ? [] : this.markers,
			kind: this.armed?.kind === 'carry' ? 'carry' : 'new',
			preview: this.connectPreview
		})
	);
	/** Parts the active world's tech tree locks (plan 105, ADR 0154 point 4); set by the page. */
	tech = $state<WorldTech>(NO_TREE);
	readonly locks = $derived(
		designLocks(this.current.design, this.techNodes, this.registriesParts, this.tech)
	);
	/**
	 * The active world's first site and whether its capacity limits apply (plan 096, ADR 0123
	 * point 4); the page sets it once the world is read. Null: no limits.
	 */
	capacity = $state.raw<{ site: { buildings?: readonly PlacedBuilding[] }; on: boolean } | null>(
		null
	);
	readonly partsLimit = $derived(
		partsLimit(
			this.capacity?.site,
			this.loaded.world.buildings,
			this.capacity?.on ?? false,
			this.current.design.parts.length
		)
	);
	readonly checks = $derived(
		checkDesign(
			this.current,
			this.content,
			this.stats,
			this.stability,
			this.locks,
			this.partsLimit,
			this.current.design.crew ?? null
		)
	);
	tripId = $state('low-orbit');
	readonly trip = $derived(
		tripView(
			this.destinations.find((d) => d.id === this.tripId) ?? this.destinations[0]!,
			this.stats.report,
			this.stats.partCount
		)
	);
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
	/** The offset of the selected part of the design (plan 279; null for the root and loose parts). */
	readonly selectedOffset = $derived(
		this.selectedTilt === null || this.selected === null
			? null
			: offsetOf(this.current.design, this.selected)
	);
	/** Free placement of the design (plan 279, ADR 0258 point 4): saved with it. */
	readonly freePlacement = $derived(this.editor.design.freePlacement === true);
	/** The part the Move and Rotate tools act on: the selected part of the design, not its root. */
	readonly toolTarget = $derived(
		this.tool === 'place' || this.armed || this.selectedTilt === null ? null : this.selected
	);
	/** The gizmo at the tool's part (plan 279): arrows for Move, rings for Rotate, in the tool's axes. */
	readonly gizmo = $derived.by((): VabGizmo | null => {
		const sel = this.toolTarget;
		if (sel === null || this.tool === 'place') return null;
		const at = layoutOf(this.current.design, this.lookup)?.get(sel);
		if (!at) return null;
		const m = mat3OfQuat(at.rotation);
		const axes: VabGizmo['axes'] =
			this.toolFrame === 'local'
				? [
						[m[0], m[3], m[6]],
						[m[1], m[4], m[7]],
						[m[2], m[5], m[8]]
					]
				: [
						[1, 0, 0],
						[0, 1, 0],
						[0, 0, 1]
					];
		return {
			group: 'main',
			mode: this.tool,
			position: [at.position.x, at.position.y, at.position.z],
			axes,
			active: this.gizmoActive
		};
	});
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
				this.view?.setScene({
					...this.built.scene,
					markers: this.built.scene.markers ?? [],
					gizmo: this.gizmo
				});
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
	/** The active world's part reliability (plan 130, ADR 0156 point 8); set by the page. */
	reliability = $state.raw<WorldReliability>(NO_RELIABILITY);
	reliabilityOfPart = (index: number): string | null => {
		const id = this.partIdOf(index);
		const def = id === undefined ? undefined : this.defOf(id);
		return def ? partReliabilityLine(this.reliability, def, this.loaded.failureModes) : null;
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
		// a read-only view of the Hangar for tests (plan 217): where parts and target rings are on
		// the page, and what the editor holds
		(window as unknown as { __orbitalVab?: unknown }).__orbitalVab = {
			partAt: (index: number) => this.pageOf(this.view?.screenPositionOf(String(index)) ?? null),
			targetAt: (i: number) => this.pageOf(this.view?.screenPositionOfMarker(`t${i}`) ?? null),
			targets: () =>
				this.targets.map((t, i) => ({ i, parent: t.parent, node: t.node, radial: t.radial })),
			active: () => this.active,
			parts: () => this.editor.design.parts.map((p) => ({ index: p.index, part: p.part })),
			looseParts: () => this.editor.loose.reduce((n, a) => n + a.parts.length, 0),
			armed: () => this.armed?.kind ?? null,
			// for captures (plan 220): the vessel's draw cost, and a fixed camera
			stats: () => (this.view ? { ...this.view.stats } : null),
			camera: () => this.view?.cameraGoal ?? null,
			aim: (yaw: number, pitch: number, distance: number, target?: [number, number, number]) =>
				this.view?.debug.setCamera(yaw, pitch, distance, target)
		};
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

	/** A canvas position as page coordinates (for the test hook). */
	private pageOf(p: { x: number; y: number } | null): { x: number; y: number } | null {
		const r = this.canvas?.getBoundingClientRect();
		return p && r ? { x: r.left + p.x, y: r.top + p.y } : null;
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
			// no top bar of its own (plan 238): room for the context chip only
			top: 40,
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
		// a carried part or a copy brought to the catalogue goes back into it (plan 217)
		if (this.armed?.kind === 'carry' || this.armed?.kind === 'copy') {
			this.dropOnCatalogue();
			return;
		}
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
		this.turn = NO_TILT;
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
		this.freePoint = null;
		this.nearTargets = new Set();
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
				const held = this.held;
				// a turned part goes in as an assembly with its tilt: still one undo step
				this.editor =
					held && (this.turn.x !== 0 || this.turn.y !== 0 || this.turn.z !== 0)
						? attachAssembly(this.editor, this.editorContent, held, target, this.symmetrySpec)
						: attachNew(this.editor, this.editorContent, armed.part, target, this.symmetrySpec);
				this.lastPlaced = index;
				// the carry loop (plan 217): the hand is empty after a click places the part
				this.armed = null;
				const n = this.editor.design.parts.length - before;
				this.say(`Attached ${n > 1 ? `${n} ` : ''}${this.defOf(armed.part)?.title}.`);
			} else if (armed.kind === 'assembly') {
				const d = this.assemblyOf(armed.id);
				if (!d) throw new Error('that sub-assembly is gone');
				const index = this.editor.nextIndex;
				const before = this.editor.design.parts.length;
				this.editor = attachAssembly(
					this.editor,
					this.editorContent,
					withRootTilt(d, this.turn),
					target,
					this.symmetrySpec
				);
				this.lastPlaced = index;
				this.armed = null;
				this.say(`Attached ${d.name}: ${this.editor.design.parts.length - before} parts.`);
			} else if (armed.kind === 'copy') {
				const index = this.editor.nextIndex;
				const before = this.editor.design.parts.length;
				this.editor = attachAssembly(
					this.editor,
					this.editorContent,
					withRootTilt(armed.assembly, this.turn),
					target,
					this.symmetrySpec
				);
				this.lastPlaced = index;
				this.armed = null;
				this.say(
					`Placed a copy of ${armed.title}: ${this.editor.design.parts.length - before} parts.`
				);
			} else if (armed.kind === 'carry') {
				const before = groupOf(this.editor.design, armed.index).length;
				this.editor = moveGroup(this.editor, this.editorContent, armed.index, target, {
					single: armed.single,
					tilt: this.turn
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

	/**
	 * Where the held part lands on the part under the pointer (plan 244, ADR 0235): the radial site on a
	 * side for a part with a side node, else a surface link at the hit point and face normal (the top
	 * and bottom faces, a cone's slope, a side for a part with no side node). Null with Alt held (the
	 * nodes only), or off a part.
	 */
	private siteFromHit(hit: ReturnType<VabView['pick']>, nodesOnly: boolean): AttachTarget | null {
		const held = this.held;
		if (nodesOnly || !held || hit?.kind !== 'part') return null;
		const normal = hit.normal;
		const slanted = normal !== undefined && Math.abs(normal[1]) >= SLOPE_NORMAL_Y;
		const point = { x: hit.point[0], y: hit.point[1], z: hit.point[2] };
		// a radial site only where the face is the collider's side (plan 279): on a pod's slope or a
		// cone the radial site would float off the visible face, so the surface link takes the hit point
		if (
			this.snapNodes &&
			this.radialCapable &&
			!slanted &&
			onShapeSide(this.shown.design, this.lookup, Number(hit.key), point)
		) {
			const side = this.radialFromHit(hit, false);
			if (side) return side;
		}
		if (!normal) return null;
		return surfaceTarget(this.shown.design, held, this.lookup, Number(hit.key), {
			point: { x: hit.point[0], y: hit.point[1], z: hit.point[2] },
			normal
		});
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
		const site =
			free || !this.angleSnap
				? raw
				: snapRadial(raw, surfaceHalfHeight(shape) * 2, childHeight, {
						angleStep: this.fineSnap ? Math.PI / 36 : step
					});
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
		this.turn = tiltOf(this.editor.design, sel);
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

	// --- move and rotate tools (plan 279, ADR 0258) -----------------------------------------------------------

	/** Picks the Place, Move or Rotate tool; Move and Rotate act on the selected part. */
	setTool(tool: 'place' | 'move' | 'rotate'): void {
		this.tool = tool;
		this.gizmoActive = null;
		if (tool === 'place') {
			this.say('Place tool.');
			return;
		}
		if (this.armed) this.disarm();
		const name = tool === 'move' ? 'Move' : 'Rotate';
		this.say(
			this.toolTarget === null
				? `${name} tool: select a part attached to the vessel.`
				: `${name} tool on ${this.titleOfPart(this.toolTarget)}, ${this.toolFrame} axes.`
		);
	}
	toggleToolFrame(): void {
		this.toolFrame = this.toolFrame === 'local' ? 'absolute' : 'local';
		this.say(
			this.toolFrame === 'local' ? 'Local axes (the part’s).' : 'Absolute axes (the vessel’s).'
		);
	}
	toggleSnapNodes(): void {
		this.snapNodes = !this.snapNodes;
		this.say(
			this.snapNodes
				? 'Snap to nodes on.'
				: 'Snap to nodes off: parts go on any surface at the cursor.'
		);
	}
	setFreePlacement(on: boolean): void {
		this.editor = setFreePlacement(this.editor, on);
		this.say(
			on
				? 'Free mode: parts may be moved anywhere.'
				: 'Free mode off: moved parts must touch their parent.'
		);
	}

	/** Moves the tool's part by `delta` m along the tool's axes; one undo step. */
	nudgeSelected(delta: readonly [number, number, number]): void {
		const sel = this.toolTarget;
		if (sel === null) return;
		const offset = nudgedOffset(this.editor.design, this.lookup, sel, delta, this.toolFrame);
		if (!offset) return;
		this.attempt(() => {
			this.editor = setPlacement(
				this.editor,
				this.editorContent,
				sel,
				{ offset },
				{
					single: this.onlyThis
				}
			);
			const f = (v: number) => v.toFixed(2);
			this.say(`Offset ${f(offset.x)}, ${f(offset.y)}, ${f(offset.z)} m.`);
		});
	}
	/** Turns the tool's part by `angle` rad about the tool's `axis`; one undo step. */
	rotateSelected(axis: GizmoAxis, angle: number): void {
		const sel = this.toolTarget;
		if (sel === null) return;
		const tilt = turnedTilt(this.editor.design, this.lookup, sel, axis, angle, this.toolFrame);
		if (!tilt) return;
		this.attempt(() => {
			this.editor = setPlacement(
				this.editor,
				this.editorContent,
				sel,
				{ tilt },
				{
					single: this.onlyThis
				}
			);
			const d = (v: number) => Math.round((v * 180) / Math.PI);
			this.say(`Tilt ${d(tilt.x)}, ${d(tilt.y)}, ${d(tilt.z)} degrees.`);
		});
	}
	/** Offset (Move tool) or tilt (Rotate tool) of the tool's part back to zero. */
	resetPlacement(what: 'offset' | 'tilt' = this.tool === 'rotate' ? 'tilt' : 'offset'): void {
		const sel = this.toolTarget ?? (this.selectedTilt ? this.selected : null);
		if (sel === null) return;
		this.attempt(() => {
			this.editor = setPlacement(
				this.editor,
				this.editorContent,
				sel,
				what === 'tilt' ? { tilt: NO_TILT } : { offset: { x: 0, y: 0, z: 0 } },
				{ single: this.onlyThis }
			);
			this.say(what === 'tilt' ? 'Rotation reset.' : 'Offset reset.');
		});
	}
	/** A tool key (`tool` scope); true when it did something. */
	private toolKey(action: ActionId, fine: boolean): boolean {
		if (this.tool === 'place') return false;
		const effect = toolKeyEffect(action, this.tool, fine);
		if (!effect) return false;
		if (effect.kind === 'frame') this.toggleToolFrame();
		else if (effect.kind === 'reset') this.resetPlacement();
		else if (effect.kind === 'nudge') this.nudgeSelected(effect.delta);
		else this.rotateSelected(effect.axis, effect.angle);
		return true;
	}

	/** A gizmo drag (plan 279): the axis, where it started on screen and the state it started from. */
	private gizmoDrag: {
		axis: GizmoAxis;
		x: number;
		y: number;
		start: EditorState;
		index: number;
		/** Rotate: the pointer's last screen angle about the centre and the turn so far, rad. */
		last: number;
		turned: number;
	} | null = null;

	/** Starts dragging a gizmo arrow or ring under the pointer; true when it took the press. */
	private grabGizmo(e: PointerEvent): boolean {
		const sel = this.toolTarget;
		if (sel === null || e.button !== 0) return false;
		const axis = this.view?.gizmoAxisNear(e.clientX, e.clientY, GIZMO_PX) ?? null;
		if (!axis) return false;
		this.gizmoDrag = {
			axis,
			x: e.clientX,
			y: e.clientY,
			start: this.editor,
			index: sel,
			last: this.screenAngle(e),
			turned: 0
		};
		this.gizmoActive = axis;
		return true;
	}
	/** The pointer's angle about the gizmo's centre on screen, anticlockwise, rad. */
	private screenAngle(e: PointerEvent): number {
		const s = this.view?.gizmoScreen();
		const r = this.canvas?.getBoundingClientRect();
		if (!s || !r) return 0;
		return Math.atan2(-(e.clientY - r.top - s.centre.y), e.clientX - r.left - s.centre.x);
	}
	/** Moves or turns the part with the dragged gizmo axis: a live preview, committed on release. */
	private dragGizmo(e: PointerEvent): void {
		const d = this.gizmoDrag;
		const s = this.view?.gizmoScreen();
		if (!d || !s) return;
		const snap = (v: number, step: number) => snapTo(v, step, e.altKey);
		try {
			if (this.tool === 'move') {
				const tip = s.tips[d.axis];
				if (!tip) return;
				const tx = tip.x - s.centre.x;
				const ty = tip.y - s.centre.y;
				const l2 = tx * tx + ty * ty;
				if (l2 < 1) return;
				const metres = snap(
					((e.clientX - d.x) * tx + (e.clientY - d.y) * ty) / l2,
					e.shiftKey ? MOVE_FINE : MOVE_STEP
				);
				const delta: [number, number, number] = [
					d.axis === 'x' ? metres : 0,
					d.axis === 'y' ? metres : 0,
					d.axis === 'z' ? metres : 0
				];
				const offset = nudgedOffset(d.start.design, this.lookup, d.index, delta, this.toolFrame);
				if (!offset) return;
				this.preview = setPlacement(
					d.start,
					this.editorContent,
					d.index,
					{ offset },
					{
						single: this.onlyThis
					}
				);
			} else {
				const now = this.screenAngle(e);
				let step = now - d.last;
				step = Math.atan2(Math.sin(step), Math.cos(step));
				d.last = now;
				d.turned += step * s.facing[d.axis];
				const angle = snap(d.turned, e.shiftKey ? ROTATE_FINE : ROTATE_STEP);
				const tilt = turnedTilt(
					d.start.design,
					this.lookup,
					d.index,
					d.axis,
					angle,
					this.toolFrame
				);
				if (!tilt) return;
				this.preview = setPlacement(
					d.start,
					this.editorContent,
					d.index,
					{ tilt },
					{
						single: this.onlyThis
					}
				);
			}
			this.notice = '';
		} catch (err) {
			// out of bounds: the part stays where it last fitted, and the reason shows
			this.notice = err instanceof Error ? err.message : String(err);
		}
	}
	private releaseGizmo(): void {
		this.gizmoDrag = null;
		this.gizmoActive = null;
		if (this.preview) {
			this.editor = this.preview;
			this.preview = null;
		}
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
	/** Mark the design an aircraft: it rolls out to a runway and starts level (plan 063). */
	setAircraft(on: boolean): void {
		this.editor = setAircraft(this.editor, on);
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
		this.editor = replaceDesign(this.editor, this.editorContent, starterRocket());
		this.view?.frame();
		this.say('Loaded the two-stage example, with a parachute for the way home.');
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
	loadMoonExample(): void {
		this.disarm();
		this.selected = null;
		this.libraryId = null;
		saveLibraryId(null);
		this.editor = replaceDesign(this.editor, this.editorContent, moonShot());
		this.view?.frame();
		this.say('Loaded the moon shot: a core with four boosters under a lander. Pick a trip below.');
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
	/** Load a famous-mission blueprint (plan 286). */
	loadMission(id: string): void {
		const mission = MISSION_BLUEPRINTS.find((m) => m.id === id);
		if (!mission) return;
		this.disarm();
		this.selected = null;
		this.libraryId = null;
		saveLibraryId(null);
		this.editor = replaceDesign(this.editor, this.editorContent, mission.build(this.editorContent));
		this.view?.frame();
		this.say(`Loaded ${mission.title}, inspired by ${mission.inspiredBy}.`);
	}
	toggleContrast(): void {
		this.highContrast = !this.highContrast;
		saveFlag('contrast', this.highContrast);
		this.say(this.highContrast ? 'High-contrast markers on.' : 'High-contrast markers off.');
	}

	/** Shift held while carrying: 5 degree steps for the snap and the turn keys (plan 217). */
	fineSnap = false;
	/** The touch chip for Alt (plan 217): the next part tapped is copied, then it turns off. */
	copyMode = $state(false);
	/** Fairing edit mode (plan 219): a click in the view adds a section to the selected base. */
	fairingEdit = $state(false);
	/** The selected part's fairing, or null (plan 219). */
	readonly selectedFairing = $derived(
		this.selected === null ? null : fairingOf(this.current.design, this.lookup, this.selected)
	);

	/**
	 * The handles of the fairing being edited (plan 243): `hb` marks the base rim, and each section
	 * top has `h<i>` on the axis (drag up or down for the height) and `r<i>` on its rim (drag out or
	 * in for the radius). None for a tilted or loose base.
	 */
	readonly fairingHandles = $derived.by(() => {
		const f = this.selectedFairing;
		const sel = this.selected;
		if (!this.fairingEdit || !f || sel === null || this.armed) return [];
		const at = layoutOf(this.shown.design, this.lookup)?.get(sel);
		if (!at || at.tilted) return [];
		const { x, y, z } = at.position;
		const out: Array<{
			key: string;
			position: readonly [number, number, number];
			radius: number;
		}> = [{ key: 'hb', position: [x, y + f.baseTop, z], radius: f.size / 2 }];
		let top = f.baseTop;
		for (const [i, s] of f.sections.entries()) {
			top += s.height;
			out.push(
				{ key: `h${i}`, position: [x, y + top, z], radius: s.radius },
				{ key: `r${i}`, position: [x + s.radius, y + top, z], radius: 0.07 }
			);
		}
		return out;
	});
	private handlesNow(): typeof this.fairingHandles {
		return this.fairingHandles;
	}
	/** A handle being dragged (plan 243): which section and what, the grab offset and the start. */
	private handleDrag: {
		i: number;
		what: 'h' | 'r';
		dUp: number;
		dAcross: number;
		before: number;
	} | null = null;

	/** Starts dragging a fairing handle under the pointer; true when it took the press. */
	private grabHandle(e: PointerEvent): boolean {
		const f = this.selectedFairing;
		if (!this.fairingEdit || !f || this.armed || e.button !== 0) return false;
		const key = this.view?.handleNear(e.clientX, e.clientY, HANDLE_PX);
		if (!key) return false;
		const i = Number(key.slice(1));
		const s = f.sections[i];
		const off = this.view?.offsetOnPlane(e.clientX, e.clientY, 'hb');
		if (!s || !off) return false;
		const what = key[0] === 'r' ? 'r' : 'h';
		const before = f.sections.slice(0, i).reduce((h, x) => h + x.height, 0);
		this.handleDrag = {
			i,
			what,
			before,
			dUp: off.up - (before + s.height),
			dAcross: what === 'r' ? Math.abs(off.across) - s.radius : 0
		};
		return true;
	}
	/** Moves the grabbed handle: a live preview, committed on release as one undo step. */
	private dragHandle(e: PointerEvent): void {
		const d = this.handleDrag;
		const sel = this.selected;
		if (!d || sel === null) return;
		const off = this.view?.offsetOnPlane(e.clientX, e.clientY, 'hb');
		if (!off) return;
		const change =
			d.what === 'h'
				? { height: Math.max(MIN_SECTION, off.up - d.dUp - d.before) }
				: { radius: Math.abs(off.across) - d.dAcross };
		try {
			this.preview = setFairingSection(this.editor, this.editorContent, sel, d.i, change);
			this.notice = '';
		} catch (err) {
			// out of limits: the shell stays where it last fitted, and the reason shows
			this.notice = err instanceof Error ? err.message : String(err);
		}
	}
	private releaseHandle(): void {
		if (!this.handleDrag) return;
		this.handleDrag = null;
		if (this.preview) {
			this.editor = this.preview;
			this.preview = null;
		}
	}

	/** Adds a section on top of the selected fairing: as wide as the last, half a metre tall. */
	addFairingSection(section?: { height: number; radius: number }): void {
		const sel = this.selected;
		const f = this.selectedFairing;
		if (sel === null || !f) return;
		const next = section ?? {
			height: 0.5,
			radius: f.sections.at(-1)?.radius ?? f.size / 2
		};
		this.attempt(() => {
			this.editor = addFairingSection(this.editor, this.editorContent, sel, next);
			this.say(`Fairing: ${f.sections.length + 1} sections.`);
		});
	}
	setFairingSection(i: number, change: { height?: number; radius?: number }): void {
		const sel = this.selected;
		if (sel === null) return;
		this.attempt(() => {
			this.editor = setFairingSection(this.editor, this.editorContent, sel, i, change);
		});
	}
	removeFairingSection(): void {
		const sel = this.selected;
		if (sel === null) return;
		this.attempt(() => {
			this.editor = removeFairingSection(this.editor, this.editorContent, sel);
		});
	}
	setInterstage(on: boolean): void {
		const sel = this.selected;
		if (sel === null) return;
		this.attempt(() => {
			this.editor = setFairingInterstage(this.editor, this.editorContent, sel, on);
			this.say(on ? 'Interstage: the next stage attaches at the shell top.' : 'Interstage off.');
		});
	}
	closeFairing(closed: boolean): void {
		const sel = this.selected;
		if (sel === null) return;
		this.attempt(() => {
			this.editor = setFairingClosed(this.editor, this.editorContent, sel, closed);
			this.say(closed ? 'Fairing closed.' : 'Fairing opened.');
		});
	}

	/** The selected part's build-time settings (plan 218): its inspector rows in the Hangar. */
	readonly selectedBuild = $derived(
		this.selected === null || this.selectedLoose
			? null
			: buildRow(this.current.design, this.editorContent, this.selected)
	);

	/** Sets a build control on the selected part and, unless "Only this part", its copies. */
	setBuild(control: ControlRow, value: boolean | number | string): void {
		const sel = this.selected;
		if (sel === null) return;
		this.attempt(() => {
			const before = groupOf(this.editor.design, sel).length;
			this.editor = setBuildSetting(this.editor, this.editorContent, sel, control, value, {
				single: this.onlyThis
			});
			const n = this.onlyThis ? 1 : before;
			this.say(`${control.label} set${n > 1 ? ` on ${n} parts` : ''}.`);
		});
	}

	// --- action groups (plan 218) -----------------------------------------------------------------------

	/** The group the editor shows: a stock group id or `custom.<slot>`; null with the editor closed. */
	groupPick = $state<string | null>(null);
	/** Stock groups with members on the design, in order. */
	readonly stockGroups = $derived(
		stockGroupsOf(this.current.design, this.editorContent, this.loaded.actionGroups)
	);
	/** The picked group's custom slot, or null for a stock group. */
	readonly groupSlot = $derived(
		this.groupPick?.startsWith('custom.') ? Number(this.groupPick.slice(7)) : null
	);
	/** Parts in the picked group (the view lights them). */
	readonly groupParts = $derived.by(() => {
		const pick = this.groupPick;
		if (pick === null) return [];
		if (this.groupSlot !== null)
			return [...new Set(customMembers(this.current.design, this.groupSlot).map((m) => m.part))];
		return stockGroupParts(this.current.design, this.editorContent, pick);
	});
	/** The selected part's switches and triggers, with whether each is in the picked custom group. */
	readonly selectedGroupActions = $derived.by(() => {
		const sel = this.selected;
		if (sel === null || this.selectedLoose) return [];
		const members =
			this.groupSlot === null ? [] : customMembers(this.current.design, this.groupSlot);
		return groupActions(this.current.design, this.editorContent, sel).map((a) => ({
			...a,
			member: members.some((m) => m.part === sel && m.module === a.module && m.action === a.id)
		}));
	});

	pickGroup(id: string | null): void {
		this.groupPick = id;
		this.flagged = this.groupParts;
	}

	/** Puts the selected part's control (and its copies', unless "Only this part") in the picked custom group. */
	setGroupMember(module: string, action: string, on: boolean): void {
		const sel = this.selected;
		const slot = this.groupSlot;
		if (sel === null || slot === null) return;
		this.attempt(() => {
			this.editor = setGroupMember(
				this.editor,
				this.editorContent,
				slot,
				{ part: sel, module, action },
				on,
				{ single: this.onlyThis }
			);
			this.flagged = this.groupParts;
			this.say(`${on ? 'Added to' : 'Removed from'} Custom ${slot}.`);
		});
	}

	// --- crew seats (plan 218) ----------------------------------------------------------------------------

	/** Available crew of the active world (the page loads it). */
	roster = $state.raw<RosterMember[]>([]);
	readonly seats = $derived(seatsOf(this.current.design, this.lookup));
	readonly seated = $derived(this.current.design.crew ?? []);

	/** Seats `member` in the first free seat, or takes them out. */
	toggleCrew(member: string): void {
		this.attempt(() => {
			const next = toggleSeat(this.seated, this.seats, member);
			if (next.length === this.seated.length && !this.seated.some((s) => s.member === member)) {
				this.notice = 'Every seat is taken.';
				return;
			}
			this.editor = setCrew(this.editor, this.editorContent, next);
		});
	}

	/** Copies a placed part and what hangs on it onto the cursor (Alt-click, plan 217). */
	copyPart(index: number): void {
		const assembly = copyOf(this.editor, index);
		if (!assembly) return;
		const title = this.titleOfPart(index);
		this.armed = { kind: 'copy', assembly, title };
		this.afterArm(
			`Copied ${title}${assembly.parts.length > 1 ? ` and ${assembly.parts.length - 1} parts on it` : ''}.`
		);
		this.turn = tiltOf(assembly, index);
	}

	/**
	 * The carried thing let go over the catalogue (plan 217, ADR 0207 point 1): a carried part is
	 * deleted with what hangs on it (one undo step), a new part or a copy is put back.
	 */
	dropOnCatalogue(): void {
		const armed = this.armed;
		if (!armed || armed.kind === 'connect') return;
		if (armed.kind === 'carry') {
			const name = this.titleOfPart(armed.index);
			this.attempt(() => {
				this.editor = deleteSubtree(this.editor, this.editorContent, armed.index, {
					single: armed.single
				});
				this.say(`Deleted ${name}.`);
			});
		} else {
			this.say('Put back.');
		}
		this.disarm();
	}

	/** Turns the carried part about its parent's axes by `d` (plan 217). */
	turnCarried(d: Partial<DesignTilt>): void {
		const t = this.turn;
		const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
		this.turn = {
			x: wrap(t.x + (d.x ?? 0)),
			y: wrap(t.y + (d.y ?? 0)),
			z: wrap(t.z + (d.z ?? 0))
		};
	}

	/** Shift+Launch skips the Launch screen (plan 094, ADR 0150 point 4). */
	quickLaunch = false;

	launch(force = false, quick = this.quickLaunch): void {
		if (this.launchBlocked) return;
		this.quickLaunch = quick;
		if (this.warnings > 0 && !force) {
			this.confirmOpen = true;
			return;
		}
		saveDraft(serialiseDesign(this.editor.design));
		void this.flushSave();
		void goto(quick ? resolve('/(world)/flight') : resolve('/(world)/launch'));
	}

	// --- pointer ---------------------------------------------------------------------------------------------

	private pick(e: PointerEvent): ReturnType<VabView['pick']> {
		return (
			this.view?.pick(e.clientX, e.clientY, {
				ignoreGhost: this.armed !== null && this.radialCapable,
				ignoreNodes: this.armed !== null && !this.snapNodes
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
		if (this.grabHandle(e) || this.grabGizmo(e)) {
			this.drag = null;
			return;
		}
		const hit = e.button === 0 && !this.armed ? this.pick(e) : null;
		if (hit?.kind === 'part' && (e.altKey || this.copyMode)) {
			// Alt-click copies the part and what hangs on it onto the cursor (plan 217)
			this.copyMode = false;
			this.copyPart(Number(hit.key));
			this.drag = null;
			return;
		}
		this.drag = {
			x: e.clientX,
			y: e.clientY,
			moved: false,
			button: e.button,
			shift: e.shiftKey,
			...(hit?.kind === 'part' ? { part: hit.key } : {})
		};
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
		if (this.handleDrag) {
			this.dragHandle(e);
			return;
		}
		if (this.gizmoDrag) {
			this.dragGizmo(e);
			return;
		}
		if (this.toolTarget !== null && !this.drag && this.canvas) {
			const over = this.view?.gizmoAxisNear(e.clientX, e.clientY, GIZMO_PX) ?? null;
			this.canvas.style.cursor = over ? 'grab' : '';
		}
		const d = this.drag;
		if (d) {
			const dx = e.clientX - d.x;
			const dy = e.clientY - d.y;
			if (!d.moved && Math.hypot(dx, dy) < 4) return;
			if (
				!d.moved &&
				d.part !== undefined &&
				d.button === 0 &&
				!d.shift &&
				!this.armed &&
				this.tool === 'place'
			) {
				// a drag from a placed part picks it up with what hangs on it (plan 217)
				this.drag = null;
				this.selected = Number(d.part);
				this.carrySelected();
				this.dragCarry = true;
			}
		}
		if (this.drag) {
			const d = this.drag;
			const dx = e.clientX - d.x;
			const dy = e.clientY - d.y;
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
			this.pointerTarget = this.siteFromHit(hit, e.altKey);
			// a ring near the pointer glows, and the nearest one in snap range wins over a face
			// (with node snapping off, plan 279, no ring is in play)
			const near = this.snapNodes ? this.ringsNear(e) : { glow: new Set<number>(), snap: null };
			this.nearTargets = near.glow;
			if (near.snap !== null) {
				this.hoverNode = near.snap;
				this.pointerTarget = null;
			}
			this.freePoint =
				this.pointerTarget || this.hoverNode !== null || hit?.kind === 'ghost'
					? null
					: (this.view?.cursorPoint(e.clientX, e.clientY) ?? null);
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
		if (this.handleDrag) {
			this.releaseHandle();
			return;
		}
		if (this.gizmoDrag) {
			this.releaseGizmo();
			return;
		}
		if (this.dragCarry) {
			this.dragCarry = false;
			this.letGo(e);
			return;
		}
		if (d && !d.moved && d.button === 1 && d.part !== undefined) {
			// a middle click centres the view on the part (plan 217)
			this.view?.focusOn(d.part);
			return;
		}
		if (!d || d.moved || d.button !== 0) return;
		if (this.fairingEdit && this.selectedFairing && !this.armed) {
			// fairing edit mode (plan 219, 243): a click on the shell adds a section at that height
			const over = this.pick(e);
			const sel = this.selected;
			const at = layoutOf(this.shown.design, this.lookup)?.get(sel ?? -1);
			if (over?.kind === 'part' && Number(over.key) === sel && at && !at.tilted) {
				const y = over.point[1] - at.position.y;
				this.attempt(() => {
					this.editor = addFairingSectionAt(this.editor, this.editorContent, sel!, y);
					this.say('Fairing: a section at that height.');
				});
			} else {
				this.addFairingSection();
			}
			return;
		}
		const hit = this.pick(e);
		if (this.armed?.kind === 'connect') {
			const end = hit?.kind === 'part' ? this.endAt(Number(hit.key), hit.point, e.altKey) : null;
			if (end) this.pickConnectorEnd(end);
			else if (hit?.kind === 'part') this.notice = 'A strut or fuel line joins two ordinary parts.';
		} else if (this.armed) {
			const site = this.siteFromHit(hit, e.altKey);
			const snap = this.snapNodes ? this.ringsNear(e).snap : null;
			if (hit?.kind === 'node') this.place(Number(hit.key.slice(1)));
			else if (snap !== null) this.place(snap);
			else if (site) this.placeAt(site);
			else if (hit?.kind === 'ghost' && this.active !== null) this.place(this.active);
		} else if (hit?.kind === 'part' && d.shift) {
			// Shift-click picks up the whole vessel (or loose assembly) the part belongs to (plan 244)
			const at = Number(hit.key);
			const whole = [this.editor.design, ...this.editor.loose].find((a) =>
				a.parts.some((p) => p.index === at)
			);
			this.selected = whole ? rootOf(whole) : at;
			this.carrySelected();
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
		if (this.handleDrag) {
			this.handleDrag = null;
			this.preview = null;
		}
		if (this.gizmoDrag) {
			this.gizmoDrag = null;
			this.gizmoActive = null;
			this.preview = null;
		}
	};
	pointerLeave = (): void => {
		this.hoverNode = null;
		this.pointerTarget = null;
		this.freePoint = null;
		this.nearTargets = new Set();
		this.view?.setHover(null);
	};
	/** Rings within reach of the pointer: those that glow and the one a click would snap to (plan 244). */
	private ringsNear(e: PointerEvent): { glow: Set<number>; snap: number | null } {
		const r = this.view?.nodesNearPointer(e.clientX, e.clientY, GLOW_PX, SNAP_PX);
		const index = (key: string): number => Number(key.slice(1));
		return {
			glow: new Set((r?.glow ?? []).map(index)),
			snap: r?.snap != null ? index(r.snap) : null
		};
	}
	/**
	 * A dragged part let go (plan 217): over the catalogue it is deleted; over a ring or a side it is
	 * placed; anywhere else it stays on the floor as a loose assembly. Each is one undo step.
	 */
	private letGo(e: PointerEvent): void {
		const armed = this.armed;
		if (armed?.kind !== 'carry') return;
		const r = this.leftEl?.getBoundingClientRect();
		if (
			r &&
			e.clientX >= r.left &&
			e.clientX <= r.right &&
			e.clientY >= r.top &&
			e.clientY <= r.bottom
		) {
			this.dropOnCatalogue();
			return;
		}
		const hit = this.pick(e);
		const site = this.siteFromHit(hit, e.altKey);
		const snap = this.snapNodes ? this.ringsNear(e).snap : null;
		if (hit?.kind === 'node') this.place(Number(hit.key.slice(1)));
		else if (snap !== null) this.place(snap);
		else if (site) this.placeAt(site);
		else if (hit?.kind === 'ghost' && this.active !== null) this.place(this.active);
		else {
			const index = armed.index;
			this.disarm();
			if (!this.editor.loose.some((a) => a.parts.some((p) => p.index === index))) {
				this.attempt(() => {
					this.editor = detach(this.editor, this.editorContent, index, { single: armed.single });
					this.say(`${this.titleOfPart(index)} stays on the floor.`);
				});
			}
		}
	}

	wheel = (e: WheelEvent): void => {
		e.preventDefault();
		// the turntable (plan 217, ADR 0207 point 4): the wheel moves the view up and down the
		// vessel; with Shift or Ctrl (a trackpad pinch) it zooms
		if (e.shiftKey || e.ctrlKey || e.metaKey) this.view?.zoomBy(Math.exp(e.deltaY * 0.0012));
		else this.view?.raiseBy(-e.deltaY * 0.01);
	};

	// --- keyboard --------------------------------------------------------------------------------------------

	private cycle(step: number): void {
		if (this.held) {
			this.keyboardRadial = true;
			this.freePoint = null;
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
		// while a part rides the cursor its own keys come first (plan 217, ADR 0207 point 3)
		if (this.armed && this.armed.kind !== 'connect') {
			const turn = settings.keymap.actionFor('carry', keyIdOf(e));
			const step = e.shiftKey ? TURN_FINE : TURN_STEP;
			const turns: Partial<Record<string, Partial<DesignTilt>>> = {
				pitchUp: { x: step },
				pitchDown: { x: -step },
				yawLeft: { y: step },
				yawRight: { y: -step },
				rollLeft: { z: step },
				rollRight: { z: -step }
			};
			if (turn && turns[turn]) {
				e.preventDefault();
				this.turnCarried(turns[turn]!);
				return;
			}
			if (turn === 'turnReset') {
				e.preventDefault();
				this.turn = NO_TILT;
				this.say('Turn reset.');
				return;
			}
			if (turn === 'angleSnap') {
				e.preventDefault();
				this.angleSnap = !this.angleSnap;
				this.say(this.angleSnap ? 'Angle snap on.' : 'Angle snap off.');
				return;
			}
		}
		// the Move and Rotate tools' keys while a part is selected (plan 279, ADR 0258 point 3)
		if (this.toolTarget !== null) {
			const act = settings.keymap.actionFor('tool', keyIdOf(e));
			if (act && this.toolKey(act, e.shiftKey)) {
				e.preventDefault();
				return;
			}
		}
		this.fineSnap = e.shiftKey;
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
			case 'toolPlace':
			case 'toolMove':
			case 'toolRotate':
				this.setTool(action === 'toolMove' ? 'move' : action === 'toolRotate' ? 'rotate' : 'place');
				return;
			case 'snapNodes':
				this.toggleSnapNodes();
				return;
			case 'frame':
				this.view?.frame();
				return;
			case 'delete':
				if (this.selected === null || this.armed) return;
				e.preventDefault();
				this.removeSelected(e.shiftKey);
				return;
			case 'symmetry': {
				if (this.armed?.kind === 'carry' || !this.armed) return;
				// X up, Shift+X down (plan 217)
				const n = SYMMETRY_COUNTS.length;
				const at = SYMMETRY_COUNTS.indexOf(this.symmetry as 1);
				this.symmetry = SYMMETRY_COUNTS[(at + (e.shiftKey ? n - 1 : 1)) % n]!;
				this.mirror = false;
				this.say(this.symmetry === 1 ? 'Symmetry off.' : `${this.symmetry}-way symmetry.`);
				return;
			}
			case 'mirror':
				this.mirror = !this.mirror;
				this.say(this.mirror ? 'Mirror symmetry on.' : 'Mirror symmetry off.');
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
