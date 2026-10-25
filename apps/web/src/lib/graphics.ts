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
	type GraphicsPreset,
	type LookChoices
} from '@orbital/renderer/presets';

import { deviceTier, refreshOf, tierOf } from '@orbital/renderer/device-tier';
import { scaledCapFor, setScaledSpaceCap } from '@orbital/renderer/scaled-space-model';
import {
	parseRendererChoice,
	rendererBackendFrom,
	resolveRendererBackend,
	type RendererBackend,
	type RendererChoice
} from '@orbital/renderer/backend';

const KEY = 'orbital.graphics';

/**
 * The preset a player who never chose one gets (owner, 2026-10-25): Low, set as if chosen by hand, so
 * the governor does not climb. Choosing Automatic in Settings stores `auto` and brings back the device
 * default and the governor.
 */
export const DEFAULT_PRESET: GraphicsPreset = 'low';
const AUTO = 'auto';

/** The stored choice: a preset, `auto` for Automatic, or the default when nothing is stored. Pure (tested). */
export function presetFromStored(raw: string | null): GraphicsPreset | null {
	if (raw === null) return DEFAULT_PRESET;
	if (raw === AUTO) return null;
	return parsePreset(raw);
}

export function loadGraphicsPreset(): GraphicsPreset | null {
	try {
		return presetFromStored(localStorage.getItem(KEY));
	} catch {
		return DEFAULT_PRESET;
	}
}

export function saveGraphicsPreset(preset: GraphicsPreset): void {
	try {
		localStorage.setItem(KEY, preset);
	} catch {
		// private mode or quota: the choice applies for this session only
	}
}

/** The settings dialog's "Automatic": the device default and the governor apply (stored as `auto`). */
export function clearGraphicsPreset(): void {
	try {
		localStorage.setItem(KEY, AUTO);
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
 * fixed preset always did), `120`, `60` and `30` pace the drawing down to save battery and heat. The
 * governor aims at 120 on a 120 Hz screen of a tier that holds it (plan 395, ADR 0338); on battery,
 * with no choice saved, the limit is 60.
 */
export type FrameCapChoice = 'display' | '120' | '60' | '30';
const FPS_KEY = 'orbital.graphics.fps';

export const parseFrameCap = (value: unknown): FrameCapChoice =>
	value === '120' || value === '60' || value === '30' ? value : 'display';

/** The cap as the governor takes it: null for the display's rate. */
export const frameCapFps = (choice: FrameCapChoice): number | null =>
	choice === 'display' ? null : Number(choice);

/** Whether the player ever chose a frame-rate limit (the battery default applies only when not). */
export function hasSavedFrameCap(): boolean {
	try {
		return localStorage.getItem(FPS_KEY) !== null;
	} catch {
		return false;
	}
}

/**
 * The limit a battery imposes (plan 395, 02 §1): 60 while unplugged and the player chose none, else
 * none. `charging` is null where the browser does not say (Safari, Firefox): no limit.
 */
export const batteryFrameCap = (saved: boolean, charging: boolean | null): number | null =>
	!saved && charging === false ? 60 : null;

/** Safari's user agent: it holds 60 whatever the screen does (no 120 Hz requestAnimationFrame there). */
export const isSafari = (userAgent: string): boolean =>
	/safari/i.test(userAgent) && !/chrome|chromium|crios|fxios|edg|opr|android/i.test(userAgent);

/** The most the governor is asked to lock at here, Hz: the GPU's tier, 60 in Safari (plan 395). */
export function lockCeiling(caps: DeviceCapabilities, userAgent = ''): 120 | 60 | 30 {
	const tier = tierOf(caps.gpu ?? '', caps.mobile === true);
	return isSafari(userAgent) ? (Math.min(tier.maxHz, 60) as 60 | 30) : tier.maxHz;
}

/** The display's refresh rate from rAF periods at load, before the game loads the machine; 0 until known. */
let refreshHz = 0;
let refreshProbing = false;
/** Home's baked faces are 2048 only on a tier that can pay for them (plan 403): 1536 until the GPU is known. */
function applyScaledCap(gpu: string | undefined, mobile: boolean): void {
	if (!gpu) return;
	const tier = deviceTier({ gpu, refreshHz: refreshHz || 60, mobile });
	setScaledSpaceCap(scaledCapFor(tier, refreshHz));
}
let probedGpu: { gpu: string; mobile: boolean } | null = null;
export const measuredRefreshHz = (): number => refreshHz;
export function probeRefreshHz(frames = 45): void {
	if (refreshProbing || typeof requestAnimationFrame !== 'function') return;
	refreshProbing = true;
	const periods: number[] = [];
	let last = 0;
	const step = (now: number): void => {
		if (last > 0) periods.push(now - last);
		last = now;
		if (periods.length < frames) requestAnimationFrame(step);
		else {
			refreshHz = refreshOf(periods);
			if (probedGpu) applyScaledCap(probedGpu.gpu, probedGpu.mobile);
		}
	};
	requestAnimationFrame(step);
}

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
		if (gpu) {
			probedGpu = { gpu, mobile: base.mobile === true };
			applyScaledCap(gpu, base.mobile === true);
		}
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
	/** The TAAU input scale of the rung (plan 395); absent: the preset's own. */
	taau?: number;
}

/** The learned-level key: per backend, and per lock target where it is 120 (plan 395). */
export const learnedKey = (backend: string, targetHz: number): string =>
	targetHz >= 120 ? `${backend}@120` : backend;

