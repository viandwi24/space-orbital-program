/**
 * Graphics preset selection and persistence for the flight view (plan 019, ADR 0027). The
 * renderer owns the presets; the host decides which one is active: the player's saved choice,
 * else the device default from a quick capability probe. The settings screen (plan 023) calls
 * `saveGraphicsPreset` and `Flight.setGraphicsPreset`.
 */
// The preset table has no Three.js in it: the main menu reads the saved choice through this subpath
// without loading the renderer (plan 023, bundle budget).
import {
	parsePreset,
	selectPreset,
	type DeviceCapabilities,
	type GraphicsPreset
} from '@orbital/renderer/presets';

import {
	parseRendererChoice,
	resolveRendererBackend,
	type RendererBackend,
	type RendererChoice
} from '@orbital/renderer/backend';

const KEY = 'orbital.graphics';

export function loadGraphicsPreset(): GraphicsPreset | null {
	try {
		return parsePreset(localStorage.getItem(KEY));
	} catch {
		return null;
	}
}

export function saveGraphicsPreset(preset: GraphicsPreset): void {
	try {
		localStorage.setItem(KEY, preset);
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/** Forget the saved choice: the device default applies again (the settings dialog's "Automatic"). */
export function clearGraphicsPreset(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// private mode: the choice applies for this session only
	}
}

/** The player's choice for the settings dialog: a preset, or `auto` for the device default. */
export type PresetChoice = GraphicsPreset | 'auto';

export const presetChoice = (): PresetChoice => loadGraphicsPreset() ?? 'auto';

/**
 * The quality governor (plan 039, ADR 0053) lowers resolution and then the preset when the view runs
 * under about 55 fps. On unless the player turned it off; only the string `off` is a no.
 */
const AUTO_KEY = 'orbital.graphics.auto';

export const parseAutoQuality = (value: unknown): boolean => value !== 'off';

export function loadAutoQuality(): boolean {
	try {
		return parseAutoQuality(localStorage.getItem(AUTO_KEY));
	} catch {
		return true;
	}
}

export function saveAutoQuality(on: boolean): void {
	try {
		localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/**
 * The frame-rate limit (plan 362, ADR 0304): `display` draws at the display's rate (the default, as a
 * fixed preset always did), `60` and `30` pace the drawing down to save battery and heat.
 */
export type FrameCapChoice = 'display' | '60' | '30';
const FPS_KEY = 'orbital.graphics.fps';

export const parseFrameCap = (value: unknown): FrameCapChoice =>
	value === '60' || value === '30' ? value : 'display';

/** The cap as the governor takes it: null for the display's rate. */
export const frameCapFps = (choice: FrameCapChoice): number | null =>
	choice === 'display' ? null : Number(choice);

export function loadFrameCap(): FrameCapChoice {
	try {
		return parseFrameCap(localStorage.getItem(FPS_KEY));
	} catch {
		return 'display';
	}
}

export function saveFrameCap(choice: FrameCapChoice): void {
	try {
		if (choice === 'display') localStorage.removeItem(FPS_KEY);
		else localStorage.setItem(FPS_KEY, choice);
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/** Reads GPU facts from a throwaway WebGL2 context; returns conservative values when WebGL is missing. */
export function probeCapabilities(): DeviceCapabilities {
	const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
	const base: DeviceCapabilities = {
		maxTextureSize: 4096,
		...(nav?.deviceMemory !== undefined ? { deviceMemoryGb: nav.deviceMemory } : {}),
		...(nav?.hardwareConcurrency !== undefined
			? { hardwareConcurrency: nav.hardwareConcurrency }
			: {}),
		mobile: Boolean(
			nav?.maxTouchPoints &&
			nav.maxTouchPoints > 1 &&
			/Mobi|Android|iPhone|iPad/i.test(nav.userAgent)
		)
	};
	try {
		const gl = document.createElement('canvas').getContext('webgl2');
		if (!gl) return base;
		const ext = gl.getExtension('WEBGL_debug_renderer_info');
		const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : undefined;
		const out: DeviceCapabilities = {
			...base,
			maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
			...(gpu ? { gpu } : {})
		};
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return out;
	} catch {
		return base;
	}
}

/** The saved preset if valid, else the device default. Pure given its inputs (tested). */
export function resolvePreset(
	saved: GraphicsPreset | null,
	caps: DeviceCapabilities
): GraphicsPreset {
	return saved ?? selectPreset(caps);
}

/**
 * The level the governor last settled at on this device and backend (plan 362, ADR 0304): Automatic
 * starts there instead of at a guess from the GPU's name. Saved whenever the governor moves.
 */
const LEARNED_KEY = 'orbital.graphics.learned';

export interface LearnedLevel {
	preset: GraphicsPreset;
	scale: number;
}

/** A stored learned level for `backend`, or null when absent or not valid. Pure (tested). */
export function parseLearnedLevel(value: unknown, backend: string): LearnedLevel | null {
	if (typeof value !== 'string') return null;
	try {
		const all = JSON.parse(value) as Record<string, { preset?: unknown; scale?: unknown }>;
		const entry = all?.[backend];
		const preset = parsePreset(entry?.preset);
		const scale = Number(entry?.scale);
		if (!preset || !Number.isFinite(scale) || scale <= 0 || scale > 1) return null;
		return { preset, scale };
	} catch {
		return null;
	}
}

export function loadLearnedLevel(backend: string): LearnedLevel | null {
	try {
		return parseLearnedLevel(localStorage.getItem(LEARNED_KEY), backend);
	} catch {
		return null;
	}
}

export function saveLearnedLevel(backend: string, level: LearnedLevel): void {
	try {
		let all: Record<string, LearnedLevel> = {};
		try {
			all = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? '{}') ?? {};
		} catch {
			all = {};
		}
		all[backend] = { preset: level.preset, scale: Math.round(level.scale * 100) / 100 };
		localStorage.setItem(LEARNED_KEY, JSON.stringify(all));
	} catch {
		// private mode or quota: the next session guesses again
	}
}

/**
 * The preset a view starts with: the player's choice, else (Automatic) the level the governor learned
 * on this backend, else the device default. Pure given its inputs (tested).
 */
export function startPreset(
	saved: GraphicsPreset | null,
	learned: LearnedLevel | null,
	caps: DeviceCapabilities
): GraphicsPreset {
	return saved ?? learned?.preset ?? selectPreset(caps);
}

/**
 * The governor's ceiling (plan 362): the player's choice, else, Automatic with "Adjust quality while
 * playing" on, the top preset: the governor finds what this machine holds by measuring, not by the
 * GPU's name. Automatic with it off keeps the start preset.
 */
export function governorCeiling(
	saved: GraphicsPreset | null,
	adjust: boolean,
	start: GraphicsPreset
): GraphicsPreset {
	return saved ?? (adjust ? 'high' : start);
}

/**
 * The presets the governor can reach from the start, drawn after load so a move builds no shader in
 * flight (plan 362, ADR 0304; every reachable one since plan 373, ADR 0310: low, then medium, then
 * high reached an unwarmed `high` mid-orbit, 1.4 s on the M2; plan 370 warms them in the background,
 * not on the loading screen, and the governor waits for them): none while it may not adjust, else every
 * other preset up to the ceiling, nearest first. Pure (tested).
 */
export function warmPresetsFor(
	start: GraphicsPreset,
	adjust: boolean,
	ceiling: GraphicsPreset
): GraphicsPreset[] {
	if (!adjust) return [];
	const order: readonly GraphicsPreset[] = ['low', 'medium', 'high'];
	const at = order.indexOf(start);
	const top = order.indexOf(ceiling);
	return order
		.map((p, i) => ({ p, i }))
		.filter(({ i }) => i !== at && i <= top)
		.sort((a, b) => Math.abs(a.i - at) - Math.abs(b.i - at) || a.i - b.i)
		.map(({ p }) => p);
}

/** What a view's renderer starts with: the preset and the presets to warm at load (plan 362). */
export function graphicsStart(backend: string): {
	preset: GraphicsPreset;
	warmPresets: GraphicsPreset[];
} {
	const saved = loadGraphicsPreset();
	const preset = startPreset(saved, saved ? null : loadLearnedLevel(backend), probeCapabilities());
	const adjust = loadAutoQuality();
	return {
		preset,
		warmPresets: warmPresetsFor(preset, adjust, governorCeiling(saved, adjust, preset))
	};
}

/** The preset the flight view should start with (`backend`: the learned level's key). */
export const initialGraphicsPreset = (backend?: string): GraphicsPreset =>
	startPreset(
		loadGraphicsPreset(),
		backend ? loadLearnedLevel(backend) : null,
		probeCapabilities()
	);

/**
 * The renderer (plan 261, ADR 0249): Automatic (the default) draws with the newest the browser can
 * run, WebGPU where it has it; WebGL is the older one. Read when a view creates its renderer, so a
 * change applies when the page is next opened. `?renderer=` on the address still overrides it.
 */
const RENDERER_KEY = 'orbital.graphics.renderer';

export function loadRendererChoice(): RendererChoice {
	try {
		return parseRendererChoice(localStorage.getItem(RENDERER_KEY));
	} catch {
		return 'auto';
	}
}

export function saveRendererChoice(choice: RendererChoice): void {
	try {
		if (choice === 'auto') localStorage.removeItem(RENDERER_KEY);
		else localStorage.setItem(RENDERER_KEY, choice);
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/**
 * Whether the browser has a WebGPU adapter, asked once. `navigator.gpu` alone is not enough: a
 * browser without a usable GPU (headless, a blocked driver) has the object and no adapter, and
 * three's WebGPU renderer then runs on its WebGL2 fallback, slower than the WebGL renderer.
 */
let webgpuProbe: Promise<boolean> | null = null;
export function hasWebGPUAdapter(): Promise<boolean> {
	const gpu = (
		globalThis.navigator as
			(Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }) | undefined
	)?.gpu;
	webgpuProbe ??= gpu
		? gpu
				.requestAdapter()
				.then((a) => a !== null && a !== undefined)
				.catch(() => false)
		: Promise.resolve(false);
	return webgpuProbe;
}

/** The backend a view draws with: the address's, else the player's choice (Automatic: WebGPU where an adapter exists). */
export async function rendererBackend(): Promise<RendererBackend> {
	return resolveRendererBackend(
		globalThis.location?.search ?? '',
		loadRendererChoice(),
		await hasWebGPUAdapter()
	);
}

/** A graphics setting the player changed in Settings, wherever the dialog was opened. */
export type GraphicsChange =
	| { kind: 'preset'; choice: PresetChoice }
	| { kind: 'brightness'; level: number }
	| { kind: 'auto'; on: boolean }
	| { kind: 'frameCap'; choice: FrameCapChoice };

const changes = new EventTarget();

/**
 * Tell the page drawing now that a graphics setting changed, so it applies at once. The world's
 * Settings dialog can be opened from any page (the layout's menu), and only the page's own loop
 * knows its renderer and governor (owner, 2026-10-22: changes only applied after a reload).
 */
export function emitGraphicsChange(change: GraphicsChange): void {
	changes.dispatchEvent(new CustomEvent('change', { detail: change }));
}

/** Listen for graphics changes; returns the unsubscribe. */
export function onGraphicsChange(listener: (change: GraphicsChange) => void): () => void {
	const handler = (e: Event): void => listener((e as CustomEvent<GraphicsChange>).detail);
	changes.addEventListener('change', handler);
	return () => changes.removeEventListener('change', handler);
}

const BRIGHTNESS_KEY = 'orbital.graphics.brightness';

/** The Brightness setting, -1 (one stop darker) to 1 (one stop brighter); 0, the balance, by default. */
export function loadBrightness(): number {
	try {
		const v = Number(localStorage.getItem(BRIGHTNESS_KEY));
		return Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0;
	} catch {
		return 0;
	}
}

export function saveBrightness(level: number): void {
	try {
		localStorage.setItem(BRIGHTNESS_KEY, String(Math.min(1, Math.max(-1, level))));
	} catch {
		// private mode: the level holds for this session only
	}
}