/** A stored learned level for `backend`, or null when absent or not valid. Pure (tested). */
export function parseLearnedLevel(value: unknown, backend: string): LearnedLevel | null {
	if (typeof value !== 'string') return null;
	try {
		const all = JSON.parse(value) as Record<
			string,
			{ preset?: unknown; scale?: unknown; taau?: unknown }
		>;
		const entry = all?.[backend];
		const preset = parsePreset(entry?.preset);
		const scale = Number(entry?.scale);
		if (!preset || !Number.isFinite(scale) || scale <= 0 || scale > 1) return null;
		const taau = Number(entry?.taau);
		return Number.isFinite(taau) && taau >= 0 && taau <= 1 && entry?.taau !== undefined
			? { preset, scale, taau }
			: { preset, scale };
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
		all[backend] = {
			preset: level.preset,
			scale: Math.round(level.scale * 100) / 100,
			...(level.taau !== undefined ? { taau: Math.round(level.taau * 100) / 100 } : {})
		};
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
	start: GraphicsPreset,
	/**
	 * The highest preset Automatic may try on this device (plan 408): a base M2 or an integrated GPU starts on
	 * `low`, and a governor that climbs to `high` on trials stutters at every failed one (the owner's M2: stable
	 * at Low, periodic stutter on Automatic); the player can still choose `high` by hand.
	 */
	limit: GraphicsPreset = 'high'
): GraphicsPreset {
	return saved ?? (adjust ? limit : start);
}

/** The preset Automatic may climb to on a device that starts on `start` and locks at `maxHz`: `medium` for a 60 Hz tier that starts on `low`. */
export const autoLimitFor = (start: GraphicsPreset, maxHz: number): GraphicsPreset =>
	start === 'low' && maxHz <= 60 ? 'medium' : 'high';

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
	/** The TAAU share the governor's fast axis uses, warmed at load on a tier that locks at 120 (plan 395); 0 elsewhere. */
	warmTaau: number;
} {
	const saved = loadGraphicsPreset();
	const preset = startPreset(saved, saved ? null : loadLearnedLevel(backend), probeCapabilities());
	const adjust = loadAutoQuality();
	const caps = probeCapabilities();
	return {
		preset,
		warmPresets: warmPresetsFor(
			preset,
			adjust,
			governorCeiling(
				saved,
				adjust,
				preset,
				autoLimitFor(preset, lockCeiling(caps, globalThis.navigator?.userAgent ?? ''))
			)
		),
		warmTaau: adjust && lockCeiling(caps, globalThis.navigator?.userAgent ?? '') >= 120 ? 0.75 : 0
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

/** How long the WebGPU adapter may take to answer before the game draws with WebGL (plan 388). */
export const ADAPTER_TIMEOUT_MS = 4_000;

/** `p`, or `fallback` when it has not settled after `ms`. */
export function settleWithin<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
	return new Promise<T>((resolve) => {
		const timer = setTimeout(() => resolve(fallback), ms);
		p.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			() => {
				clearTimeout(timer);
				resolve(fallback);
			}
		);
	});
}

/**
 * Whether the browser has a WebGPU adapter, asked once. `navigator.gpu` alone is not enough: a
 * browser without a usable GPU (headless, a blocked driver) has the object and no adapter, and
 * three's WebGPU renderer then runs on its WebGL2 fallback, slower than the WebGL renderer. With
 * software rendering (SwiftShader) `requestAdapter` can also never answer: after
 * `ADAPTER_TIMEOUT_MS` the answer is no (plan 388).
 */
let webgpuProbe: Promise<boolean> | null = null;
export function hasWebGPUAdapter(): Promise<boolean> {
	const gpu = (
		globalThis.navigator as
			(Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }) | undefined
	)?.gpu;
	webgpuProbe ??= gpu
		? settleWithin(
				gpu.requestAdapter().then((a) => a !== null && a !== undefined),
				ADAPTER_TIMEOUT_MS,
				false
			)
		: Promise.resolve(false);
	return webgpuProbe;
}

/**
 * The tab's fallback renderer (plan 388): set when WebGPU did not start in time, so the reloaded
 * page draws with WebGL. Kept for the tab's session only; the player's choice is untouched.
 */
const FALLBACK_KEY = 'orbital.graphics.fallback';

export function loadRendererFallback(): RendererBackend | null {
	try {
		return sessionStorage.getItem(FALLBACK_KEY) === 'webgl' ? 'webgl' : null;
	} catch {
		return null;
	}
}

export function saveRendererFallback(backend: RendererBackend | null): void {
	try {
		if (backend) sessionStorage.setItem(FALLBACK_KEY, backend);
		else sessionStorage.removeItem(FALLBACK_KEY);
	} catch {
		// private mode: the reload asks for WebGL on its address instead
	}
}

/** The backend a view draws with: the address's, else the tab's fallback, else the player's choice (Automatic: WebGPU where an adapter exists). */
export async function rendererBackend(): Promise<RendererBackend> {
	const search = globalThis.location?.search ?? '';
	const fallback = loadRendererFallback();
	if (fallback && !rendererBackendFrom(search)) return fallback;
	return resolveRendererBackend(search, loadRendererChoice(), await hasWebGPUAdapter());
}

/** A graphics setting the player changed in Settings, wherever the dialog was opened. */
export type GraphicsChange =
	| { kind: 'preset'; choice: PresetChoice }
	| { kind: 'brightness'; level: number }
	| { kind: 'auto'; on: boolean }
	| { kind: 'frameCap'; choice: FrameCapChoice }
	/** The levels the player pinned for the looks (plan 404); the world's renderer applies them. */
	| { kind: 'looks'; looks: LookChoices }
	/** The resolution scale the player pinned, or null for the governor's. */
	| { kind: 'scale'; scale: number | null };

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
